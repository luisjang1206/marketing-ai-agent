# 04 영상 링크 파서 + YouTube Data API 클라이언트

Status: resolved
Type: task
Blocked by: 02
Agent: issue-implementer
Model: sonnet

## 목표
직접 입력 링크에서 영상 ID를 뽑고, Data API v3로 허용 채널 최신 영상·단일 영상·인기 댓글을 가져온다. `fetch`를 주입받아 테스트한다.

## 파일
- Create: `src/lib/youtube/url.ts`, `src/lib/youtube/api.ts`
- Test: `tests/url.test.ts`, `tests/youtube-api.test.ts`

## 인터페이스
```ts
// url.ts
export function parseVideoId(input: string): string | null   // 11자 [A-Za-z0-9_-]

// api.ts
export type VideoMeta = { id: string; channelId: string; channelTitle: string; title: string; description: string;
  thumbnailUrl: string; publishedAt: string; viewCount: number }
export type YoutubeApi = {
  listLatestVideos(channelIds: string[], perChannel: number): Promise<VideoMeta[]>
  getVideo(id: string): Promise<VideoMeta | null>
  getTopComments(id: string, max?: number): Promise<string[]>
}
export function createYoutubeApi(apiKey: string, fetchImpl?: typeof fetch): YoutubeApi
export class YoutubeApiError extends Error { constructor(public status: number, message: string) }
```
호출 경로(모두 1유닛): `channels`는 안 부른다 — 업로드 재생목록 ID는 `'UU' + channelId.slice(2)`.
- `playlistItems?part=contentDetails&playlistId=UU…&maxResults=N` → `items[].contentDetails.videoId`
- `videos?part=snippet,statistics&id=a,b,c` (최대 50개 한 번에) → 메타
- `commentThreads?part=snippet&videoId=…&order=relevance&maxResults=10&textFormat=plainText` → `items[].snippet.topLevelComment.snippet.textDisplay`
댓글 비활성 영상은 403 `commentsDisabled` → 빈 배열 반환(에러 아님).

## 단계
- [x] 1. `tests/url.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { parseVideoId } from '@/lib/youtube/url'
describe('parseVideoId', () => {
  it.each([
    ['https://youtu.be/akn-AvCeHBI', 'akn-AvCeHBI'],
    ['https://www.youtube.com/watch?v=JjY09DSdzx0&t=10s', 'JjY09DSdzx0'],
    ['https://youtube.com/shorts/DvxMfC_KjX0', 'DvxMfC_KjX0'],
    ['  https://m.youtube.com/watch?list=PL1&v=3K82-PjUeP0  ', '3K82-PjUeP0'],
    ['WxXlNTXQSd4', 'WxXlNTXQSd4'],
    ['https://www.youtube.com/live/WxXlNTXQSd4?feature=share', 'WxXlNTXQSd4'],
  ])('%s → %s', (input, id) => expect(parseVideoId(input)).toBe(id))
  it.each(['', 'https://example.com/watch?v=abc', 'https://www.youtube.com/channel/UCxlc0Ky0aWoD8uI09ad44Tg', 'short'])
    ('rejects %s', (input) => expect(parseVideoId(input)).toBeNull())
})
```
- [x] 2. `tests/youtube-api.test.ts` — fetch 모킹
```ts
import { describe, it, expect, vi } from 'vitest'
import { createYoutubeApi } from '@/lib/youtube/api'

function fakeFetch(routes: Record<string, unknown | ((u: URL) => unknown)>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input))
    const key = u.pathname.split('/').pop()!
    const r = routes[key]
    if (!r) return new Response('{}', { status: 404 })
    const body = typeof r === 'function' ? (r as (u: URL) => unknown)(u) : r
    const status = (body as { __status?: number }).__status ?? 200
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}
const snippet = (id: string, ch: string) => ({ id, snippet: { channelId: ch, channelTitle: 'ch', title: 'T' + id, description: 'd',
  publishedAt: '2026-10-19T00:00:00Z', thumbnails: { medium: { url: 'thumb/' + id } } }, statistics: { viewCount: '1234' } })

describe('createYoutubeApi', () => {
  it('lists latest videos via uploads playlist and batches videos.list', async () => {
    const fetchImpl = fakeFetch({
      playlistItems: (u) => ({ items: u.searchParams.get('playlistId') === 'UUa' ? [{ contentDetails: { videoId: 'v1' } }] : [{ contentDetails: { videoId: 'v2' } }] }),
      videos: (u) => ({ items: u.searchParams.get('id')!.split(',').map((id) => snippet(id, id === 'v1' ? 'UCa' : 'UCb')) }),
    })
    const api = createYoutubeApi('KEY', fetchImpl)
    const list = await api.listLatestVideos(['UCa', 'UCb'], 5)
    expect(list.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(list[0]).toMatchObject({ channelId: 'UCa', viewCount: 1234, thumbnailUrl: 'thumb/v1' })
    const calls = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]))
    expect(calls.filter((c) => c.includes('/videos?')).length).toBe(1)
    expect(calls.every((c) => c.includes('key=KEY'))).toBe(true)
  })
  it('getVideo returns null for unknown id', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({ videos: { items: [] } }))
    expect(await api.getVideo('zzz')).toBeNull()
  })
  it('getTopComments returns [] when comments are disabled', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({ commentThreads: { __status: 403, error: { errors: [{ reason: 'commentsDisabled' }] } } }))
    expect(await api.getTopComments('v1')).toEqual([])
  })
  it('throws YoutubeApiError on other failures', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({ videos: { __status: 400, error: { message: 'bad key' } } }))
    await expect(api.getVideo('v1')).rejects.toThrow('bad key')
  })
})
```
- [x] 3. FAIL 확인
- [x] 4. 구현
```ts
// url.ts
const ID = /^[A-Za-z0-9_-]{11}$/
export function parseVideoId(input: string): string | null {
  const s = input.trim()
  if (ID.test(s)) return s
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return null
  const fromQuery = u.searchParams.get('v')
  const fromPath = u.hostname === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
    : u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?]+)/)?.[1] ?? null
  const cand = fromQuery ?? fromPath
  return cand && ID.test(cand) ? cand : null
}
```
```ts
// api.ts
const BASE = 'https://www.googleapis.com/youtube/v3'
export function createYoutubeApi(apiKey: string, fetchImpl: typeof fetch = fetch): YoutubeApi {
  async function call<T>(resource: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${BASE}/${resource}`)
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) u.searchParams.set(k, v)
    const res = await fetchImpl(u)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = body?.error?.errors?.[0]?.reason
      throw new YoutubeApiError(res.status, reason ?? body?.error?.message ?? `YouTube API ${res.status}`)
    }
    return body as T
  }
  const toMeta = (it: any): VideoMeta => ({ id: it.id, channelId: it.snippet.channelId, channelTitle: it.snippet.channelTitle,
    title: it.snippet.title, description: it.snippet.description ?? '', thumbnailUrl: it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url ?? '',
    publishedAt: it.snippet.publishedAt, viewCount: Number(it.statistics?.viewCount ?? 0) })
  async function videosByIds(ids: string[]): Promise<VideoMeta[]> {
    const out: VideoMeta[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const body = await call<{ items: any[] }>('videos', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') })
      out.push(...body.items.map(toMeta))
    }
    return out
  }
  return {
    async listLatestVideos(channelIds, perChannel) {
      const ids: string[] = []
      for (const ch of channelIds) {
        const body = await call<{ items: { contentDetails: { videoId: string } }[] }>('playlistItems',
          { part: 'contentDetails', playlistId: 'UU' + ch.slice(2), maxResults: String(perChannel) })
        ids.push(...body.items.map((i) => i.contentDetails.videoId))
      }
      return videosByIds(ids)
    },
    async getVideo(id) { return (await videosByIds([id]))[0] ?? null },
    async getTopComments(id, max = 10) {
      try {
        const body = await call<{ items: any[] }>('commentThreads', { part: 'snippet', videoId: id, order: 'relevance', maxResults: String(max), textFormat: 'plainText' })
        return body.items.map((i) => i.snippet.topLevelComment.snippet.textDisplay as string)
      } catch (e) {
        if (e instanceof YoutubeApiError && e.message === 'commentsDisabled') return []
        throw e
      }
    },
  }
}
```
- [x] 5. PASS → 커밋 `feat: add YouTube URL parser and Data API client`
- [ ] 6. (코드 변경분 구현 완료, 실키 호출은 키 없어 건너뜀 — Comments 참조) 실키 확인(1회, 커밋 안 함): `YOUTUBE_API_KEY=... pnpm tsx -e "..."` 또는 vitest `it.skipIf(!process.env.YOUTUBE_API_KEY)` 케이스로 외롭여 채널 5개 받아보기. 재생목록 없는 채널(업로드 0)은 404 → 그 채널만 건너뛰도록 `listLatestVideos`에서 `YoutubeApiError` 404는 무시.

## 완료 기준
테스트 녹색. 실키로 6채널 호출 시 ≤ 12유닛, 30개 메타 반환.

## Comments

TDD 순서대로 진행: `tests/url.test.ts`와 `tests/youtube-api.test.ts`를 먼저 쓰고 모듈이 없어 실패하는 것을 확인한 뒤 구현했고, 전체 `pnpm test` 37개 통과, `tsc --noEmit`과 eslint(새 파일 4개) 클린. 인터페이스(이름·시그니처·경로)는 이슈와 동일. 이슈와 다른 점: (1) 단계 6의 코드 변경분만 구현 — `listLatestVideos`에서 `playlistItems`가 `YoutubeApiError` 404이면 그 채널만 건너뛰고, 그 외 오류는 그대로 던진다(테스트 추가: 404 채널 건너뛰기, 403은 여전히 throw). 404 테스트는 건너뛰기 조건을 일시적으로 깨뜨려 실패하는 것도 확인했다. (2) 수집된 영상 ID가 0개면 `videos`를 호출하지 않고 `[]`을 반환 — 이슈 구현의 `for (i < ids.length)` 루프가 이미 이렇게 동작하므로 이슈와 충돌 없음, 테스트(`videos` 호출 0회 단언)로 고정했다. (3) 이슈 코드의 `any`를 `VideoItem`/`PlaylistItem`/`CommentThread`/`ApiErrorBody` 로컬 타입으로 대체(런타임 동일), `YoutubeApiError`에 `this.name = 'YoutubeApiError'` 추가. (4) 이슈의 테스트 코드는 `routes` 타입이 `unknown | fn`으로 합쳐져 `tsc --noEmit`에서 암묵적 any 오류가 나서, 람다 매개변수에 `(u: URL)`, `(id: string)` 타입만 붙였다(동작 동일). 실키 확인(6채널 ≤ 12유닛, 30개 메타)은 세션에 `.env.local`/`YOUTUBE_API_KEY`가 없어 실행하지 못했다 — 키가 생기면 한 번 확인 필요. 열린 질문: `getTopComments`의 `commentsDisabled` 판정이 `e.message === 'commentsDisabled'`(이슈 그대로)라 reason 문자열에 의존한다. 동작에는 문제 없으나 `e.status === 403`도 함께 보는 편이 더 단단할 수 있다(제안만, 변경 안 함).
