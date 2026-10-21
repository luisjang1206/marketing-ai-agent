# 17 뜨기 직전: README · AGENTS.md · 시연 컷

Status: ready-for-agent
Type: task
Blocked by: 16
Agent: issue-implementer
Model: sonnet

## 목표
구현된 뜨기 직전 영상 기능을 문서가 정확히 설명하고, "미구현"·"deferred" 문구가 어디에도 남지 않게 한다. 제작 의도에 평균 속도 선택 이유를 넣는다.

## 파일
- Modify: `README.md`, `AGENTS.md`, `src/lib/AGENTS.md`(15에서 못 채운 것), `src/app/AGENTS.md`(16에서 못 채운 것), `docs/demo.md`, `.scratch/marketing-agent/spec.md`(§1 표 가점 칸 확인만)

## 단계
- [ ] 1. `README.md`
  - "가점 구현" 절: 뜨기 직전 영상 찾기 항목 추가 — 동작(① 토글 → 버튼 → '연애' 48시간 검색 → 조회수 1,000~5,000 ∧ 시간당 150+ → 초안까지), 할당량(클릭당 약 202유닛), 설정 키 `rising.*`.
  - 124줄 부근 "미구현 — 뜨기 직전 영상 찾기" 문단 삭제.
  - 제작 의도에 한 문단: 시간당 조회수를 평균으로 정의한 이유(즉시성·시연), 두 시점 측정은 확장 여지, ADR-0005 링크.
  - 설정 설명 표에 `rising` 블록.
  - 주의 절: 기존 `data/agent.db`가 있으면 `pnpm reset:data` 필요(스키마 변경).
- [ ] 2. `AGENTS.md`
  - Don'ts: "Rising Video (deferred)" 삭제.
  - Domain Glossary 표: 뜨기 직전 영상 행을 "Bonus feature; found by '연애' search, draft only unless on an allowed channel"로, `시간당 조회수 | Views Per Hour | views ÷ hours since publish (average, single snapshot)` 행 추가.
  - Repository Layout / Environment Variables의 `config.yaml` 키 목록에 `rising.{keyword,min_views,max_views,min_views_per_hour,published_within_hours,pages}`.
  - Context Map의 ADR 항목에 0005 포함(`0001-0005`).
- [ ] 3. `src/lib/AGENTS.md` Pure 모듈 목록·Layout, `src/app/AGENTS.md` API Surface(`GET/POST /api/rising`)·UI(① 토글) — 15·16이 이미 넣었으면 확인만.
- [ ] 4. `docs/demo.md`: 선택 컷 추가(15초) — "① 토글 뜨기 직전 → 찾기 → 후보 선택 → ② 초안 → ③ 막힘(초안까지만)". 전체 길이 3분 넘지 않게 기존 컷 시간 조정 표시.
- [ ] 5. `grep -rn "미구현\|deferred\|미룸" README.md AGENTS.md src/*/AGENTS.md docs/` → 뜨기 직전 관련 결과 0건.
- [ ] 6. 커밋 `docs: describe rising video search and update agent rules`

## 완료 기준
README만 읽고 뜨기 직전 기능을 쓸 수 있다. AGENTS.md Don'ts와 코드가 모순 없음.
