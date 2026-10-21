# 17 뜨기 직전: README · AGENTS.md · 시연 컷

Status: resolved
Type: task
Blocked by: 16
Agent: issue-implementer
Model: sonnet

## 목표
구현된 뜨기 직전 영상 기능을 문서가 정확히 설명하고, "미구현"·"deferred" 문구가 어디에도 남지 않게 한다. 제작 의도에 평균 속도 선택 이유를 넣는다.

## 파일
- Modify: `README.md`, `AGENTS.md`, `src/lib/AGENTS.md`(15에서 못 채운 것), `src/app/AGENTS.md`(16에서 못 채운 것), `docs/demo.md`, `.scratch/marketing-agent/spec.md`(§1 표 가점 칸 확인만)

## 단계
- [x] 1. `README.md`
  - "가점 구현" 절: 뜨기 직전 영상 찾기 항목 추가 — 동작(① 토글 → 버튼 → '연애' 48시간 검색 → 조회수 1,000~5,000 ∧ 시간당 150+ → 초안까지), 할당량(클릭당 약 202유닛), 설정 키 `rising.*`.
  - 124줄 부근 "미구현 — 뜨기 직전 영상 찾기" 문단 삭제.
  - 제작 의도에 한 문단: 시간당 조회수를 평균으로 정의한 이유(즉시성·시연), 두 시점 측정은 확장 여지, ADR-0005 링크.
  - 설정 설명 표에 `rising` 블록.
  - 주의 절: 기존 `data/agent.db`가 있으면 `pnpm reset:data` 필요(스키마 변경).
- [x] 2. `AGENTS.md`
  - Don'ts: "Rising Video (deferred)" 삭제.
  - Domain Glossary 표: 뜨기 직전 영상 행을 "Bonus feature; found by '연애' search, draft only unless on an allowed channel"로, `시간당 조회수 | Views Per Hour | views ÷ hours since publish (average, single snapshot)` 행 추가.
  - Repository Layout / Environment Variables의 `config.yaml` 키 목록에 `rising.{keyword,min_views,max_views,min_views_per_hour,published_within_hours,pages}`.
  - Context Map의 ADR 항목에 0005 포함(`0001-0005`).
- [x] 3. `src/lib/AGENTS.md` Pure 모듈 목록·Layout, `src/app/AGENTS.md` API Surface(`GET/POST /api/rising`)·UI(① 토글) — 15·16이 이미 넣었으면 확인만.
- [x] 4. `docs/demo.md`: 선택 컷 추가(15초) — "① 토글 뜨기 직전 → 찾기 → 후보 선택 → ② 초안 → ③ 막힘(초안까지만)". 전체 길이 3분 넘지 않게 기존 컷 시간 조정 표시.
- [x] 5. `grep -rn "미구현\|deferred\|미룸" README.md AGENTS.md src/*/AGENTS.md docs/` → 뜨기 직전 관련 결과 0건.
- [x] 6. 커밋 `docs: describe rising video search and update agent rules`

## 완료 기준
README만 읽고 뜨기 직전 기능을 쓸 수 있다. AGENTS.md Don'ts와 코드가 모순 없음.

## Comments

단계 1~6 완료. 코드 변경 없음(문서만)이라 TDD 대상이 아니고, `pnpm exec tsc --noEmit` 무오류, `pnpm test` 174 passed · 1 skipped(변경 전과 동일). `src/` 아래 `.md` 외 파일은 건드리지 않아 `pnpm lint`는 돌리지 않았다. 단계 5 grep(`미구현|deferred|미룸`, README.md AGENTS.md src/*/AGENTS.md docs/)은 0건이고, 저장소 전체(이슈 파일 제외)로 넓혀도 0건이다. 이슈 텍스트의 숫자(클릭당 약 202유닛, 조회수 1,000~5,000, 시간당 150+, 48시간, 키워드 '연애')는 `config.yaml`·zod default·ADR-0005·실행 결과와 일치해 그대로 썼다(202 = `search.list` 2페이지 × 100 + `videos.list` 2회이고, 고유 영상이 50개 이하면 201). 이슈와 다르게 한 것. (1) `src/lib/AGENTS.md`·`src/app/AGENTS.md`는 15·16이 Layout·순수 모듈 목록·API Surface·① 토글을 이미 채워 두었다. 빠진 것만 더했다: lib에 ADR 0001-0005와 spec §18 참조, `openDb` 구 스키마 감지(reset 안내), Rising Video 패턴 절, 테스트 목록, 순수 모듈 "네 개" → "다섯 개"(15가 `youtube/rising.ts`를 추가해 모순이었음); app에 `/api/rising`은 폴링하지 않는다는 규칙과 POST 할당량 `~200` → `~202`. (2) Context Map에는 `0001-0004` 범위 표기가 없어(Repository Layout과 `src/lib/AGENTS.md`에 있었다) 그 두 곳을 `0001-0005`로 고치고 Context Map ADR 항목에는 `(0001-0005)`와 0005 설명을 덧붙였다. (3) 이슈 파일 목록 밖이지만 spec §16 리스크 표 "Data API 할당량" 행에 "`search.list`(100)는 미룸 범위에만"이 남아 있어(§18과 모순, 목표의 "어디에도 남지 않게"에 걸림) 뜨기 직전 찾기 1회 ≈ 202유닛으로 고쳤다. spec §1 표 가점 칸은 이미 "뜨기 직전 영상 찾기(§18)"가 들어 있어 바꾸지 않았다. (4) 이슈에 없지만 README에 한계 한 줄(평균이라 두 시점 실측보다 덜 정확, 값은 검색 시점 스냅샷)과 ① 행의 토글 안내, API 키 행의 할당량 문구를 더했다. 시연 컷(`docs/demo.md`)은 선택 컷 15초를 2:20에 넣고 한 바퀴 15→10초, ① 20→15초, 게시 기록 30→25초로 줄여 합 180초 = 3:00으로 맞췄다(선택 컷을 빼면 2:45). 열린 질문 / 제안(고치지 않음). (a) spec §18.5는 `ConfigResponse.rising`을 4필드로 적었지만 코드는 `publishedWithinHours`를 더한 5필드다(안내 문구의 48시간을 하드코딩하지 않으려는 것으로 보임). 스펙 갱신 여부를 정해 달라. (b) `src/app/AGENTS.md`의 "Issue 10's browser checklist is still partly pending"과 `src/lib/AGENTS.md` Layout의 `(planned)` 표시는 15~17과 무관한 낡은 문구로 보이나 범위 밖이라 두었다.
