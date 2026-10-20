---
status: accepted
date: 2026-10-20
---

# 로컬 Next.js 앱 안에서 Playwright(Node)를 직접 구동한다

대시보드는 본인 컴퓨터에서 실행되어 크롬 프로필을 열어야 하므로 웹 배포가 불가능하다. Next.js(App Router, TypeScript) + shadcn/ui로 UI를 만들고, 같은 Node 프로세스의 Route Handler에서 Playwright(Node)로 게시를 수행한다. Python(FastAPI + playwright-python)과 Electron도 고려했으나, 한 언어로 UI·에이전트·운영 규칙을 모두 다루고 이미 설치된 툴체인(node 25, pnpm)을 그대로 쓰는 쪽이 마감(2026-10-30)에 유리하다.

## Considered Options

- Python FastAPI + playwright-python: 로컬 python이 3.9라 런타임 설치부터 필요, UI 따로 만들어야 함.
- Electron: 패키징·IPC 비용이 데모 규모에 비해 과함.
- 별도 워커 프로세스 + Next.js UI: 가장 견고하나 코드 2배. 작업 상태를 프로세스 메모리에 두지 않으면 나중에 분리 가능하므로 지금은 하지 않는다.

## Consequences

- Playwright는 Next.js 번들에서 제외해야 한다(`serverExternalPackages`).
- 개발 서버의 HMR이 서버 모듈을 다시 로드할 수 있으므로 진행 중인 게시 상태는 메모리가 아닌 저장소에 둔다.
