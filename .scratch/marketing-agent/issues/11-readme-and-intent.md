# 11 README · 제작 의도 · 시연 시나리오

Status: resolved
Type: task
Blocked by: 10
Agent: issue-implementer
Model: sonnet

## 목표
심사자가 저장소만 보고 설치·실행·설계 의도를 이해한다(제작 의도 5점 + 가점 어필).

## 파일
- Modify: `README.md`
- Create: `docs/demo.md`

## README 구성 (한국어)
1. 한 줄 소개 + 화면 캡처 1장(`docs/images/dashboard.png`, 시연 직전 찍은 것)
2. 세 칸 흐름 설명(① ② ③) — PDF 용어 그대로
3. 설치: Node ≥ 25, pnpm, Google Chrome, (선택) `brew install yt-dlp`
4. 설정: `.env.local` 키 2개(발급 링크), `config.yaml` 항목 설명(테스트 채널 ID 넣는 법)
5. 실행: `pnpm install` → `pnpm dev` → `/settings`에서 프로필 로그인 → 대시보드
6. 운영 규칙: 세 규칙 + 차단 기록 + `pnpm test`
7. 가점 구현: 프로필 1~3 수동/자동 배정, 링크 직접 입력, 즉석 초안. 미구현: 뜨기 직전 영상 찾기(이유 한 줄)
8. **제작 의도**
   - 맥락 우선: 자막 → 고민 한 줄 → 근거 장면 → 초안. 근거 장면을 따로 보여 "이 영상에서만 나올 댓글"인지 사람이 바로 확인
   - 사람처럼: 실제 Chrome 프로필, 한 글자 타이핑, 시청자 페르소나, 운명원은 전문(傳聞) 형태로 1회
   - 안전장치: 운영 규칙을 순수 함수로 코드 강제, 차단까지 기록, 단위 테스트
   - 설계 결정 링크: `docs/adr/0001~0004`, 용어: `CONTEXT.md`
9. 오픈소스 출처: Next.js, Playwright, yt-dlp, shadcn/ui, Anthropic SDK, yaml, zod, swr, vitest
10. 한계·주의: 유튜브 DOM 변경 시 `SELECTORS` 수정, 구글 로그인은 사람이 직접

## docs/demo.md
spec §13 시나리오 6컷을 타임라인 표로. 녹화 전 체크: `rm -rf data/agent.db data/screenshots/*`(프로필 폴더는 유지), 테스트 영상 ID, 유튜브2 로그인 확인, 화면 1280×800, 크롬 창이 대시보드를 가리지 않게 창 배치(대시보드 왼쪽, 크롬 오른쪽).

## 단계
- [x] 1. README 작성 → [x] 2. `docs/demo.md` 작성 → [x] 3. 커밋 `docs: README with setup, intent and demo script`

## 완료 기준
새 클론에서 README만 보고 `pnpm dev`까지 도달 가능. 제작 의도 3문단이 ADR과 모순 없음.

## Comments

구현 (2026-10-21, issue-implementer): README와 `docs/demo.md`를 썼다. 문서 전용 이슈라 테스트 대상 코드는 없고, 모든 주장은 코드·설정·ADR과 대조했다. 검증한 것: 새 클론(임시 디렉터리)에서 `pnpm install --frozen-lockfile`이 통과하고 `pnpm test`가 키·`.env.local` 없이 162 passed(14 files)이며, `next dev`가 떠서 `/`가 200이다. 같은 클론에서 `config.yaml`의 자리표시자 `UC_REPLACE_WITH_TEST_CHANNEL`을 그대로 두면 `/api/config`가 500(채널 ID 형식 검사)이라, README에 "테스트 채널 ID를 꼭 바꿀 것"을 명시했다. `tsx`도 동작했다(`pnpm install`이 esbuild 빌드 스크립트 무시 경고를 내지만 영향 없음). 작업 트리에서 전체 `pnpm test`는 162 passed / 1 skipped(`generate.live.test.ts`, 커밋 대상 아님). README 안의 상대 링크 전부 존재 확인. 구현 확인으로 쓴 근거: 한 글자 타이핑은 `poster.ts`의 `pressSequentially(ch)` + `typing` 범위의 간격, 시청자 페르소나·운명원 후반 1회 전문 형태는 `prompt.ts` 시스템 프롬프트(코드 검증은 `validate.ts`의 `missing_brand`·`banned_phrase`·링크·해시태그·길이뿐이라 README에 "전문 형태·1회는 프롬프트가 지시, 코드는 언급 여부 등을 확인"이라고 그대로 썼다), 규칙 순서·문구는 `rules.ts`, 세 칸 이름·안내 문구·버튼·진행 상태 문구는 `page.tsx`·`PostPanel.tsx`·`StepHeader.tsx`. 화면 캡처 `docs/images/dashboard.png`는 메인 세션이 찍었고(2560×1600, 실데이터) 그대로 같은 커밋에 넣었다. 시연 직전 최신화는 이슈 12 몫이다.

이슈와 다르게 한 것: ① **Blocked by 10 무시**(오케스트레이터 지시, 10은 `claimed` 그대로 두고 건드리지 않음). README는 현재 구현 기준이다. ② **Node 요구**: 이슈·ADR-0004의 "Node ≥ 25"를 그대로 썼다. 실제 코드가 요구하는 하한은 더 낮을 수 있다(`node:sqlite`는 22.13+에서 플래그 없이 쓸 수 있다) 하지만 25.6.1 외에서 돌려 보지 않았고 `engines`·`.nvmrc`도 없어서, "개발·검증 v25.6.1, 고정은 안 함"이라고 적었다. 참고로 설치된 vitest 5.0.5의 `engines`는 `^22.12.0 || ^24.0.0 || >=26.0.0`이라 Node 25를 명시하지 않지만 `pnpm install`은 경고 없이 통과했고 테스트도 돈다. ③ **데이터 초기화 명령**: 이슈의 `rm -rf data/agent.db data/screenshots/*` 대신 `rm -rf data/agent.db data/agent.db-wal data/agent.db-shm data/screenshots`로 썼다. `db.ts`가 `PRAGMA journal_mode = WAL`로 열어서 `-wal`·`-shm`이 남고, macOS 기본 셸(zsh)은 `data/screenshots/*`가 비어 있으면 "no matches found"로 명령 전체를 중단해 DB도 안 지워질 수 있다(`data/screenshots`는 `ensureDataDirs`가 다시 만든다). ④ **프로필 로그인 상태 재확인**: DB를 비우면 `profiles` 표(로그인 상태·@핸들)도 같이 지워지므로 녹화 전 체크에 "`/settings`에서 [상태 확인]" 항목을 추가했다. ⑤ **차단 컷**: 영상당 1개에 걸리는 경우 UI가 버튼을 미리 꺼서 차단 행이 생기지 않고, 허용 밖 링크를 직접 입력할 때만 차단 행이 생긴다. spec §13의 "차단 기록"을 그 둘로 나눠 적었다. ⑥ "오픈소스 출처" 제목은 CONTEXT.md가 `출처`를 근거 장면의 _Avoid_로 두어 "사용한 오픈소스와 외부 서비스"로 바꿨다. 목록은 `package.json` 의존성과 대조했고 이슈의 항목이 모두 실제 의존성이다(shadcn/ui, swr, yaml, zod, vitest, @anthropic-ai/sdk, playwright, next). 이슈 목록에 없던 것으로 Base UI·Tailwind·lucide·tsx·React와 보조 패키지(class-variance-authority, tw-animate-css, cn), 내장 `node:sqlite`, 외부 서비스(YouTube Data API v3, Anthropic API)를 더했다. yt-dlp는 의존성이 아니라 선택 설치 CLI라서 "쓰는 곳"에 선택 설치로 표시했다. ⑦ 대시보드 창 너비가 1024px(CSS) 미만이면 세 칸이 쌓이므로(`lg:grid-cols-3`), 왼쪽 창에 대시보드를 놓는 배치에 맞는 배율 확인을 녹화 전 체크에 넣었다.

열린 질문: (a) 대시보드를 왼쪽·크롬을 오른쪽에 두는 배치에서 세 칸이 한 줄로 보이는지는 직접 확인하지 못했다(이슈 12 리허설에서 맞추고, 필요하면 `docs/demo.md` 5번을 고친다). (b) `AGENTS.md`의 Runtime Requirements TODO(Node 고정, `config.yaml` 자리표시자)는 아직 그대로다. 이슈 11 범위 밖이라 손대지 않았고, 사용자가 `config.yaml`에 실제 테스트 채널 ID를 넣은 변경은 커밋하지 않았다(작업 트리에만 있음). 저장소를 공개 제출하려면 그 ID를 커밋할지 사용자 결정이 필요하다(자리표시자 그대로면 새 클론은 README의 안내대로 ID를 직접 넣어야 한다). (c) 제안: `engines.node`와 `.nvmrc`로 Node를 고정하면 README의 "고정은 안 함" 문장을 지울 수 있다.

리뷰 반영 (2026-10-21, issue-implementer): README 사실 오류 4건만 고쳤다. ① `ANTHROPIC_MODEL`은 설정하지 않을 때만 기본 모델이고, 빈 값(`ANTHROPIC_MODEL=`)이면 `services.ts`의 `??`가 대체하지 않아 빈 모델명이 된다. ② 링크 직접 입력 예시에 `https://`를 붙였다(`parseVideoId`가 스킴 없는 `youtu.be/ID`는 `new URL()` 실패로 거부). ③ 맥락 우선 문단의 재료에서 "조회수"를 뺐다(`buildUserPrompt`는 채널·제목·설명·자막·인기 댓글만 쓴다). ④ 중복 댓글 확인은 입력창이 보일 때 한 번 읽는 best effort임을 밝히고, 시간 초과가 난 영상은 유튜브에서 직접 확인하도록 안내했다.
