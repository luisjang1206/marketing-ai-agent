# 12 시연 리허설 · 제출 체크

Status: ready-for-human
Type: task
Blocked by: 11
Agent: 사람
Model: —

## 목표
시연 영상 2~3분 녹화, 제출물 점검. 사람이 하는 일(녹화·업로드·제출 폼)과 에이전트가 하는 점검을 나눈다.

## 에이전트 점검
- [ ] 비밀값 스캔: `git log -p --all | grep -iE 'sk-ant-|AIza[0-9A-Za-z_-]{30,}'` → 없음. `.env.local` 미추적(`git ls-files | grep env` → `.env.example`만)
- [ ] `pnpm test` 녹색, `pnpm build` 성공(프로덕션 빌드에서도 Playwright 외부화 확인)
- [ ] `config.yaml`의 테스트 채널 ID가 실제 값(자리표시자 `UC_REPLACE_WITH_TEST_CHANNEL` 없음)
- [ ] `data/` 초기화 스크립트 `pnpm reset:data` (`rm -rf data/agent.db data/screenshots data/captions`) 추가·실행
- [ ] 3개 프로필 `checkLogin` 전부 true
- [ ] README 캡처 이미지 최신

## 사람이 하는 일
- [ ] 테스트 영상 유튜브1 채널에 "일부 공개"로 업로드, ID를 `config.yaml`에
- [ ] 프로필 3(유튜브3)의 구글 계정으로 유튜브 채널 만들기 → `pnpm try:login 3 check`가 `@핸들`을 돌려주는지 확인. 지금은 채널이 없어 이 프로필로 게시하면 `element_not_found`로 실패한다(이슈 08 Comments). 프로필 1은 2026-10-20에 `@핸들` 확인됨.
- [ ] `docs/demo.md` 순서대로 녹화(QuickTime 화면 기록, 마이크 켜고 제작 의도 한 줄 구두 설명)
- [ ] 영상 2~3분 확인 → 구글 드라이브 전체 공개 또는 유튜브 링크 공유 → 로그아웃 창에서 재생 확인
- [ ] 과제 제출 폼: Track 2, 시연 링크, Git 주소 `https://github.com/luisjang1206/marketing-ai-agent`

## 완료 기준
PDF "제출 전 체크리스트" 3항목 전부 ✓.
