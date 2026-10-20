import { errors, type BrowserContext, type Locator, type Page } from 'playwright'
import { launchProfile } from './launch'

// All YouTube DOM selectors for posting live here. On breakage edit only this object
// and log the changed selector + date in the issue's ## Comments.
// Never select by visible text: the UI language follows the Google account, not the browser locale.
export const SELECTORS = {
  avatar: 'button#avatar-btn',
  comments: 'ytd-comments#comments',
  placeholder: '#placeholder-area',
  editor: '#contenteditable-root',
  submit: '#submit-button button, #submit-button',
  thread: 'ytd-comment-thread-renderer',
  threadAuthor: '#author-text',
  threadContent: '#content-text',
  commentsOff: 'ytd-message-renderer',
}

export type PostProgress = 'opening_profile' | 'typing' | 'posted' | 'verified'
export type FailureReason = 'not_logged_in' | 'comments_disabled' | 'element_not_found' | 'timeout' | 'unknown'
export const FAILURE_LABELS: Record<FailureReason, string> = {
  not_logged_in: '로그인 안 됨',
  comments_disabled: '댓글 비활성 영상',
  element_not_found: '요소 못 찾음',
  timeout: '시간 초과',
  unknown: '알 수 없음',
}
export type PostResult = { ok: true; screenshotPath: string } | { ok: false; reason: FailureReason; message: string; screenshotPath: string | null }
// verifyComment also reports the authors of every thread whose body matched the text, to diagnose author mismatches.
export type VerifyResult = PostResult & { authors: string[] }

const WATCH_URL = 'https://www.youtube.com/watch?v='
const AVATAR_WAIT_MS = 8_000
const ELEMENT_WAIT_MS = 10_000
const SCROLL_STEPS = 10
const SCROLL_DELTA_Y = 600
const SCROLL_SETTLE_MS = 1_000
const VERIFY_TIMEOUT_MS = 30_000
const VERIFY_POLL_MS = 1_000
const VERIFIED_HOLD_MS = 3_000
const HIGHLIGHT = '3px solid #e11d48'

// Page callbacks are sent to the browser as source text. tsx (esbuild keepNames) rewrites named functions inside
// them as `__name(fn, "fn")`, which the page does not define (ReferenceError on the first live post). This identity
// shim, kept as a string so no compiler rewrites it, runs before page scripts in every document of the context.
const NAME_SHIM = 'if (typeof globalThis.__name !== "function") globalThis.__name = function (f) { return f }'

// A classified failure raised by our own checks; anything else is classified in classify().
class PostFailure extends Error {
  constructor(public reason: FailureReason, detail?: string) {
    super(detail ? `${FAILURE_LABELS[reason]}: ${detail}` : FAILURE_LABELS[reason])
  }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const rand = (a: number, b: number) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + Math.floor(Math.random() * (hi - lo + 1)) }
const firstLine = (err: unknown) => (err instanceof Error ? err.message : String(err)).split('\n')[0]

// A selector that never shows up is element_not_found, not a generic timeout.
async function need(loc: Locator, what: string, timeout = ELEMENT_WAIT_MS): Promise<void> {
  await loc.waitFor({ state: 'visible', timeout }).catch((err: unknown) => {
    if (err instanceof errors.TimeoutError) throw new PostFailure('element_not_found', what)
    throw err
  })
}

function classify(err: unknown): { reason: FailureReason; message: string } {
  if (err instanceof PostFailure) return { reason: err.reason, message: err.message }
  if (err instanceof errors.TimeoutError) return { reason: 'timeout', message: `${FAILURE_LABELS.timeout}: ${firstLine(err)}` }
  return { reason: 'unknown', message: `${FAILURE_LABELS.unknown}: ${firstLine(err)}` }
}

// Launches the profile, runs `body` on its page, and turns any throw into a classified failure with a screenshot.
// The context is always closed.
async function onProfilePage(userDataDir: string, screenshotPath: string, body: (page: Page) => Promise<PostResult>): Promise<PostResult> {
  let context: BrowserContext | null = null
  let page: Page | null = null
  try {
    context = await launchProfile(userDataDir)
    await context.addInitScript(NAME_SHIM)
    page = context.pages()[0] ?? (await context.newPage())
    return await body(page)
  } catch (err) {
    const { reason, message } = classify(err)
    const shot = page
      ? await page.screenshot({ path: screenshotPath, fullPage: false }).then(() => screenshotPath, () => null)
      : null
    return { ok: false, reason, message, screenshotPath: shot }
  } finally {
    await context?.close().catch(() => undefined)
  }
}

// Steps 1-3 (read-only): open the video, require login, scroll until the comment area renders.
async function openComments(page: Page, videoId: string): Promise<{ comments: Locator; placeholder: Locator }> {
  await page.goto(WATCH_URL + encodeURIComponent(videoId), { waitUntil: 'domcontentloaded' })

  // 로그인 확인: 아바타가 대기 시간 안에 안 보이면 로그인 안 됨
  const loggedIn = await page.locator(SELECTORS.avatar).first().waitFor({ state: 'visible', timeout: AVATAR_WAIT_MS }).then(
    () => true,
    (err: unknown) => {
      if (err instanceof errors.TimeoutError) return false
      throw err
    },
  )
  if (!loggedIn) throw new PostFailure('not_logged_in')

  // ytd-comments 는 지연 렌더링이라, 입력창(또는 댓글 사용 중지 안내)이 뜰 때까지 휠로 내린다.
  const comments = page.locator(SELECTORS.comments)
  const placeholder = comments.locator(SELECTORS.placeholder).first()
  const commentsOff = comments.locator(SELECTORS.commentsOff).first()
  for (let i = 0; ; i++) {
    if (await commentsOff.isVisible()) throw new PostFailure('comments_disabled')
    if (await placeholder.isVisible()) break
    if (i >= SCROLL_STEPS) throw new PostFailure('element_not_found', '댓글 영역')
    await page.mouse.wheel(0, SCROLL_DELTA_Y)
    await page.waitForTimeout(SCROLL_SETTLE_MS)
  }
  return { comments, placeholder }
}

type ThreadText = { author: string; content: string }

// The page side only extracts text (no helpers, no logic); matching runs in Node in matchThread().
async function readThreads(comments: Locator): Promise<ThreadText[]> {
  return comments.locator(SELECTORS.thread).evaluateAll(
    (els, s) => els.map((el) => ({ author: el.querySelector(s.author)?.textContent ?? '', content: el.querySelector(s.content)?.textContent ?? '' })),
    { author: SELECTORS.threadAuthor, content: SELECTORS.threadContent },
  )
}

// Comments show the author as an @handle. The expected author is the profile's handle, or its display name when the
// handle could not be read. A handle must match exactly (ignoring '@' and case), so '@Name5th' never matches
// '@Name5thX'. A display-name fallback also accepts a substring match or equality once spaces are ignored
// (a display name 'Name 5th' matches its derived handle '@Name5th').
const authorKey = (s: string) => norm(s).replace(/^@/, '').replace(/\s+/g, '').toLowerCase()
const sameAuthor = (shown: string, expected: string) =>
  authorKey(shown) === authorKey(expected) || (!expected.startsWith('@') && shown.includes(expected))

// First thread whose body contains the first 30 chars of `text` (and whose author is `expectedAuthor`, if given),
// plus the authors of every body match.
export function matchThread(threads: ThreadText[], text: string, expectedAuthor: string | null): { index: number; authors: string[] } {
  const needle = norm(text).slice(0, 30)
  const author = expectedAuthor === null ? null : norm(expectedAuthor)
  const authors: string[] = []
  let index = -1
  threads.forEach((t, i) => {
    if (!norm(t.content).includes(needle)) return
    const a = norm(t.author)
    authors.push(a)
    if (index < 0 && (author === null || sameAuthor(a, author))) index = i
  })
  return { index, authors }
}

// Steps 6-7 (read-only): poll up to 30s for my comment, then highlight + screenshot it. Read errors while polling are
// retried (the list re-renders after a post). Once found, highlight and screenshot errors are ignored: the comment is
// confirmed, and reporting it as a failure would let a retry post it twice.
async function captureMyComment(page: Page, comments: Locator, text: string, expectedAuthor: string | null,
  screenshotPath: string): Promise<{ found: boolean; authors: string[]; detail: string }> {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS
  let match = { index: -1, authors: [] as string[] }
  let lastError: unknown = null
  for (;;) {
    try {
      match = matchThread(await readThreads(comments), text, expectedAuthor)
      lastError = null
    } catch (err) {
      lastError = err
    }
    if (match.index >= 0) break
    if (Date.now() >= deadline) {
      const notes = [match.authors.length ? `본문이 같은 댓글 작성자: ${match.authors.join(', ')}` : '', lastError ? `마지막 오류: ${firstLine(lastError)}` : '']
      const detail = [`${VERIFY_TIMEOUT_MS / 1000}초 안에 내 댓글을 찾지 못했습니다`, ...notes.filter(Boolean)].join(' / ')
      return { found: false, authors: match.authors, detail }
    }
    await page.waitForTimeout(VERIFY_POLL_MS)
  }

  const mine = comments.locator(SELECTORS.thread).nth(match.index)
  try {
    await mine.scrollIntoViewIfNeeded()
    await mine.evaluate((el, outline) => { (el as HTMLElement).style.outline = outline }, HIGHLIGHT)
  } catch { /* 하이라이트는 꾸밈일 뿐이다 */ }
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined)
  return { found: true, authors: match.authors, detail: '' }
}

export async function postComment(opts: { userDataDir: string; videoId: string; text: string; expectedAuthor: string | null;
  typingDelayMs: [number, number]; screenshotPath: string; onProgress: (p: PostProgress) => void }): Promise<PostResult> {
  const { userDataDir, videoId, text, expectedAuthor, typingDelayMs: [minDelay, maxDelay], screenshotPath, onProgress } = opts
  onProgress('opening_profile')
  return onProfilePage(userDataDir, screenshotPath, async (page) => {
    const { comments, placeholder } = await openComments(page, videoId)

    // Before anything is posted, run the same read the verification uses. A bug in it (like the tsx __name crash)
    // then fails here, where a retry is safe, instead of after submit, where it would be recorded as failed and a retry
    // would post twice. If my comment with this text is already on the video (an earlier attempt recorded as failed),
    // do not post again; go straight to verification. Best effort: the list may not have loaded yet.
    const already = matchThread(await readThreads(comments), text, expectedAuthor).index >= 0

    if (!already) {
      // 4. 한 글자씩 타이핑 (한글 조합 문제 없음, 시연에서 타이핑이 보인다)
      onProgress('typing')
      await placeholder.click()
      const editor = comments.locator(SELECTORS.editor).first()
      await need(editor, '댓글 입력창')
      await editor.focus()
      for (const ch of [...text]) {
        await editor.pressSequentially(ch)
        await page.waitForTimeout(rand(minDelay, maxDelay))
      }

      // 5. 등록. SELECTORS.submit 은 래퍼와 안쪽 button 둘 다 맞으므로, 문서 순서상 마지막(안쪽 button)을 눌러야
      //    click() 의 활성화 대기가 실제 disabled 속성을 본다.
      onProgress('posted')
      const submit = comments.locator(SELECTORS.submit).last()
      await need(submit, '등록 버튼')
      await submit.click()
    }

    // 6-7. 내 댓글 확인 + 하이라이트 + 캡처
    const check = await captureMyComment(page, comments, text, expectedAuthor, screenshotPath)
    if (!check.found) throw new PostFailure('timeout', check.detail)
    onProgress('verified')
    await page.waitForTimeout(VERIFIED_HOLD_MS).catch(() => undefined)   // 대기 중 창을 닫아도 성공
    return { ok: true, screenshotPath }
  })
}

// Read-only check (`pnpm try:post <n> <videoId> --verify-only "<text>"`): runs postComment's open, find, highlight and
// screenshot steps on an existing comment. It has no path to the comment box: no placeholder click, typing or submit.
export async function verifyComment(opts: { userDataDir: string; videoId: string; text: string; expectedAuthor: string | null;
  screenshotPath: string }): Promise<VerifyResult> {
  const { userDataDir, videoId, text, expectedAuthor, screenshotPath } = opts
  let authors: string[] = []
  const result = await onProfilePage(userDataDir, screenshotPath, async (page) => {
    const { comments } = await openComments(page, videoId)
    const check = await captureMyComment(page, comments, text, expectedAuthor, screenshotPath)
    authors = check.authors
    if (!check.found) throw new PostFailure('timeout', check.detail)
    return { ok: true, screenshotPath }
  })
  return { ...result, authors }
}
