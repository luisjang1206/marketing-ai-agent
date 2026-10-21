# 12 시연 리허설 · 제출 체크

Status: ready-for-human
Type: task
Blocked by: 11
Agent: 사람
Model: —

## 목표
시연 영상 2~3분 녹화, 제출물 점검. 사람이 하는 일(녹화·업로드·제출 폼)과 에이전트가 하는 점검을 나눈다.

## 에이전트 점검
- [x] 비밀값 스캔: `git log -p --all | grep -iE 'sk-ant-|AIza[0-9A-Za-z_-]{30,}'` → 없음. `.env.local` 미추적(`git ls-files | grep env` → `.env.example`만)
- [x] `pnpm test` 녹색, `pnpm build` 성공(프로덕션 빌드에서도 Playwright 외부화 확인)
- [x] `config.yaml`의 테스트 채널 ID가 실제 값(자리표시자 `UC_REPLACE_WITH_TEST_CHANNEL` 없음)
- [x] (2026-10-21 사용자 실행 — Comments 참조) `data/` 초기화 스크립트 `pnpm reset:data` (`rm -rf data/agent.db data/screenshots data/captions`) 추가·실행
- [x] 3개 프로필 `checkLogin` 전부 true
- [x] README 캡처 이미지 최신

## 사람이 하는 일
- [ ] 테스트 영상 유튜브1 채널에 "일부 공개"로 업로드, ID를 `config.yaml`에
- [x] (2026-10-21 `@핸들` 확인, 아래 "지금은 채널이 없어" 문장은 그 전 상태. 게시도 같은 날 검증 — 이슈 08 Comments "사이드 패널 댓글 화면 대응" 참조) 프로필 3(유튜브3)의 구글 계정으로 유튜브 채널 만들기 → `pnpm try:login 3 check`가 `@핸들`을 돌려주는지 확인. 지금은 채널이 없어 이 프로필로 게시하면 `element_not_found`로 실패한다(이슈 08 Comments). 프로필 1은 2026-10-20에 `@핸들` 확인됨.
- [ ] `docs/demo.md` 순서대로 녹화(QuickTime 화면 기록, 마이크 켜고 제작 의도 한 줄 구두 설명)
- [ ] 영상 2~3분 확인 → 구글 드라이브 전체 공개 또는 유튜브 링크 공유 → 로그아웃 창에서 재생 확인
- [ ] 과제 제출 폼: Track 2, 시연 링크, Git 주소 `https://github.com/luisjang1206/marketing-ai-agent`

## 완료 기준
PDF "제출 전 체크리스트" 3항목 전부 ✓.

## Comments

에이전트 점검 (2026-10-21, 메인 세션 `/implement`): ① **비밀값**: `git log -p --all`에서 정규식에 걸린 줄은 이 이슈 체크리스트에 적힌 정규식 문자열 자체뿐이고(이 커밋 뒤에는 `AGENTS.md`에 옮겨 적은 같은 정규식도 걸린다), 키 모양 토큰(Anthropic 키 접두사 뒤 8자 이상, Google 키 접두사 뒤 30자 이상)은 0개다. 작업 트리(추적 안 된 파일 포함, `node_modules`·`.next`·`data`·`.env.local` 제외)도 같은 결과. `git ls-files`의 env 파일은 `.env.example`뿐. ② **테스트·빌드**: `pnpm test` 162 passed / 1 skipped(`generate.live.test.ts`, 키 없음·커밋 안 함), `tsc --noEmit`·`pnpm lint` 클린. `.next`를 지우고 `pnpm build` exit 0. Playwright 외부화: Playwright를 쓰는 서버 청크는 6.7KB이고 `e.y("playwright-<hash>")`로 불러오며, 그 이름은 `.next/node_modules/playwright-<hash>` → `node_modules/.pnpm/playwright@1.64.1/...` 심볼릭 링크다(번들에 들어가지 않음). `.next/static`(클라이언트)에는 `playwright` 문자열이 없다. 빌드 경고 3건은 Turbopack 파일 추적(NFT) 경고로, `paths.ts`·`config.ts`·`anthropic.ts`의 `process.cwd()` 기반 동적 경로 때문에 `data/profiles/` 1만여 파일과 프로젝트 전체가 추적 목록에 잡힌다는 내용이다. 로컬 `next start`에는 영향이 없고 이 이슈 범위 밖이라 고치지 않았다. ③ **테스트 채널 ID**: 사용자가 작업 트리에 넣어 둔 실제 ID(`UCY2MS2oUHbOsBLpvYqdFiDg`)를 이 커밋에 넣었다. 이슈 11 열린 질문 (b)의 결정이 필요한 부분으로, 이 체크 항목과 "새 클론에서 README만 보고 실행"을 둘 다 만족하려면 커밋하는 쪽이 맞다고 봤다. 채널 ID는 공개 정보다. push 전에 빼고 싶으면 이 커밋에서 `config.yaml`만 되돌리면 된다. README 설정 절("자리표시자가 들어 있습니다")과 `AGENTS.md` Runtime Requirements의 TODO를 그에 맞게 고쳤다. ④ **`pnpm reset:data`**: 이슈의 목록에 `agent.db-wal`·`agent.db-shm`을 더했다(이슈 11 Comments ③과 같은 이유: `db.ts`가 WAL로 연다). `data/profiles/`는 지우지 않는다. 임시 폴더에 같은 구조의 가짜 `data/`를 만들어 돌려 DB 3파일·`screenshots`·`captions`만 지워지고 `profiles`는 남는 것, 이미 빈 상태에서 다시 돌려도 exit 0인 것을 확인했다. 두 폴더는 `getDb()`의 `ensureDataDirs()`가 다시 만든다. `docs/demo.md` 녹화 전 체크 1번을 이 명령으로 바꾸고 `CLAUDE.md`·`AGENTS.md` 명령 목록에 넣었다. **실제 `data/`에서의 실행은 하지 않았다**: Claude Code auto mode가 되돌릴 수 없는 로컬 삭제로 막았고 우회하지 않았다. 실행 전 DB 상태: 게시 기록은 차단 2건(허용 밖 링크)뿐이고 성공 게시는 없어서, 앱을 통해 단 리허설 댓글은 없다(이슈 08의 `try:post`로 단 댓글은 DB에 남지 않으므로 유튜브에서 직접 확인). ⑤ **프로필**: `pnpm try:login 1|2|3 check` → 셋 다 `loggedIn: true`, 셋 다 `@핸들`을 돌려줬다(공개 저장소라 실제 핸들은 적지 않는다). 프로필 3은 이슈 08 때 핸들이 비어 있었는데 이제 핸들이 나와서 채널이 생긴 것으로 보고 사람 할 일 항목도 체크했다. 다만 프로필 3으로 실제 게시는 해 보지 않았다. ⑥ **README 캡처**: `docs/images/dashboard.png`는 마지막 UI 커밋(7b22cc6, 00:55) 뒤인 2d35420(01:15)에 들어갔고 현재 화면과 세 칸·배지·문구가 같다. 다시 찍지 않았다.

남은 일(사람): 개발 서버를 끈 상태에서 `pnpm reset:data` 실행(녹화 직전마다), 녹화, 공유 링크 확인, 제출 폼. Status는 사람 할 일이 남아 `ready-for-human` 그대로 둔다.

리뷰 반영 (2026-10-21, `/code-review` Standards·Spec): ① README 설정 절의 "게시는 테스트 채널 영상에만 되므로"는 틀린 말이라 고쳤다. `checkPostAllowed`의 허용 범위는 허용 채널 6개 전부이고, 테스트 채널에만 게시하는 것은 규칙(Immutable Constraint 1)이지 코드가 아니다(`try:post`만 코드로 막는다). ② 프로필 실제 핸들을 지우고 `@핸들`로 적었다. ③ `AGENTS.md`의 제출 전 비밀값 스캔 명령을 이 이슈에서 실제로 돌린 정규식으로 맞췄다. 열린 질문: `AGENTS.md` Immutable Constraint 4의 "Start demo recordings from an empty `data/`"는 실제로는 `data/profiles/`를 남기는 것이다(이슈 11 `docs/demo.md`부터 그랬고 `reset:data`가 그것을 굳힌다). 사용자 소유 규칙이라 문구는 바꾸지 않았다.

전체 실행·리셋 (2026-10-21 12:1x, 메인 세션): 내장 브라우저에서 `docs/demo.md` 순서대로 한 번 돌렸다. 불러오기(30개, 테스트 4) → 테스트 영상 `327388 medium` 초안·[다시 생성] → 사용자 승인 후 유튜브2로 실제 게시(성공, 하이라이트 캡처, "오늘 게시 1/10") → 같은 영상 버튼 꺼짐 → 허용 밖 링크 차단 행. 서버 에러 없음(콘솔 409는 차단된 직접 입력 응답). 발견: 테스트 영상 제목이 숫자뿐이고 자막·설명이 없어 초안이 제목을 농담 소재로 쓴다. 녹화 전 영상 제목·설명을 연애 고민 내용으로 바꾸기를 권했다. 그 뒤 사용자가 `pnpm reset:data`를 실행했고(개발 서버가 켜진 상태여서 바로 껐다), `data/`에는 `profiles/1~3`만 남았다. 게시한 댓글은 유튜브에 남아 있으므로 녹화 전에 지우거나 다른 테스트 영상을 쓴다.
