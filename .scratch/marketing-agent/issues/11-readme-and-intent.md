# 11 README · 제작 의도 · 시연 시나리오

Status: ready-for-agent
Type: task
Blocked by: 10

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
- [ ] 1. README 작성 → [ ] 2. `docs/demo.md` 작성 → [ ] 3. 커밋 `docs: README with setup, intent and demo script`

## 완료 기준
새 클론에서 README만 보고 `pnpm dev`까지 도달 가능. 제작 의도 3문단이 ADR과 모순 없음.
