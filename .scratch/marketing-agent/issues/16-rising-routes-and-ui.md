# 16 뜨기 직전: 라우트 · ① 토글 UI

Status: ready-for-agent
Type: task
Blocked by: 15
Agent: issue-implementer
Model: sonnet

## 목표
spec §18.5~18.6. `GET/POST /api/rising`, ① 칸 모드 토글, 뜨기 직전 카드 배지, ③ 안내 한 줄. 운영 규칙·②·③ 로직은 바꾸지 않는다.

## 파일
- Create: `src/app/api/rising/route.ts`
- Modify: `src/lib/api-types.ts`, `src/app/api/config/route.ts`, `src/lib/client/api.ts`, `src/components/VideoList.tsx`, `src/app/page.tsx`
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
- [ ] 1. `api-types.ts`, `/api/config`, `client/api.ts` 추가 → `pnpm exec tsc --noEmit`
- [ ] 2. `src/app/api/rising/route.ts` 구현 → curl 확인 (`pnpm dev`, 실키·200유닛 소비 1회):
```bash
curl -s localhost:3000/api/rising
curl -s -X POST localhost:3000/api/rising | head -c 600
```
- [ ] 3. `VideoList` 토글·rising 모드 → `page.tsx` 연결 → ③ 안내 줄
- [ ] 4. 브라우저 수동 체크리스트
  - [ ] 토글 "뜨기 직전" → [뜨기 직전 찾기] → 로딩 → 상태 줄·후보 카드(조회수·시간당 배지)
  - [ ] 후보 클릭 → ② 고민 한 줄·근거 장면·초안 생성
  - [ ] ③ 버튼 비활성, 툴팁 "허용 채널의 영상이 아닙니다", 안내 줄 "초안까지만"
  - [ ] 토글 "허용 채널 최신"으로 돌아가도 선택·초안 유지
  - [ ] 새로고침 → 마지막 검색 결과·시각 그대로
  - [ ] 후보 0개 문구 (설정의 `min_views`를 잠깐 99999로 올려 확인 후 되돌림)
- [ ] 5. `pnpm build`, `pnpm lint` 통과 → 커밋 `feat: find rising videos from the dashboard`

## 완료 기준
체크리스트 통과. ② ③ 기존 동작 회귀 없음(허용 채널 영상 게시 흐름 그대로). 1280×800에서 가로 스크롤 없음.
