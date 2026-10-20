import { errors, type BrowserContext, type Locator, type Page } from 'playwright'
import { launchProfile } from './launch'

// All YouTube DOM selectors for posting live here. On breakage edit only this object
// and log the changed selector + date in the issue's ## Comments.
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

// Index of the first comment thread whose body contains `needle` (and whose author contains `author`, if given).
async function findMyThread(threads: Locator, needle: string, author: string | null): Promise<number> {
  return threads.evaluateAll((els, a) => {
    const n = (s: string) => s.replace(/\s+/g, ' ').trim()
    return els.findIndex((el) => {
      if (!n(el.querySelector(a.contentSel)?.textContent ?? '').includes(a.needle)) return false
      return a.author === null || n(el.querySelector(a.authorSel)?.textContent ?? '').includes(a.author)
    })
  }, { needle, author, contentSel: SELECTORS.threadContent, authorSel: SELECTORS.threadAuthor })
}

export async function postComment(opts: { userDataDir: string; videoId: string; text: string; expectedAuthor: string | null;
  typingDelayMs: [number, number]; screenshotPath: string; onProgress: (p: PostProgress) => void }): Promise<PostResult> {
  const { userDataDir, videoId, text, expectedAuthor, typingDelayMs: [minDelay, maxDelay], screenshotPath, onProgress } = opts
  let context: BrowserContext | null = null
  let page: Page | null = null
  try {
    // 1. 프로필 열기
    onProgress('opening_profile')
    context = await launchProfile(userDataDir)
    page = context.pages()[0] ?? (await context.newPage())
    await page.goto(WATCH_URL + encodeURIComponent(videoId), { waitUntil: 'domcontentloaded' })

    // 2. 로그인 확인: 아바타가 대기 시간 안에 안 보이면 로그인 안 됨
    const loggedIn = await page.locator(SELECTORS.avatar).first().waitFor({ state: 'visible', timeout: AVATAR_WAIT_MS }).then(
      () => true,
      (err: unknown) => {
        if (err instanceof errors.TimeoutError) return false
        throw err
      },
    )
    if (!loggedIn) throw new PostFailure('not_logged_in')

    // 3. 댓글 영역: ytd-comments 는 지연 렌더링이라, 입력창(또는 댓글 사용 중지 안내)이 뜰 때까지 휠로 내린다.
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

    // 6. 내 댓글 확인: 최대 30초, 1초 간격
    const needle = norm(text).slice(0, 30)
    const author = expectedAuthor === null ? null : norm(expectedAuthor)
    const threads = comments.locator(SELECTORS.thread)
    const deadline = Date.now() + VERIFY_TIMEOUT_MS
    let index = await findMyThread(threads, needle, author)
    while (index < 0) {
      if (Date.now() >= deadline) throw new PostFailure('timeout', `${VERIFY_TIMEOUT_MS / 1000}초 안에 내 댓글을 찾지 못했습니다`)
      await page.waitForTimeout(VERIFY_POLL_MS)
      index = await findMyThread(threads, needle, author)
    }

    // 7. 하이라이트 + 캡처. 여기부터는 내 댓글이 확인된 상태다. 이 단계의 오류를 실패로 기록하면
    //    영상당 1개에 세지 않아 재시도 때 중복 게시가 되므로, 하이라이트·캡처·대기 오류는 모두 무시하고 성공을 돌려준다.
    const mine = threads.nth(index)
    try {
      await mine.scrollIntoViewIfNeeded()
      await mine.evaluate((el, outline) => { (el as HTMLElement).style.outline = outline }, HIGHLIGHT)
    } catch { /* 하이라이트는 꾸밈일 뿐이다 */ }
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined)
    onProgress('verified')
    await page.waitForTimeout(VERIFIED_HOLD_MS).catch(() => undefined)   // 대기 중 창을 닫아도 성공
    return { ok: true, screenshotPath }
  } catch (err) {
    // 8. 실패: 사유 분류 + 캡처 시도
    const { reason, message } = classify(err)
    const shot = page
      ? await page.screenshot({ path: screenshotPath, fullPage: false }).then(() => screenshotPath, () => null)
      : null
    return { ok: false, reason, message, screenshotPath: shot }
  } finally {
    await context?.close().catch(() => undefined)
  }
}
