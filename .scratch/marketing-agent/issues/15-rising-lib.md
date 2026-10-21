# 15 뜨기 직전: 설정 · 스키마 · 판정 · 검색 어댑터 · 리포

Status: resolved
Type: task
Blocked by: 11
Agent: issue-implementer
Model: sonnet

## 목표
spec §18.1~18.4, ADR-0005. 라우트·UI(16) 없이 `src/lib`만. 순수 판정 함수, Data API 검색, SQLite 표, 설정 키, 구 스키마 감지.

## 파일
- Modify: `src/lib/config.ts`, `config.yaml`, `src/lib/db.ts`, `src/lib/repo/videos.ts`(source 유니온), `src/lib/youtube/map.ts`(source 타입), `src/lib/youtube/api.ts`
- Create: `src/lib/youtube/rising.ts`, `src/lib/repo/rising.ts`
- Test: `tests/rising.test.ts`, `tests/db.test.ts`, 추가: `tests/config.test.ts`, `tests/youtube-api.test.ts`, `tests/repo.test.ts`
- 문서: `src/lib/AGENTS.md` Layout에 두 파일 한 줄씩 추가(유지 정책)

## 인터페이스
```ts
// config.ts — AppConfigSchema 에 추가 (zod default 로 기존 config 호환)
rising: z.object({
  keyword: z.string().min(1),
  min_views: z.number().int().min(0),
  max_views: z.number().int().positive(),
  min_views_per_hour: z.number().min(0),
  published_within_hours: z.number().positive(),
  pages: z.number().int().min(1).max(5),
}).default({ keyword: '연애', min_views: 1000, max_views: 5000, min_views_per_hour: 150, published_within_hours: 48, pages: 2 })

// youtube/rising.ts — 순수. node:* · db · repo import 금지
export type RisingRules = { minViews: number; maxViews: number; minViewsPerHour: number }
export type RisingAssessment = { hoursSincePublish: number; viewsPerHour: number; rising: boolean }
export function assessRising(v: { viewCount: number; publishedAt: string }, now: Date, rules: RisingRules): RisingAssessment
export function publishedAfterIso(now: Date, withinHours: number): string   // 'YYYY-MM-DDTHH:mm:ssZ' (밀리초 없음)

// youtube/api.ts — YoutubeApi 에 추가
searchRecentVideos(q: string, publishedAfter: string, pages: number): Promise<VideoMeta[]>

// repo/videos.ts — source 유니온 확장 (다른 시그니처 불변)
source: 'list' | 'direct' | 'rising'
// youtube/map.ts — toRow(meta, source: VideoRow['source'])

// repo/rising.ts
export type RisingSearchRow = { id: number; keyword: string; scanned: number; found: number; searched_at: string }
export type RisingCandidateRow = { search_id: number; video_id: string; view_count: number; hours_since_publish: number; views_per_hour: number }
export type RisingCandidateJoined = RisingCandidateRow & VideoRow
export function insertRisingSearch(db, s: { keyword: string; scanned: number; found: number }, candidates: Omit<RisingCandidateRow, 'search_id'>[]): number   // search id
export function latestRisingSearch(db): RisingSearchRow | undefined
export function listRisingCandidates(db, searchId: number): RisingCandidateJoined[]   // JOIN videos, ORDER BY views_per_hour DESC
```

## 단계
- [x] 1. `tests/rising.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { assessRising, publishedAfterIso } from '@/lib/youtube/rising'
const rules = { minViews: 1000, maxViews: 5000, minViewsPerHour: 150 }
const now = new Date('2026-10-21T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
describe('assessRising', () => {
  it('computes average views per hour since publish', () => {
    const a = assessRising({ viewCount: 3000, publishedAt: hoursAgo(10) }, now, rules)
    expect(a.hoursSincePublish).toBeCloseTo(10); expect(a.viewsPerHour).toBeCloseTo(300); expect(a.rising).toBe(true)
  })
  it('includes the boundaries', () => {
    expect(assessRising({ viewCount: 1000, publishedAt: hoursAgo(1) }, now, rules).rising).toBe(true)
    expect(assessRising({ viewCount: 5000, publishedAt: hoursAgo(33) }, now, rules).rising).toBe(true)   // 151.5/h
    expect(assessRising({ viewCount: 1500, publishedAt: hoursAgo(10) }, now, rules).rising).toBe(true)   // 정확히 150/h
  })
  it('rejects too few, too many, or too slow', () => {
    expect(assessRising({ viewCount: 999, publishedAt: hoursAgo(1) }, now, rules).rising).toBe(false)
    expect(assessRising({ viewCount: 5001, publishedAt: hoursAgo(1) }, now, rules).rising).toBe(false)
    expect(assessRising({ viewCount: 3000, publishedAt: hoursAgo(30) }, now, rules).rising).toBe(false)   // 100/h
  })
  it('clamps age to one minute so a just-published video does not divide by zero', () => {
    const a = assessRising({ viewCount: 1200, publishedAt: now.toISOString() }, now, rules)
    expect(a.hoursSincePublish).toBeCloseTo(1 / 60); expect(Number.isFinite(a.viewsPerHour)).toBe(true); expect(a.rising).toBe(true)
  })
})
describe('publishedAfterIso', () => {
  it('formats RFC3339 without milliseconds', () => {
    expect(publishedAfterIso(now, 48)).toBe('2026-10-19T12:00:00Z')
  })
})
```
- [x] 2. `tests/db.test.ts` — 구 스키마 감지
```ts
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from '@/lib/db'
describe('openDb', () => {
  it('creates the rising tables on a fresh database', () => {
    const db = openDb(':memory:')
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['rising_searches', 'rising_candidates']))
  })
  it('refuses a database whose videos table predates source=rising', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'db-')), 'agent.db')
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE videos (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, channel_title TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', thumbnail_url TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL CHECK (source IN ('list','direct')),
      fetched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`)
    old.close()
    expect(() => openDb(file)).toThrow(/reset:data/)
  })
})
```
- [x] 3. `tests/config.test.ts`에 추가
```ts
it('defaults rising rules when the block is absent', () => {
  expect(parseConfig(yaml).rising).toEqual({ keyword: '연애', min_views: 1000, max_views: 5000, min_views_per_hour: 150, published_within_hours: 48, pages: 2 })
})
```
- [x] 4. `tests/youtube-api.test.ts`에 추가 (기존 `fakeFetch`·`snippet` 헬퍼 재사용)
```ts
it('searchRecentVideos follows nextPageToken up to pages and dedupes ids', async () => {
  const fetchImpl = fakeFetch({
    search: (u) => u.searchParams.get('pageToken') === 'P2'
      ? { items: [{ id: { videoId: 'v2' } }, { id: { videoId: 'v1' } }] }
      : { items: [{ id: { videoId: 'v1' } }, { id: { kind: 'youtube#channel' } }], nextPageToken: 'P2' },
    videos: (u) => ({ items: u.searchParams.get('id')!.split(',').map((id) => snippet(id, 'UCx')) }),
  })
  const api = createYoutubeApi('KEY', fetchImpl)
  const list = await api.searchRecentVideos('연애', '2026-10-19T12:00:00Z', 2)
  expect(list.map((v) => v.id)).toEqual(['v1', 'v2'])
  const calls = (fetchImpl as unknown as { mock: { calls: [URL][] } }).mock.calls.map((c) => new URL(String(c[0])))
  const searches = calls.filter((u) => u.pathname.endsWith('/search'))
  expect(searches).toHaveLength(2)
  const p = searches[0].searchParams
  expect([p.get('q'), p.get('type'), p.get('order'), p.get('maxResults'), p.get('regionCode'), p.get('relevanceLanguage'), p.get('publishedAfter')])
    .toEqual(['연애', 'video', 'date', '50', 'KR', 'ko', '2026-10-19T12:00:00Z'])
  expect(calls.filter((u) => u.pathname.endsWith('/videos'))).toHaveLength(1)
})
it('searchRecentVideos stops early when there is no next page', async () => {
  const fetchImpl = fakeFetch({ search: { items: [{ id: { videoId: 'v1' } }] }, videos: (u) => ({ items: [snippet('v1', 'UCx')] }) })
  await createYoutubeApi('KEY', fetchImpl).searchRecentVideos('연애', '2026-10-19T12:00:00Z', 3)
  expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.filter((c) => String((c as [URL])[0]).includes('/search'))).toHaveLength(1)
})
```
- [x] 5. `tests/repo.test.ts`에 추가
```ts
import { insertRisingSearch, latestRisingSearch, listRisingCandidates } from '@/lib/repo/rising'
describe('rising', () => {
  it('stores a search with candidates and lists the latest search by views per hour', () => {
    upsertVideos(db, [{ ...video('r1'), source: 'rising' }, { ...video('r2'), source: 'rising' }])
    insertRisingSearch(db, { keyword: '연애', scanned: 10, found: 0 }, [])
    const id = insertRisingSearch(db, { keyword: '연애', scanned: 100, found: 2 }, [
      { video_id: 'r1', view_count: 1200, hours_since_publish: 6, views_per_hour: 200 },
      { video_id: 'r2', view_count: 4000, hours_since_publish: 8, views_per_hour: 500 },
    ])
    const latest = latestRisingSearch(db)!
    expect(latest.id).toBe(id); expect(latest).toMatchObject({ keyword: '연애', scanned: 100, found: 2 })
    const rows = listRisingCandidates(db, id)
    expect(rows.map((r) => r.video_id)).toEqual(['r2', 'r1'])
    expect(rows[0]).toMatchObject({ title: 'tr2', views_per_hour: 500, source: 'rising' })
  })
  it('latestRisingSearch is undefined before any search', () => expect(latestRisingSearch(db)).toBeUndefined())
})
```
- [x] 6. 전부 FAIL 확인 → 구현:
```ts
// youtube/rising.ts
const MIN_HOURS = 1 / 60
export function assessRising(v, now, rules) {
  const hoursSincePublish = Math.max((now.getTime() - Date.parse(v.publishedAt)) / 3_600_000, MIN_HOURS)
  const viewsPerHour = v.viewCount / hoursSincePublish
  const rising = v.viewCount >= rules.minViews && v.viewCount <= rules.maxViews && viewsPerHour >= rules.minViewsPerHour
  return { hoursSincePublish, viewsPerHour, rising }
}
export function publishedAfterIso(now, withinHours) {
  return new Date(now.getTime() - withinHours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
```
```ts
// youtube/api.ts — 타입 추가 type SearchItem = { id: { videoId?: string }; }  반환 객체에 추가:
async searchRecentVideos(q, publishedAfter, pages) {
  const ids: string[] = []
  let pageToken: string | undefined
  for (let p = 0; p < pages; p++) {
    const body = await call<{ items: SearchItem[]; nextPageToken?: string }>('search', {
      part: 'snippet', type: 'video', order: 'date', maxResults: '50', regionCode: 'KR', relevanceLanguage: 'ko', q, publishedAfter,
      ...(pageToken ? { pageToken } : {}) })
    for (const it of body.items) if (it.id.videoId) ids.push(it.id.videoId)
    pageToken = body.nextPageToken
    if (!pageToken) break
  }
  return videosByIds([...new Set(ids)])
},
```
```sql
-- db.ts SCHEMA: videos.source CHECK 에 'rising' 추가 + 두 표
CREATE TABLE IF NOT EXISTS rising_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, scanned INTEGER NOT NULL, found INTEGER NOT NULL,
  searched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS rising_candidates (
  search_id INTEGER NOT NULL REFERENCES rising_searches(id), video_id TEXT NOT NULL REFERENCES videos(id),
  view_count INTEGER NOT NULL, hours_since_publish REAL NOT NULL, views_per_hour REAL NOT NULL,
  PRIMARY KEY (search_id, video_id));
```
```ts
// db.ts openDb — db.exec(SCHEMA) 뒤
const videosSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='videos'`).get() as { sql: string }).sql
if (!videosSql.includes(`'rising'`)) throw new Error('data/agent.db 스키마가 바뀌었습니다. 개발 서버를 끄고 pnpm reset:data 를 실행한 뒤 다시 시작하세요')
```
`repo/rising.ts`는 repo 패턴(`?` 자리표시자, db 첫 인자). `insertRisingSearch`는 검색 행 INSERT → `lastInsertRowid` → 후보 INSERT 루프 → id 반환. `listRisingCandidates`는 `SELECT c.*, v.* FROM rising_candidates c JOIN videos v ON v.id=c.video_id WHERE c.search_id=? ORDER BY c.views_per_hour DESC`.
- [x] 7. `config.yaml`에 §18.3 블록 추가(주석 포함). `src/lib/AGENTS.md` Layout 표에 `youtube/rising.ts  assessRising(), publishedAfterIso() -- pure`, `repo/rising.ts` 줄 추가. Pure 모듈 목록에 `youtube/rising.ts` 추가.
- [x] 8. `pnpm test` 전체 녹색, `pnpm exec tsc --noEmit`, `pnpm lint` → 커밋 `feat: add rising video rules, search adapter and storage`
- [ ] 9. 실키 확인(커밋 안 함): `it.skipIf(!process.env.YOUTUBE_API_KEY)`로 `searchRecentVideos('연애', publishedAfterIso(new Date(), 48), 1)` 1회 → 결과 수와 `assessRising` 통과 수를 Comments에 적는다. 100유닛 소비.

## 완료 기준
테스트 녹색. 기존 `data/agent.db`로 `pnpm dev` 띄우면 터미널에 reset 안내 오류가 보인다(사용자가 `pnpm reset:data` 실행 — 게시 기록 삭제됨, 사전 고지). 실키 1회 검색에서 후보 ≥ 0개 확인.

## Comments

단계 1~8 완료: 테스트 5개 파일 먼저 작성해 전부 FAIL(모듈 없음 / 함수 없음 / 기본값 없음 / 구 스키마 미감지) 확인 뒤 구현, `pnpm test` 174 passed · 1 skipped, `pnpm exec tsc --noEmit`·`pnpm lint` 무오류. 이슈와 다르게 한 것 세 가지. (1) `tests/api-routes.test.ts`의 `yt` 가짜 객체에 `searchRecentVideos: vi.fn<...>()` 한 줄 추가 — `YoutubeApi`에 메서드가 늘어 tsc가 깨졌기 때문(이슈 파일 목록에 없던 파일). (2) 이슈의 `youtube-api` 테스트 코드는 `(u) =>`를 타입 없이 썼으나 `fakeFetch`의 routes 타입이 `unknown`이라 tsc가 암묵적 any로 거부하므로 기존 테스트처럼 `(u: URL) =>`로 주석했고, 두 번째 테스트의 쓰지 않는 `u`는 뺐다. (3) `openDb`가 구 스키마 오류를 던지기 전에 `db.close()`를 한다(핸들 누수 방지). 열린 질문: `listRisingCandidates`의 `SELECT c.*, v.*`는 `view_count`가 양쪽 표에 있어 뒤에 오는 `v.view_count`(영상 표의 현재 조회수)가 이긴다(node:sqlite로 확인). 검색 직후엔 라우트가 먼저 upsert하므로 같은 값이지만, 이후 같은 영상이 다른 경로로 재조회되면 후보 스냅샷 값과 어긋날 수 있다. 이슈 16에서 배지 숫자를 스냅샷 기준으로 쓰려면 SELECT 열 순서를 바꾸거나 별칭을 줘야 한다. 단계 9(실키 확인)는 미완료로 남긴다: 임시 테스트로 `searchRecentVideos('연애', publishedAfterIso(new Date(), 48), 1)`을 1회 실행했고(테스트가 skip이 아니라 통과로 보고되어 키는 로드됨, 100유닛 소비) 임시 파일은 삭제했으나, vitest 5가 통과한 테스트의 `console.log`를 출력하지 않아 결과 수·통과 수를 기록하지 못했다(캐치 블록이 오류도 삼키므로 호출 성공 여부도 단정할 수 없다). 1회 제한 때문에 재실행하지 않았다. 기록하려면 한 번 더 100유닛이 필요하고, 그때는 결과를 콘솔이 아니라 파일로 쓰게 한다.
