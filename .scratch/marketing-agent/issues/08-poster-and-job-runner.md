# 08 댓글 게시 (Playwright) + 작업 러너

Status: ready-for-agent
Type: task
Blocked by: 03, 06, 07
Agent: browser-engineer
Model: opus

## 목표
spec §8. 프로필을 열어 영상 댓글창에 한 글자씩 타이핑 → 게시 → 내 댓글 확인 → 캡처. 진행 상태를 `jobs`에, 결과를 `posts`에 기록. 실패 사유 분류.

## 파일
- Create: `src/lib/browser/poster.ts`, `src/lib/jobs/runner.ts`, `scripts/try-post.ts`
- Test: `tests/runner.test.ts` (poster 모킹)

## 인터페이스
```ts
// poster.ts
export const SELECTORS = { avatar: 'button#avatar-btn', comments: 'ytd-comments#comments', placeholder: '#placeholder-area',
  editor: '#contenteditable-root', submit: '#submit-button button, #submit-button', thread: 'ytd-comment-thread-renderer',
  threadAuthor: '#author-text', threadContent: '#content-text', commentsOff: 'ytd-message-renderer' }
export type PostProgress = 'opening_profile' | 'typing' | 'posted' | 'verified'
export type FailureReason = 'not_logged_in' | 'comments_disabled' | 'element_not_found' | 'timeout' | 'unknown'
export const FAILURE_LABELS: Record<FailureReason, string>   // 로그인 안 됨 / 댓글 비활성 영상 / 요소 못 찾음 / 시간 초과 / 알 수 없음
export type PostResult = { ok: true; screenshotPath: string } | { ok: false; reason: FailureReason; message: string; screenshotPath: string | null }
export async function postComment(opts: { userDataDir: string; videoId: string; text: string; expectedAuthor: string | null;
  typingDelayMs: [number, number]; screenshotPath: string; onProgress: (p: PostProgress) => void }): Promise<PostResult>

// runner.ts
export type StartResult = { ok: true; jobId: string }
  | { ok: false; status: 409 | 400; reason: RuleReason | 'busy' | 'no_profile' | 'video_not_found' | 'no_draft' | 'invalid_draft'; message: string }
export type RunnerDeps = { db: DatabaseSync; cfg: AppConfig; post: typeof postComment; today: () => string }   // 라우트(09)가 조립, 테스트는 가짜 주입
export function startPostJob(input: { videoId: string; profileId?: string | null }, deps: RunnerDeps): Promise<StartResult>
export function runPostJob(jobId: string, deps: RunnerDeps): Promise<void>
```

## postComment 흐름 (구현 지침)
1. `onProgress('opening_profile')` → `launchProfile` → `page.goto('https://www.youtube.com/watch?v=' + id, { waitUntil: 'domcontentloaded' })`
2. 로그인 확인: `SELECTORS.avatar` 8초 대기. 없으면 `not_logged_in`.
3. 댓글 영역: `page.mouse.wheel(0, 600)` 반복(최대 10회)하며 `SELECTORS.comments` 보일 때까지. `commentsOff`("댓글이 사용 중지되었습니다")가 보이면 `comments_disabled`.
4. `onProgress('typing')` → `placeholder` 클릭 → `editor` 포커스 → `locator.pressSequentially(text, { delay: 0 })`을 쓰지 말고 **한 글자씩 루프**: `for (const ch of [...text]) { await editor.pressSequentially(ch); await page.waitForTimeout(rand(min,max)) }` (한글 조합 문제 없음, 시연에 타이핑 보임)
5. `onProgress('posted')` → `submit` 클릭(활성화 대기).
6. 확인: 최대 30초 동안 1초마다 `thread` 중 `threadContent`가 `norm(text).slice(0, 30)`을 포함하고 (expectedAuthor가 있으면) `threadAuthor`가 포함하는 요소 검색. `norm = s => s.replace(/\s+/g,' ').trim()`.
7. 찾으면 `scrollIntoViewIfNeeded()` → `evaluate(el => el.style.outline = '3px solid #e11d48')` → `page.screenshot({ path, fullPage: false })` → `onProgress('verified')` → 3초 대기 → close → `{ok:true}`.
8. 어떤 단계든 예외: 캡처 시도(`try`), 사유 분류 — `TimeoutError` → `timeout`(6단계 시간 초과도 timeout), 셀렉터 `waitFor` 실패 → `element_not_found`, 그 외 `unknown`. 항상 `finally { await context.close() }`.

## runner 흐름
`startPostJob`:
1. `getVideo` 없으면 400 `video_not_found`. `latestDraft` 없으면 400 `no_draft`, `valid=false`면 400 `invalid_draft`.
2. `checkPostAllowed({ videoChannelId, allowedChannelIds(cfg), alreadyPosted: hasSuccessForVideo, successCountToday(db, today()), dailyMax })` → 차단이면 `insertPost({status:'blocked', reason, profile_id: input.profileId ?? '-', draft_id, text})` 후 409.
3. `activeJob(db)` 있으면 409 `busy`.
4. 프로필: `input.profileId` 없으면 `pickProfile(listProfiles(db).map(p=>({id, loggedIn})), lastSuccessProfileId(db))`, null이면 409 `no_profile`.
5. `createJob({ id: crypto.randomUUID(), ... })` → `void runPostJob(id, deps)` → `{ok:true, jobId}`.

`runPostJob`: 프로필 id `p2` → index 2 → `profileDir(2)`; `expectedAuthor = getProfile(db, id)?.channel_name ?? null`; `typingDelayMs = [cfg.typing.min_delay_ms, cfg.typing.max_delay_ms]`; `screenshotPath = path.join(screenshotDir(), jobId + '.png')`. `updateJob(state)`를 `onProgress`에 연결(메시지는 PDF 표현: 프로필 여는 중/입력 중/게시 완료/댓글 보기). 끝나면 `insertPost(success|failed)` + `updateJob({ state: 'verified'|'failed', message, screenshot_path, post_id })`. 예외는 삼키고 `failed/unknown`으로 기록(백그라운드라 throw 하면 유실).

## 단계
- [ ] 1. `tests/runner.test.ts` — `post`를 가짜로 주입
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openDb } from '@/lib/db'
import { parseConfig } from '@/lib/config'
import { upsertVideos } from '@/lib/repo/videos'
import { insertDraft } from '@/lib/repo/drafts'
import { upsertProfile } from '@/lib/repo/profiles'
import { listPosts, insertPost } from '@/lib/repo/posts'
import { getJob } from '@/lib/repo/jobs'
import { startPostJob, runPostJob } from '@/lib/jobs/runner'

const cfg = parseConfig(`
profiles: [유튜브1, 유튜브2]
channels: [UCxlc0Ky0aWoD8uI09ad44Tg]
comment: { min_chars: 40, max_chars: 120, brand: 운명원, brand_phrases: [x] }
limits: { daily_max_comments: 2 }
`)
const video = { id: 'v1', channel_id: 'UCxlc0Ky0aWoD8uI09ad44Tg', channel_title: 'c', title: 't', description: '', thumbnail_url: '', published_at: '2026-10-19', view_count: 0, source: 'list' as const }
let deps: Parameters<typeof startPostJob>[1]
beforeEach(() => {
  const db = openDb(':memory:')
  upsertVideos(db, [video, { ...video, id: 'v2', channel_id: 'UCzzzzzzzzzzzzzzzzzzzzzz' }])
  insertDraft(db, { video_id: 'v1', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
  upsertProfile(db, { id: 'p1', label: '유튜브1', logged_in: true, channel_name: 'A' })
  upsertProfile(db, { id: 'p2', label: '유튜브2', logged_in: true, channel_name: 'B' })
  deps = { db, cfg, today: () => '2026-10-20', post: vi.fn(async ({ onProgress }) => { onProgress('opening_profile'); onProgress('typing'); onProgress('posted'); onProgress('verified'); return { ok: true, screenshotPath: '/s.png' } }) }
})
const flush = () => new Promise((r) => setTimeout(r, 10))

describe('startPostJob', () => {
  it('runs a job to verified and records a success', async () => {
    const r = await startPostJob({ videoId: 'v1' }, deps)
    expect(r.ok).toBe(true); await flush()
    const job = getJob(deps!.db, (r as { jobId: string }).jobId)!
    expect(job.state).toBe('verified'); expect(job.profile_id).toBe('p1')
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'success', video_id: 'v1', screenshot_path: '/s.png' })
  })
  it('records blocked when the channel is not allowed', async () => {
    insertDraft(deps!.db, { video_id: 'v2', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
    const r = await startPostJob({ videoId: 'v2' }, deps)
    expect(r).toMatchObject({ ok: false, status: 409, reason: 'not_allowed_channel' })
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'blocked', reason: 'not_allowed_channel' })
  })
  it('refuses a second concurrent job with busy', async () => {
    deps!.post = vi.fn(() => new Promise(() => {}))   // never resolves
    await startPostJob({ videoId: 'v1' }, deps)
    const r = await startPostJob({ videoId: 'v1', profileId: 'p2' }, deps)
    expect(r).toMatchObject({ ok: false, reason: 'busy' })
  })
  it('records failure with reason and does not count toward the cap', async () => {
    deps!.post = vi.fn(async () => ({ ok: false, reason: 'not_logged_in', message: '로그인 안 됨', screenshotPath: '/f.png' }))
    const r = await startPostJob({ videoId: 'v1' }, deps); await flush()
    expect(getJob(deps!.db, (r as { jobId: string }).jobId)!.state).toBe('failed')
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'failed', reason: 'not_logged_in' })
    const again = await startPostJob({ videoId: 'v1' }, deps)   // 실패 후 재시도는 허용
    expect(again.ok).toBe(true)
  })
  it('blocks a video that already has a success, and rotates to the next profile for another video', async () => {
    insertPost(deps!.db, { video_id: 'v1', profile_id: 'p1', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null, created_at: '2026-10-19 10:00:00' })
    expect(await startPostJob({ videoId: 'v1' }, deps)).toMatchObject({ ok: false, reason: 'already_posted' })
    upsertVideos(deps!.db, [{ ...video, id: 'v3' }])
    insertDraft(deps!.db, { video_id: 'v3', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
    const r = await startPostJob({ videoId: 'v3' }, deps)
    expect(r.ok).toBe(true); await flush()
    expect(getJob(deps!.db, (r as { jobId: string }).jobId)!.profile_id).toBe('p2')   // 자동 배정: p1 다음
  })
  it('refuses when no profile is logged in', async () => {
    upsertProfile(deps!.db, { id: 'p1', label: '유튜브1', logged_in: false, channel_name: null })
    upsertProfile(deps!.db, { id: 'p2', label: '유튜브2', logged_in: false, channel_name: null })
    expect(await startPostJob({ videoId: 'v1' }, deps)).toMatchObject({ ok: false, reason: 'no_profile' })
  })
})
```
- [ ] 2. FAIL 확인 → `poster.ts`, `runner.ts` 구현 → PASS
- [ ] 3. `scripts/try-post.ts`: `pnpm try:post <profileIndex> <videoId> "<text>"` → `postComment` 직접 호출, 진행 상태 콘솔 출력, 캡처 `data/screenshots/try-<ts>.png`.
- [ ] 4. 수동 검증(본인 테스트 영상): 유튜브2 프로필로 1회 실제 게시. 셀렉터 틀리면 `SELECTORS`만 수정. 유튜브 한국어 화면에서 "댓글 추가..." placeholder 확인.
- [ ] 5. 커밋 `feat: post comments via Playwright with job tracking`

## 완료 기준
테스트 녹색. 실제 테스트 영상에 댓글 1건 게시되고 캡처에 하이라이트된 내 댓글이 보인다.
