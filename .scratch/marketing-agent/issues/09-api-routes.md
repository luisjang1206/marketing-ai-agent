# 09 API 라우트

Status: resolved
Type: task
Blocked by: 04, 05, 06, 08, 13
Agent: issue-implementer
Model: sonnet

## 목표
spec §4의 Route Handler 전부. 얇게: 입력 검증 → lib 호출 → JSON. 직접 입력 링크 검증 포함(가점).

## 파일
- Create: `src/lib/services.ts` (config/db/api/llm 싱글턴 조립), `src/lib/youtube/map.ts` (`toRow(meta: VideoMeta, source: 'list'|'direct'): Omit<VideoRow,'fetched_at'>`), `src/app/api/**/route.ts` (아래 표), `src/lib/api-types.ts` (UI와 공유하는 응답 타입)

## 엔드포인트

| 메서드·경로 | 입력 | 동작 | 응답 |
|---|---|---|---|
| GET `/api/config` | — | 공개 설정 | `{ profiles: Profile[], dailyMax, allowedChannelIds, testChannelIds, comment: {min,max,brand} }` |
| GET `/api/videos` | `?refresh=1` | refresh면 `listLatestVideos(allowedChannelIds, per_channel)` → `upsertVideos(source:'list')`. 항상 `listVideos` + 각 영상 `captionSource`·`hasDraft` | `{ videos: VideoView[] }` |
| POST `/api/videos` | `{ url }` | `parseVideoId` 실패 → 400 `invalid_url`. `getVideo` null → 404. 채널이 허용 밖 → `insertPost(blocked, not_allowed_channel)` 후 409. 아니면 `upsertVideos(source:'direct')` | `{ video }` |
| POST `/api/videos/[id]/draft` | `{ regenerate?: boolean }` | 캐시된 유효 초안 있고 regenerate 아님 → 그대로. 아니면 자막(`fetchCaptions` → `saveCaptions`) + 인기 댓글 + `recentDrafts`(이슈 13: 같은 영상 `latestDraft(db, id)?.text`를 맨 앞에, 뒤에 `recentChannelDraftTexts(db, video.channel_id)`에서 그것과 중복을 뺀 나머지. 재생성 때 짜임이 꼭 바뀌게) → `generateDraft` → `insertDraft` | `{ draft: DraftRow, captionSource }` |
| POST `/api/posts` | `{ videoId, profileId? }` | `startPostJob(body, { db, cfg, post: postComment, today })` | 202 `{ jobId }` / 409·400 `{ reason, message }` |
| GET `/api/posts/[jobId]` | — | `getJob` | `{ job }` / 404 |
| GET `/api/log` | — | `listPosts(100)`, `successCountToday`, `postedVideoIds`, `activeJob` | `{ posts, todayCount, postedVideoIds, activeJobId }` |
| GET `/api/profiles` | — | config 프로필 × `profiles` 테이블 병합(없으면 `logged_in:false`) | `{ profiles: ProfileView[] }` |
| POST `/api/profiles/[id]/login` | — | `void openForLogin(profileDir(index))` 즉시 반환 | 202 |
| POST `/api/profiles/[id]/check` | — | `checkLogin` → `upsertProfile` | `{ profile }` |

`VideoView = VideoRow & { captionSource: CaptionSource | null; hasDraft: boolean; isTestChannel: boolean }`
`ProfileView = { id, label, index, loggedIn, channelName }`

## 단계
- [x] 1. `src/lib/services.ts`
```ts
import { loadConfig } from './config'
import { getDb } from './db'
import { createYoutubeApi } from './youtube/api'
import { createAnthropicDraftLLM, envLocalBaseURL } from './draft/anthropic'
declare global { var __services: ReturnType<typeof build> | undefined }
function build() {
  const cfg = loadConfig()
  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} 가 .env.local 에 없습니다`); return v }
  return {
    cfg, db: getDb(),
    youtube: createYoutubeApi(need('YOUTUBE_API_KEY')),
    llm: createAnthropicDraftLLM({ apiKey: need('ANTHROPIC_API_KEY'), model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5', baseURL: envLocalBaseURL() }),   // .env.local 만 읽음. 셸 ANTHROPIC_BASE_URL 프록시 차단
    today: () => new Date().toLocaleDateString('sv-SE'),   // YYYY-MM-DD 로컬
  }
}
export const services = () => (globalThis.__services ??= build())
```
- [x] 2. 라우트 구현. 공통: `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`. 오류는 `{ reason, message }` JSON. 예 `POST /api/videos`:
```ts
export async function POST(req: Request) {
  const { cfg, db, youtube } = services()
  const { url } = await req.json().catch(() => ({}))
  const id = typeof url === 'string' ? parseVideoId(url) : null
  if (!id) return NextResponse.json({ reason: 'invalid_url', message: '유튜브 영상 링크가 아닙니다' }, { status: 400 })
  const meta = await youtube.getVideo(id)
  if (!meta) return NextResponse.json({ reason: 'not_found', message: '영상을 찾을 수 없습니다' }, { status: 404 })
  const verdict = checkPostAllowed({ videoChannelId: meta.channelId, allowedChannelIds: allowedChannelIds(cfg), alreadyPosted: false, successCountToday: 0, dailyMax: 1 })
  if (!verdict.allowed) {
    upsertVideos(db, [toRow(meta, 'direct')])   // 기록에 제목이 보이도록 저장은 한다
    insertPost(db, { video_id: id, profile_id: '-', draft_id: null, text: null, status: 'blocked', reason: verdict.reason, screenshot_path: null })
    return NextResponse.json({ reason: verdict.reason, message: verdict.message }, { status: 409 })
  }
  upsertVideos(db, [toRow(meta, 'direct')])
  return NextResponse.json({ video: getVideo(db, id) })
}
```
- [x] 3. 수동 확인(`pnpm dev` + curl):
```bash
curl -s 'localhost:3000/api/videos?refresh=1' | head -c 400
curl -s -X POST localhost:3000/api/videos -H 'content-type: application/json' -d '{"url":"https://youtu.be/akn-AvCeHBI"}'
curl -s -X POST localhost:3000/api/videos/akn-AvCeHBI/draft -d '{}'
curl -s localhost:3000/api/log
```
- [x] 4. 커밋 `feat: add dashboard API routes`

## 완료 기준
위 curl 4개가 기대 JSON 반환. 허용 밖 채널 링크 POST → 409 + `/api/log`에 blocked 행.

## Comments

이슈 07 리뷰에서 넘어온 메모 (2026-10-20): `POST /api/profiles/[id]/login`은 `void openForLogin(...)` 대신 `openForLogin(...).catch((err) => console.error(...))`처럼 `.catch`를 붙인다. 프로필 디렉터리가 이미 열려 있거나(Chrome 단일 인스턴스 잠금) Chrome이 설치돼 있지 않으면 `launchProfile`이 거부(reject)되는데, `.catch`가 없으면 Next.js 프로세스에 unhandled rejection이 남는다.

참고 (이슈 08, 2026-10-20): `checkLogin().channelName`은 이제 `@핸들`이다(없으면 표시 이름). 이 값을 `upsertProfile`의 `channel_name`으로 그대로 저장하면, 러너가 이를 `expectedAuthor`로 써서 내 댓글인지 확인한다.

구현 (2026-10-21, issue-implementer): 라우트 핸들러를 `vi.mock('@/lib/services')`로 `openDb(':memory:')`와 가짜 youtube·llm·고정 `today`를 꽂아 `Request`로 직접 호출하는 방식으로 테스트 먼저 썼다(`tests/map.test.ts` 2개, `tests/api-routes.test.ts` 43개). 모듈이 없어서 실패하는 것을 확인한 뒤 구현했고, `.catch` 제거·recentDrafts 순서 뒤집기·blocked 행 생략을 일부러 넣어 해당 테스트 3개가 정확히 실패하는 것도 확인한 뒤 되돌렸다. 브라우저·포스터·자막 모듈은 mock이라 크롬이 뜨지 않는다. 전체 `pnpm test` 158 passed / 1 skipped(`generate.live.test.ts`, 키 없이 실행), `tsc --noEmit`·`pnpm lint`·`pnpm build` 통과. 수동 확인(`pnpm dev` + curl, 실키): `GET /api/videos?refresh=1` 200으로 6개 채널 28개(테스트 채널 3개), `POST /api/videos`에 `akn-AvCeHBI`(외롭여) 200 `source:"direct"`, 같은 영상 초안 200 `valid:true`·`captionSource:"subtitle"`·약 13초이고 두 번째 호출은 5ms로 캐시 반환, 허용 밖 영상(`dQw4w9WgXcQ`) 직접 입력은 409 `not_allowed_channel`이고 `/api/log`에 `blocked`·`profile_id:'-'` 행과 영상 제목이 보인다. `POST /api/posts`와 `POST /api/profiles/*/login|check`는 실제 크롬을 열거나 댓글을 달기 때문에 단위 테스트로만 확인했고 실제로 호출하지 않았다. 07·08 메모는 반영했다(login은 `openForLogin(...).catch(console.error)`, check는 `checkLogin().channelName`(@핸들)을 가공 없이 `channel_name`에 저장). 이슈와 다르게 한 것: ① `services()`에 `model` 필드를 더했다(`drafts.model`에 기록해야 하는데 이슈의 반환 모양에는 없었다. 기본값 `claude-sonnet-5-5`는 한 곳에만 둔다). ② 스펙 §12는 Route Handler 테스트를 생략한다고 했지만 요청에 따라 추가했다. ③ 외부 호출이 실패하면 빈 500 대신 `{reason, message}`를 돌려준다: 목록 불러오기·직접 입력·초안 생성은 502 `upstream_error`(초안은 저장하지 않음), `check`는 500 `check_failed`. ④ `POST /api/posts`는 `videoId`가 문자열이 아니면 400 `invalid_request`, 설정에 없는 `profileId`(`p9` 등)는 400 `invalid_profile`로 막는다(통과시키면 `data/profiles/9`를 새로 열게 된다). 비우거나 null이면 자동 배정. ⑤ `login`은 본문 없는 202 대신 `{ ok: true }`와 202를 준다(`res.json()`이 깨지지 않게). `login`·`check`에서 설정에 없는 프로필은 404 `profile_not_found`. ⑥ `POST /api/videos`는 `upsertVideos`를 판정 앞에서 한 번만 부른다(차단이어도 저장하므로 결과는 이슈 코드와 같다). ⑦ 초안 라우트의 recentDrafts 검증은 가짜 llm 프롬프트 문자열 대신 `generateDraft`를 그대로 통과시키는 spy로 넘어간 `recentDrafts` 배열을 직접 비교한다(프롬프트 문구가 바뀌어도 깨지지 않게). 프롬프트에 이전 초안이 실제로 들어가는지는 llm 인자로도 한 번 확인한다. 열린 질문·제안(이슈에 없어 손대지 않음): (a) `GET /api/videos`는 이슈대로 `listVideos` 전체를 돌려주므로, 허용 밖 영상을 직접 입력해 차단된 뒤에도 그 영상이 목록에 남는다. 이슈 10에서 `/api/config`의 `allowedChannelIds`로 걸러 보이게 할지, 이 라우트에서 허용 채널만 돌려줄지 정해야 한다. (b) `services()`가 두 키를 한꺼번에 요구하므로 키가 하나라도 없으면 `/api/config`·`/api/log`·`/api/profiles`와 설정 화면까지 실패한다. (c) `login`·`check`는 진행 중인 게시 작업이 같은 프로필 디렉터리를 열고 있어도 막지 않는다(Chrome 잠금으로 거부될 뿐이다). (d) `pnpm build`가 `config.ts`·`draft/anthropic.ts`의 `readFileSync(process.cwd()...)`에 대해 "프로젝트 전체 추적" 경고를 낸다. 로컬 전용이라 영향은 없고 `/*turbopackIgnore: true*/`로 끌 수 있다. (e) 수동 확인으로 `data/agent.db`에 videos 30행(목록 28 + 직접 입력 2), captions 1행, drafts 1행(`akn-AvCeHBI`), posts 1행(blocked, `dQw4w9WgXcQ`)이 생겼다. 시작 전 `drafts`·`posts` id가 모두 1이어서 이전 데이터는 없었던 것으로 보이며, 시연 전에 `data/`를 비우면 된다.
