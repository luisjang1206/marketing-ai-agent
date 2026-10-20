---
status: accepted
date: 2026-10-20
---

# 저장소는 Node 내장 `node:sqlite` 한 파일

게시 기록·하루 상한 카운트·영상당 1개 검사·초안 캐시·진행 상태를 모두 `data/agent.db`(SQLite) 한 파일에 둔다. ORM이나 외부 드라이버 없이 Node 25에 내장된 `node:sqlite`를 직접 쓴다. better-sqlite3는 Node 25용 prebuilt가 늦을 수 있어 설치 사고 위험이 있고, JSON 파일은 동시 쓰기와 시간순 조회에 약하다. 운영 규칙은 전부 이 저장소를 질의해서 판단하므로, 규칙의 근거가 한 곳에 모인다.

## Consequences

- Node 25 이상이 실행 요건이 된다(README 명시).
- `data/`는 저장소에 올리지 않는다. 시연 전에는 비운 상태에서 시작한다.
