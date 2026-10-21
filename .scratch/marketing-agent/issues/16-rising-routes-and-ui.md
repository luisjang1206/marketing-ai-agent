# 16 뜨기 직전: 라우트 · ① 토글 UI

Status: resolved
Type: task
Blocked by: 15
Agent: issue-implementer
Model: sonnet

## 목표
spec §18.5~18.6. `GET/POST /api/rising`, ① 칸 모드 토글, 뜨기 직전 카드 배지, ③ 안내 한 줄. 운영 규칙·②·③ 로직은 바꾸지 않는다.

## 파일
- Create: `src/app/api/rising/route.ts`
- Modify: `src/lib/repo/rising.ts`(SELECT 열 순서만), `src/lib/api-types.ts`, `src/app/api/config/route.ts`, `src/lib/client/api.ts`, `src/components/VideoList.tsx`, `src/app/page.tsx`
- Test: `tests/repo.test.ts`(단언 한 줄 추가)
- 문서: `src/app/AGENTS.md` API Surface·UI 절에 한 줄씩

## 인터페이스
```ts
// api-types.ts
export type RisingCandidateView = VideoView & { viewsPerHour: number; hoursSincePublish: number }
export type RisingResponse = { keyword: string; searchedAt: string | null; scanned: number; candidates: RisingCandidateView[] }
// ConfigResponse 에 추가
rising: { keyword: string; minViews: number; maxViews: number; minViewsPerHour: number; publishedWithinHours: number }

// client/api.ts
KEYS.rising = '/api/rising'
export const getRising = () => request<RisingResponse>(KEYS.rising)
export const searchRising = () => request<RisingResponse>(KEYS.rising, { method: 'POST' })

// VideoList props 추가 (기존 props 불변)
mode: 'latest' | 'rising'
onModeChange(mode: 'latest' | 'rising'): void
rising: RisingResponse | null
risingLoading: boolean
onSearchRising(): void
risingHint: string          // "'연애' 48시간 · 조회수 1,000~5,000 · 시간당 150+"
```

## 라우트 동작 (`/api/rising`)
- GET: `latestRisingSearch(db)` 없으면 `{ keyword: cfg.rising.keyword, searchedAt: null, scanned: 0, candidates: [] }`. 있으면 `listRisingCandidates(db, s.id)` → 각 행을 `VideoView` 꼴(`captionSource`, `hasDraft`, `isTestChannel`)로 만들고 `viewsPerHour`, `hoursSincePublish` 붙임.
- POST: `now = new Date()` → `youtube.searchRecentVideos(cfg.rising.keyword, publishedAfterIso(now, cfg.rising.published_within_hours), cfg.rising.pages)` → 각 메타 `assessRising(meta, now, { minViews: cfg.rising.min_views, maxViews: cfg.rising.max_views, minViewsPerHour: cfg.rising.min_views_per_hour })` → rising인 것만 `upsertVideos(db, metas.map(m => toRow(m, 'rising')))` → `insertRisingSearch(db, { keyword, scanned: metas.length, found: rising.length }, candidates)` → GET과 같은 응답. 실패 502 `{ reason: 'upstream_error', message: '뜨기 직전 영상을 찾지 못했습니다: …' }`.
- 둘 다 `runtime='nodejs'`, `dynamic='force-dynamic'`.
- 응답의 `view_count`는 검색 시점 스냅샷(`rising_candidates.view_count`)이다. 같은 영상이 나중에 목록·직접 입력으로 다시 upsert돼도 배지의 조회수와 시간당 값은 같은 시점 숫자여야 한다 → 단계 1.
- `upsertVideos`는 `ON CONFLICT`에서 `source`를 안 바꾸므로, 이미 목록/직접 입력으로 저장된 영상은 원래 source를 유지한다(의도).

## UI 동작
- `page.tsx`: `const [mode, setMode] = useState<'latest'|'rising'>('latest')`; `useSWR<RisingResponse>(KEYS.rising, fetcher, { revalidateOnFocus: false })`; `searchRisingNow()`는 `mutate(KEYS.rising, await searchRising(), { revalidate: false })`, 오류는 ① 칸 `ErrorAlert`.
- 선택 가능한 영상 = `mode === 'rising' ? rising.candidates : videos` 가 아니라 **둘을 합친 목록**에서 `selectedId`를 찾는다(모드를 바꿔도 선택이 유지되게): `const video = [...videos, ...(rising?.candidates ?? [])].find(v => v.id === selectedId)`.
- `VideoList`: 상단에 모드 토글(두 개 `Button size="xs"` `aria-pressed`, 라벨 "허용 채널 최신" / "뜨기 직전"). 
  - latest 모드 = 기존 그대로.
  - rising 모드: [불러오기] 대신 [뜨기 직전 찾기](로딩 중 비활성, `Loader2`), 옆에 `risingHint` 작은 글씨. 그 아래 상태 줄: `searchedAt`이 있으면 "마지막 검색 {relativeTime(searchedAt)} · 훑은 영상 {scanned}개 · 후보 {candidates.length}개", 없으면 "아직 검색하지 않았습니다". 채널 칩 없음. 카드는 같은 마크업 + 배지 `조회수 {view_count.toLocaleString('ko-KR')} · 시간당 +{Math.round(viewsPerHour)}`. 후보 0개면 "조건에 맞는 영상이 없습니다. 잠시 뒤 다시 찾아보세요".
  - 직접 입력 폼은 두 모드 모두 보인다.
- ③: `page.tsx`에서 `video?.source === 'rising' && verdict && !verdict.allowed && verdict.reason === 'not_allowed_channel'`이면 `PostPanel` 위에 `<p className="text-xs text-muted-foreground">뜨기 직전 영상은 초안까지만 만듭니다 (허용 채널 아님)</p>`. PostPanel 자체는 안 바꾼다.
- `/api/config`: `rising` 필드 추가. `risingHint`는 page.tsx가 config에서 조립: `` `'${r.keyword}' ${r.publishedWithinHours}시간 · 조회수 ${r.minViews.toLocaleString('ko-KR')}~${r.maxViews.toLocaleString('ko-KR')} · 시간당 ${r.minViewsPerHour}+` ``.

## 단계
- [x] 1. `listRisingCandidates`가 후보 스냅샷 `view_count`를 돌려주게 한다. 이슈 15의 `SELECT c.*, v.*`는 같은 이름 열을 뒤쪽 `v.view_count`(videos 현재값)가 덮는다.
  - `tests/repo.test.ts` `describe('rising')` 첫 테스트 끝에 추가 → `pnpm test tests/repo.test.ts` FAIL 확인(지금 10이 나옴):
```ts
expect(rows[0].view_count).toBe(4000)   // 후보 스냅샷, videos 표 값(10) 아님
```
  - `src/lib/repo/rising.ts`: `SELECT c.*, v.*` → `SELECT v.*, c.*` (열 순서만. 타입·시그니처·ORDER BY 불변) → PASS 확인.
- [x] 2. `api-types.ts`, `/api/config`, `client/api.ts` 추가 → `pnpm exec tsc --noEmit`
- [x] 3. `src/app/api/rising/route.ts` 구현 → curl 확인 (`pnpm dev`, 실키·200유닛 소비 1회):
```bash
curl -s localhost:3000/api/rising
curl -s -X POST localhost:3000/api/rising | head -c 600
```
- [x] 4. `VideoList` 토글·rising 모드 → `page.tsx` 연결 → ③ 안내 줄
- [ ] 5. 브라우저 수동 체크리스트
  - [ ] 토글 "뜨기 직전" → [뜨기 직전 찾기] → 로딩 → 상태 줄·후보 카드(조회수·시간당 배지)
  - [ ] 후보 클릭 → ② 고민 한 줄·근거 장면·초안 생성
  - [ ] ③ 버튼 비활성, 툴팁 "허용 채널의 영상이 아닙니다", 안내 줄 "초안까지만"
  - [ ] 토글 "허용 채널 최신"으로 돌아가도 선택·초안 유지
  - [ ] 새로고침 → 마지막 검색 결과·시각 그대로
  - [ ] 후보 0개 문구 (설정의 `min_views`를 잠깐 99999로 올려 확인 후 되돌림)
- [x] 6. `pnpm build`, `pnpm lint` 통과 → 커밋 `feat: find rising videos from the dashboard`

## 완료 기준
체크리스트 통과. ② ③ 기존 동작 회귀 없음(허용 채널 영상 게시 흐름 그대로). 1280×800에서 가로 스크롤 없음.

## Comments

단계 1~4, 6 완료. 단계 5(브라우저 수동 체크리스트)는 브라우저가 없어 하지 않았고 메인 세션에 남긴다(위 체크박스는 그대로 비워 둠). 단계 1: `tests/repo.test.ts`에 `expect(rows[0].view_count).toBe(4000)` 한 줄을 먼저 넣어 FAIL(10) 확인 뒤 `SELECT v.*, c.*`로 바꿔 PASS. 단계 3 curl(실키, 실행 중인 `next dev` 3000번): GET(검색 전) `{"keyword":"연애","searchedAt":null,"scanned":0,"candidates":[]}` → POST 1회(HTTP 200, 약 202유닛) 훑은 영상 100개 · 후보 20개, 상위 후보 `view_count` 3115 · `viewsPerHour` 2999.5 · `hoursSincePublish` 1.04 · `source: rising` → GET 재호출은 같은 `searchedAt`(2026-10-21 16:25:42)·scanned 100·후보 20개. `/api/config`에 `rising` 5개 필드 확인. `pnpm test` 174 passed · 1 skipped, `pnpm exec tsc --noEmit`·`pnpm lint` 무오류. 이슈와 다르게 한 것. (1) `tests/api-routes.test.ts`의 `GET /api/config` 단언은 응답 전체를 `toEqual`로 비교해서, `ConfigResponse.rising`을 더하면 깨진다. 기대값에 `rising` 한 줄을 추가했다(이슈 파일 목록에 없던 파일, 15에서 같은 파일을 고친 것과 같은 사정). (2) 이슈에 없지만 `page.tsx`의 초안 생성·다시 생성 성공 때 `mutate(KEYS.rising)`을 `mutate(KEYS.videos)` 옆에 더했다. 뜨기 직전 카드도 같은 마크업이라 "초안" 배지가 있는데, 이게 없으면 초안을 만든 뒤에도 후보 카드의 배지가 갱신되지 않는다(조회수 API 호출 없음, DB 읽기만). (3) `risingLoading`은 검색 요청이 진행 중일 때만 true로 넘기고(저장된 결과를 읽는 첫 GET은 포함 안 함), `rising`이 아직 null이면 상태 줄을 비운다. 그래서 새로고침 직후 "아직 검색하지 않았습니다"가 잠깐 깜빡이지 않는다. 후보 0개 문구("조건에 맞는 영상이 없습니다…")는 검색 기록이 있을 때(`searchedAt` 있음)만 보이고, 한 번도 검색하지 않았을 땐 상태 줄 "아직 검색하지 않았습니다"만 보인다. (4) 상태 줄의 `searchedAt`은 DB가 `YYYY-MM-DD HH:mm:ss`(로컬 시각)로 주므로 `' '`를 `'T'`로 바꿔 `relativeTime`에 넘긴다(공백 형식은 Safari에서 NaN일 수 있음). (5) 오류 알림은 모드별로 하나만 보인다(최신 = `videosError`, 뜨기 직전 = `risingError`). `pnpm build`는 이 작업트리에서 `data/profiles/1/RunningChromeVersion`(크롬 종료 때 남은 끊어진 심볼릭 링크로 보임; 지금 그 프로필을 쓰는 크롬 프로세스는 없음) 때문에 Turbopack이 `src/lib/draft/anthropic.ts`의 `process.cwd()` 추적 중 `could not be resolved` 오류로 실패한다. `data/`는 건드리지 않는 규칙이라 손대지 않고, `data/`를 뺀 저장소 복사본(scratchpad)에서 `pnpm build`를 돌려 통과(라우트 목록에 `/api/rising` 포함)를 확인한 뒤 복사본을 지웠다. 이 오류는 이번 변경과 무관하게 해당 링크가 남아 있는 동안 어느 커밋에서나 난다. 열린 질문. (a) 뜨기 직전 모드에서 직접 입력으로 영상을 추가하면 그 영상이 골라지지만(②③ 표시) 뜨기 직전 목록에는 카드가 없다(허용 채널 영상이라 "허용 채널 최신" 목록에 있음). 추가 성공 시 최신 모드로 자동 전환할지는 이슈에 없어 그대로 두었다. (b) 위 끊어진 심볼릭 링크 때문에 `pnpm build`가 막히므로, 사용자가 개발 서버·크롬을 끈 뒤 정리할지 결정이 필요하다.
