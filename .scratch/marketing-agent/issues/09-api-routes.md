# 09 API 라우트

Status: ready-for-agent
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
| POST `/api/videos/[id]/draft` | `{ regenerate?: boolean }` | 캐시된 유효 초안 있고 regenerate 아님 → 그대로. 아니면 자막(`fetchCaptions` → `saveCaptions`) + 인기 댓글 + `recentDrafts: recentChannelDraftTexts(db, video.channel_id)`(이슈 13, 재생성이면 같은 영상 이전 초안 포함) → `generateDraft` → `insertDraft` | `{ draft: DraftRow, captionSource }` |
| POST `/api/posts` | `{ videoId, profileId? }` | `startPostJob(body, { db, cfg, post: postComment, today })` | 202 `{ jobId }` / 409·400 `{ reason, message }` |
| GET `/api/posts/[jobId]` | — | `getJob` | `{ job }` / 404 |
| GET `/api/log` | — | `listPosts(100)`, `successCountToday`, `postedVideoIds`, `activeJob` | `{ posts, todayCount, postedVideoIds, activeJobId }` |
| GET `/api/profiles` | — | config 프로필 × `profiles` 테이블 병합(없으면 `logged_in:false`) | `{ profiles: ProfileView[] }` |
| POST `/api/profiles/[id]/login` | — | `void openForLogin(profileDir(index))` 즉시 반환 | 202 |
| POST `/api/profiles/[id]/check` | — | `checkLogin` → `upsertProfile` | `{ profile }` |

`VideoView = VideoRow & { captionSource: CaptionSource | null; hasDraft: boolean; isTestChannel: boolean }`
`ProfileView = { id, label, index, loggedIn, channelName }`

## 단계
- [ ] 1. `src/lib/services.ts`
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
- [ ] 2. 라우트 구현. 공통: `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`. 오류는 `{ reason, message }` JSON. 예 `POST /api/videos`:
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
- [ ] 3. 수동 확인(`pnpm dev` + curl):
```bash
curl -s 'localhost:3000/api/videos?refresh=1' | head -c 400
curl -s -X POST localhost:3000/api/videos -H 'content-type: application/json' -d '{"url":"https://youtu.be/akn-AvCeHBI"}'
curl -s -X POST localhost:3000/api/videos/akn-AvCeHBI/draft -d '{}'
curl -s localhost:3000/api/log
```
- [ ] 4. 커밋 `feat: add dashboard API routes`

## 완료 기준
위 curl 4개가 기대 JSON 반환. 허용 밖 채널 링크 POST → 409 + `/api/log`에 blocked 행.
