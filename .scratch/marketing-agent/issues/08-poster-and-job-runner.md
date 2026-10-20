# 08 댓글 게시 (Playwright) + 작업 러너

Status: claimed
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
- [x] 1. `tests/runner.test.ts` — `post`를 가짜로 주입
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
- [x] 2. FAIL 확인 → `poster.ts`, `runner.ts` 구현 → PASS
- [x] 3. `scripts/try-post.ts`: `pnpm try:post <profileIndex> <videoId> "<text>"` → `postComment` 직접 호출, 진행 상태 콘솔 출력, 캡처 `data/screenshots/try-<ts>.png`.
- [ ] 4. 수동 검증(본인 테스트 영상): 유튜브2 프로필로 1회 실제 게시. 셀렉터 틀리면 `SELECTORS`만 수정. 유튜브 한국어 화면에서 "댓글 추가..." placeholder 확인.
- [ ] 5. 커밋 `feat: post comments via Playwright with job tracking`

## 완료 기준
테스트 녹색. 실제 테스트 영상에 댓글 1건 게시되고 캡처에 하이라이트된 내 댓글이 보인다.

## Comments

1~3단계 완료 (2026-10-20, browser-engineer). `poster.ts`·`runner.ts`의 이름·시그니처·`SELECTORS` 값은 이슈 그대로이고, 러너가 쓰는 저장소 함수(`activeJob`, `lastSuccessProfileId`, `hasSuccessForVideo`, `successCountToday`, `latestDraft`, `getProfile`)도 모두 이슈의 이름 그대로 있었다. `try:post`를 package.json에 추가했고, 이슈 07 메모대로 본문은 `main()`으로 감쌌다. `pnpm test` 105 passed / 1 skipped(`runner.test.ts` 11개, 아래 3문단의 수정 포함), `tsc --noEmit`·`pnpm lint` 클린. 실제 Chrome은 아직 열지 않았다(4단계에서 진행).

이슈 코드와 다른 점. (1) 테스트: Vitest 5의 `vi.fn(impl)`은 대입 대상(`typeof postComment`)으로 타입을 추론하지 않는다. 그래서 `ok`가 `boolean`으로 넓어져 `tsc`가 실패했고, 세 곳을 `vi.fn<Post>(…)`로 바꿨다(`type Post = Parameters<typeof startPostJob>[1]['post']`, 타입만 바뀌고 동작은 같다). 이슈 테스트가 `runPostJob`을 import만 하고 쓰지 않아 lint 경고가 났으므로, `runPostJob` 테스트 2개를 덧붙였다. 하나는 `post`에 넘기는 인자(`profileDir(2)`, 채널명, 타이핑 지연, `<jobId>.png`)를, 다른 하나는 `post`가 throw해도 `failed/unknown`으로 기록되고 reject하지 않는지를 확인한다. 두 테스트 모두 뮤테이션으로 실패하는 것을 확인했다. (2) 3단계 댓글 영역: `ytd-comments#comments`는 지연 로딩 전에도 DOM에 있으므로, "보인다"를 렌더링 완료 신호로 쓸 수 없다. 대신 그 안의 `placeholder` 또는 `commentsOff`가 보일 때까지 휠을 굴린다(최대 10회). 끝까지 안 보이면 `element_not_found`. (3) `submit` 셀렉터는 래퍼와 안쪽 `button`에 모두 맞는다. 그래서 `.last()`(안쪽 button)를 눌러 `click()`의 활성화 대기가 실제 `disabled`를 보게 했다. (4) 실패 분류: `TimeoutError`가 셀렉터 대기에서도 나기 때문에, 요소 대기는 `need()`로 감싸 `element_not_found`로 바꾸고 로그인·댓글 비활성·확인 30초 초과는 내부 `PostFailure`로 던진다. 그 밖의 `TimeoutError`는 `timeout`, 나머지는 `unknown`. (5) 저장소에 id로 초안을 읽는 함수가 없어서, `runPostJob`은 `latestDraft(video)`를 쓰되 `draft.id === job.draft_id`를 확인한다. `startPostJob`이 `createJob`과 같은 틱에 호출하므로 항상 일치한다. (6) `try-post`는 Data API로 영상 채널을 확인해 `test: true` 채널이 아니면 Chrome을 열기 전에 거부한다(불변 제약 1을 코드로 강제). 또 러너와 같은 조건이 되도록 `checkLogin`의 채널명을 `expectedAuthor`로 넘긴다.

3초 틈 수정 (2026-10-20, 메인 세션 지시). poster는 `onProgress('verified')` 뒤 3초 동안 창을 유지한다. 전에는 러너가 그 시점에 job만 `verified`로 바꾸고 성공 행은 `post()`가 끝난 뒤에 넣었다. 그래서 약 3초 동안 `activeJob`이 비고 `hasSuccessForVideo`가 false여서, 같은 영상의 두 번째 게시가 운영 규칙을 통과할 수 있었다(영상당 1개 위반). 이제 `runPostJob`은 `'verified'`를 받는 즉시 성공 행을 넣고(`screenshot_path`는 러너가 `post`에 넘긴 `<jobId>.png`), 같은 동기 구간에서 job을 `verified` + `post_id`로 갱신한다. 그 뒤 `post()`가 실패를 반환하거나 throw해도 행을 더 넣거나 job을 되돌리지 않는다. 그에 맞춰 poster의 3초 대기는 `.catch`로 감쌌다(대기 중 사용자가 창을 닫아도 확인된 게시가 실패로 바뀌지 않게). 테스트 3개를 추가했다: `verified` 후 `post`가 끝나지 않는 동안 성공 행이 있고 같은 영상 재요청이 `already_posted`로 차단되는지, `verified` 후 실패 반환·throw에도 job이 `verified`이고 행이 성공 1개뿐인지. 세 테스트 모두 수정 전 코드에서 실패하는 것을 먼저 확인했다. 이 때문에 이슈 테스트 1의 기대값 하나를 바꿨다. 가짜 `post`가 `'/s.png'`를 반환해도 성공 행은 `'verified'` 시점에 기록되므로, `screenshot_path` 기대값을 `path.join(screenshotDir(), jobId + '.png')`로 바꿨다. 실제 poster는 받은 경로에 캡처를 저장하고 그 경로를 그대로 반환하므로 둘은 같다.

실제 게시 검증 보류 (2026-10-20, 사용자 결정). 4단계(실제 게시)는 이번에 하지 않았다. Chrome도 열지 않았고 `try:post`도 실행하지 않았다. 그래서 `SELECTORS`는 아직 실제 화면에서 확인되지 않았다. 남은 일: 4단계. 테스트 채널 영상에서 `pnpm try:post 2 <videoId> "<text>"`를 1회 실행하고(스크립트가 Data API로 테스트 채널인지 먼저 확인한다), 셀렉터가 틀리면 `SELECTORS`만 고친다. 4단계에서 꼭 확인할 위험 (A): `expectedAuthor`는 아바타 메뉴의 `#account-name`(표시 이름, 프로필의 `channel_name`)인데, 댓글 `#author-text`는 `@핸들`일 수 있다. 둘이 다르면 실제로는 게시됐는데 확인 단계가 `timeout` 실패로 기록되고, 실패는 영상당 1개에 세지 않으므로 재시도하면 중복 게시가 된다. `try-post`는 러너와 같은 조건이 되도록 `checkLogin`의 채널명을 `expectedAuthor`로 넘기므로, 4단계 결과로 바로 드러난다. 다르면 `checkLogin`이 핸들을 읽게 하거나 둘 중 하나와 맞으면 통과하게 고친다. Status는 4단계가 남아 있어 `claimed`로 둔다.

리뷰 후속 수정 (2026-10-20): (1) poster는 내 댓글 스레드를 찾은 뒤에는 하이라이트·캡처 오류를 무시하고 항상 `onProgress('verified')` + `{ ok: true }`를 돌려준다(확인된 게시가 실패로 기록돼 재시도 때 중복 게시되는 것을 막음). (2) 러너는 `'verified'` 시점에 성공 행만 넣고(영상당 1개 차단 유지) job은 `posted`(진행 중)로 둔다. `post()`가 끝나 창이 닫힌 뒤에야 `verified` + `post_id`로 바꾸므로, 그동안 다른 작업은 `busy`로 막혀 같은 프로필을 두 번 열지 않는다. 위 '3초 틈 수정' 문단 중 'verified 시점에 job도 갱신'한다는 부분은 이것으로 대체되고, 행을 더 넣지 않고 job을 되돌리지 않는 동작은 그대로다. 해당 테스트는 창이 열려 있는 동안 같은 영상은 `already_posted`, 다른 영상은 `busy`이고 `post()`가 끝난 뒤 `verified` + `post_id`가 되는지 확인한다.

실제 실행 결과와 수정 (2026-10-20). 사용자가 23:39에 테스트 채널 영상 2개에서 `pnpm try:post 2 …`를 직접 실행했다. 타이핑과 등록은 성공했고(Data API로 두 영상 모두 댓글이 달린 것을 확인), 확인 단계에서 `locator.evaluateAll: ReferenceError: __name is not defined`로 `unknown` 실패가 났다. 원인은 tsx(esbuild `keepNames`)가 페이지 콜백 안의 이름 있는 함수를 `__name(...)`으로 감싸는데, 페이지에는 `__name`이 없다는 것이다. 실제로는 게시됐는데 실패로 기록되는, 중복 게시 위험이 그대로 드러난 사례다. 수정: (1) `context.addInitScript`로 문자열 `__name` 항등 shim을 넣는다. 지금과 앞으로의 모든 페이지 콜백을 막아 준다(임시 헤드리스 Chrome에서 shim이 없으면 같은 ReferenceError, 있으면 정상인 것을 확인). 페이지 콜백은 텍스트만 뽑고, 매칭은 Node의 순수 함수 `matchThread`가 한다(`tests/poster.test.ts` 7개). (2) 등록 전에 확인 단계와 같은 읽기를 한 번 돌린다. 읽기 코드에 버그가 있으면 게시 전에 실패하므로 재시도해도 안전하다. 내 댓글이 이미 있으면 다시 게시하지 않고 바로 확인 단계로 간다. 최선 노력이라 목록이 아직 안 떴으면 못 막지만, 실측에서는 입력창이 보일 때 목록도 이미 떠 있었다. 확인 폴링 중 읽기 오류는 재시도하고, 30초가 지나면 `timeout`과 함께 본문이 일치한 댓글의 작성자와 마지막 오류를 메시지에 남긴다. (3) `verifyComment`와 `pnpm try:post <n> <videoId> --verify-only "<text>"`를 추가했다. 읽기 전용이라 입력창 클릭·타이핑·등록 코드 경로가 없다. 알 수 없는 `--` 플래그는 거부해서 오타가 댓글 본문으로 게시되지 않게 했다.

위험 (A) 실측과 범위 변경 (2026-10-20). 댓글 `#author-text`에는 `@핸들`이 보이는데 `checkLogin` 채널명은 표시 이름이어서, 첫 verify-only가 `timeout`이었다(본문이 일치한 댓글의 작성자는 내 핸들). 소유자 배지는 없었다. 변경: `checkLogin`은 아바타 메뉴의 핸들(`PROFILE_SELECTORS.accountHandle` = `ytd-active-account-header-renderer #channel-handle`, 2026-10-20 추가)을 먼저 읽고, 없으면 표시 이름을 쓴다. 따라서 `profiles.channel_name`과 이슈 09의 `ProfileView.channelName`은 이제 `@핸들`이다. `matchThread`는 포함 관계이거나, `@`·공백·대소문자를 무시하고 같으면 같은 작성자로 본다. 재실행 결과 두 영상 모두 verify-only `ok: true`(4.5초, 3.3초)였고, 캡처에서 내 댓글 하이라이트를 확인했으며 새 댓글은 생기지 않았다. 참고로 유튜브 UI 언어는 브라우저 locale이 아니라 계정 설정을 따른다(프로필 2는 영어 UI). 셀렉터는 id 기반이라 영향이 없고, 화면 문구로 요소를 고르지 않는다. 남은 일: 4단계 최종 실제 게시 1회(새 테스트 영상, 사용자 승인 대기). 프로필 1·3도 `pnpm try:login N check`로 핸들이 읽히는지 확인하는 것을 권장한다.
