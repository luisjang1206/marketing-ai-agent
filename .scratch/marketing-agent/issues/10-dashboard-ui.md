# 10 대시보드 UI (세 칸 + 기록) · 설정 페이지

Status: claimed
Type: task
Blocked by: 09
Agent: issue-implementer
Model: sonnet

## 목표
spec §11. 처음 보는 사람이 설명 없이 ①→②→③을 쓸 수 있다. 프로필 선택(자동/수동), 차단 사전 비활성, 4단계 스테퍼, 캡처, 기록 표, 오늘 N/10.

## 파일
- Create: `src/components/StepHeader.tsx`, `VideoList.tsx`, `DraftPanel.tsx`, `PostPanel.tsx`, `PostLog.tsx`, `ProfileCard.tsx`, `src/lib/client/api.ts`(fetch 래퍼 + swr 키)
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`(한국어 lang, 제목), Create: `src/app/settings/page.tsx`

## 컴포넌트 계약
```ts
StepHeader({ n: 1|2|3, title: string, hint: string })
VideoList({ videos: VideoView[]; selectedId: string|null; postedIds: string[]; loading: boolean;
  onFetch(): void; onSelect(id: string): void; onAddLink(url: string): Promise<{ ok: boolean; message?: string }> })
  // 채널 칩(전체/채널명/테스트), 카드: 썸네일·제목·채널·날짜(상대시간)·배지(자막/초안/게시됨/테스트)
DraftPanel({ video: VideoView|null; draft: DraftRow|null; captionSource: CaptionSource|null; loading: boolean; onRegenerate(): void })
  // 고민 한 줄 / 근거 장면 / 초안(글자수 N/120) / 검증 배지(VIOLATION_LABELS) / [다시 생성]
PostPanel({ profiles: ProfileView[]; selectedProfile: string|'auto'; onProfileChange(v): void; verdict: RuleVerdict|null;
  draftValid: boolean; job: JobRow|null; busy: boolean; onPost(): void })
  // Select(자동(돌아가며)/유튜브1~3 + 로그인 배지), [댓글 달기] disabled = !draftValid || !verdict?.allowed || busy, Tooltip=사유
  // Stepper: 프로필 여는 중 → 입력 중 → 게시 완료 → 댓글 보기 (job.state로 활성), 실패면 빨간 Alert(FAILURE_LABELS) + 캡처
  // 완료면 캡처 <img src="/api/screenshots/<file>"> + "영상에서 보기" 링크
PostLog({ rows: PostLogRow[] })   // 시각·영상·프로필·댓글(말줄임)·결과 배지(성공/실패/차단)·사유·캡처 링크
ProfileCard({ profile: ProfileView; onOpenLogin(): void; onCheck(): Promise<void> })
```
캡처 서빙: `GET /api/screenshots/[file]`가 `data/screenshots/<file>`을 `image/png`로 반환(경로 탈출 방지: `path.basename`만 허용). 이 라우트는 이 이슈에서 추가.

## page.tsx 상태 흐름
- swr: `/api/config`(1회), `/api/videos`(수동 revalidate), `/api/log`(2초), `/api/profiles`(5초), `/api/posts/<jobId>`(job 진행 중일 때 500ms, 끝나면 중단 + log revalidate)
- `selectedId` 바뀌면 `POST /api/videos/<id>/draft` 호출(캐시 있으면 즉시) → `draft`, `captionSource`
- verdict(클라이언트): `checkPostAllowed({ videoChannelId: video.channel_id, allowedChannelIds: config.allowedChannelIds, alreadyPosted: postedIds.includes(id), successCountToday: todayCount, dailyMax })`
- 헤더: 제목 "유튜브 댓글 에이전트", 배지 "오늘 게시 {todayCount}/{dailyMax}", 링크 "프로필 설정"

## 단계
- [x] 1. `layout.tsx`: `<html lang="ko">`, 제목 설정, 전역 폰트는 시스템 기본(Pretendard 로딩 금지 — 오프라인 시연 안정성).
- [x] 2. 컴포넌트 6개 + `/api/screenshots/[file]` 라우트. shadcn: Card, Button, Badge, Select, Table, Tooltip, Alert, Input, Skeleton.
- [x] 3. `page.tsx` 조립. 데스크톱 3열 그리드(`grid-cols-3`, 1280px 기준), 하단 기록.
- [x] 4. `/settings`: 프로필 카드 3개 + 안내문("로그인 창 열기 → 구글 로그인 → 창 닫기 → 상태 확인").
- [ ] 5. 브라우저 수동 검증 체크리스트:
  - [x] 불러오기 → 30개 카드, 테스트 채널 배지
  - [x] 카드 클릭 → 스켈레톤 → 초안·근거·고민 한 줄·글자수·검증 배지
  - [x] 다시 생성 → 문장 바뀜
  - [ ] 프로필 자동 → 댓글 달기 → 스테퍼 4단계 → 캡처 표시 → 기록 표 갱신, 배지 1/10
  - [ ] 같은 영상 → 버튼 비활성 + 툴팁 "이미 댓글을 달았습니다"
  - [x] 허용 밖 링크 추가 → 오류 메시지 + 기록에 차단 행
  - [ ] 로그인 안 된 프로필 수동 선택 → 실패 Alert + 캡처
- [x] 6. 커밋 `feat: dashboard UI with three-step flow and post log`

## 완료 기준
체크리스트 전부 통과. 1280×800 창에서 가로 스크롤 없음.

## Comments

구현 (2026-10-21, issue-implementer): 단계 1-4·6을 했고 단계 5(브라우저 수동 검증 체크리스트)는 오케스트레이터 지시로 건너뛰었다. 실제 크롬 프로필로 게시하는 항목이 있어 사용자 승인이 필요하므로, 5의 체크박스는 전부 비워 두고 Status도 `claimed`로 둔다. 메인 세션의 브라우저 검증을 기다린다. 컴포넌트·페이지에는 테스트를 만들지 않았다(스펙 §12, `src/app/AGENTS.md`). 검증한 것: 전체 `pnpm test` 162 passed / 1 skipped(`generate.live.test.ts`), `tsc --noEmit`·`pnpm lint`·`pnpm build` 통과. 스크린샷 라우트는 임시 `data/screenshots`를 둔 디렉터리에서 핸들러를 직접 호출해 확인했다: 있는 파일 200 `image/png` `no-store`, 없는 파일·`../secret.txt`·`..%2Fsecret.txt`·`..`·`.png` 아닌 이름·절대 경로는 404, `../data/screenshots/job1.png`는 basename만 남아 같은 디렉터리의 파일을 돌려준다. `pnpm dev`(읽기 전용 GET만)로 `/`·`/settings` 200, `<html lang="ko">`·제목, `/api/config|log|profiles|videos` JSON을 확인했고 POST는 한 번도 호출하지 않았다(그 과정에서 앱이 `data/agent.db`를 읽었다). 화면은 Playwright의 임시 비영속 Chrome(헤드리스, 사용자 프로필 아님)으로 1280×800에서 봤다. `page.route`로 `/api/**`를 전부 mock해서 아무것도 게시·생성되지 않게 했고, 카드 30개와 채널 칩 필터, 초안 스켈레톤→초안·근거·고민 한 줄·글자수·검증 배지(위반 3개 포함), 프로필 Select(로그인 배지), 이미 게시한 영상의 비활성 버튼과 툴팁 "이 영상에는 이미 댓글을 달았습니다", 스테퍼가 프로필 여는 중→입력 중→게시 완료→댓글 보기로 0.5초 폴링으로 넘어가는 것, 성공(캡처+"영상에서 보기")·실패(Alert+캡처) 화면, 허용 밖 링크 409 메시지, 새로고침 시 `activeJobId`로 진행 상태가 복원되는 것, 빈 상태, `/settings`를 확인했고 모두 `scrollWidth == clientWidth`(가로 스크롤 없음)였다. 실데이터(읽기 전용, 비 GET 차단)로도 `/`에서 카드 29개가 썸네일과 함께 뜨고 가로 스크롤이 없는 것을 봤다. 이 확인은 단계 5를 대신하지 않는다(실제 게시·실제 로그인 프로필은 안 거쳤다). 확인 스크립트는 scratchpad에만 있고 커밋하지 않았다. 이슈와 다르게 한 것: ① 이슈 파일 목록 밖인 `src/app/globals.css`의 `--font-sans`·`--font-mono` 두 줄을 시스템 폰트 스택으로 바꿨다(단계 1에서 `layout.tsx`의 Geist 변수를 없애면 이 두 줄이 정의 없는 변수를 가리켜 폰트가 깨진다). ② 컴포넌트 계약에 선택 속성 둘을 더했다: `DraftPanel.maxChars?`(글자수 "N/120"의 120을 `comment.max_chars`에서 받음, 기본 120), `PostLog.profileLabels?`(기록에는 `p1`처럼 id만 있어 "유튜브1"로 바꿔 보이려고). 둘 다 생략해도 동작하므로 계약을 깨지 않는다. ③ 계약에 오류 prop이 없는 칸은 `page.tsx`가 칸 위에 빨간 Alert로 오류를 보여준다(영상 불러오기 실패, 초안 생성·다시 생성 실패, 게시 시작 409(busy·no_profile 등)). ④ `FAILURE_LABELS`는 playwright를 가져오는 `poster.ts`에 있어 옮기지 않았다. 게시 실패 Alert는 러너가 쓴 `job.message`("로그인 안 됨: …")를 그대로 보여주고, 게시 기록의 사유 열은 `PostLog.tsx`의 `REASON_LABELS`(`Record<RuleReason | FailureReason, string>`)를 쓴다. 타입만 `import type`으로 가져와 키가 빠지면 컴파일에서 잡히지만 문구는 `FAILURE_LABELS`의 복사본이다. ⑤ 댓글 달기 버튼을 못 누르는 이유를 툴팁(비활성 버튼은 포인터 이벤트가 없어 버튼을 감싼 `span`에 건다)과 함께 버튼 아래 한 줄로도 보여준다(터치·키보드에서도 보이게). ⑥ swr는 새로고침 요청도 `dedupingInterval`(기본 2초) 안에서는 합쳐, 처음엔 500ms 폴링이 실제로는 2초마다 돌았다. 작업 폴링은 `dedupingInterval: 250`, 기록 폴링은 `1000`으로 맞췄다. ⑦ 스크린샷 라우트는 `.png`로 끝나는 이름만 받는다(캡처는 `<jobId>.png`뿐이다). ⑧ `src/lib/client/api.ts`에는 fetch 래퍼(`ApiRequestError`는 서버의 한국어 `message`를 그대로 담는다)·swr 키 외에 엔드포인트 호출 함수와 `screenshotUrl`·`watchUrl`을 뒀다. 컴포넌트는 repo 모듈을 가져오지 않고 같은 타입을 `api-types` 응답에서 꺼내 쓴다. ⑨ 초안 swr는 `shouldRetryOnError: false`다(유료 호출이라 실패해도 저절로 다시 부르지 않는다). 썸네일과 캡처는 `next.config.ts`에 `i.ytimg.com`이 없어 `next/image` 대신 `<img>`를 쓰고 `@next/next/no-img-element`를 줄 단위로 껐다(설정은 넓히지 않았다). 열린 질문·제안(이슈에 없어 손대지 않음): (a) `src/app/AGENTS.md`의 Current state가 아직 "page.tsx와 layout.tsx는 scaffold"라고 되어 있어 이 이슈 반영 뒤에 맞춰야 한다(이슈 파일 목록 밖이라 손대지 않았다). (b) 게시 중에도 [다시 생성]을 누를 수 있다. 진행 중인 작업은 시작 때의 초안으로 입력하므로 게시에는 영향이 없지만, 화면의 초안이 입력 중인 문안과 달라질 수 있다. 막으려면 `DraftPanel`에 비활성 신호가 필요하다. (c) 지금 `/api/profiles` 기준으로 세 프로필 모두 로그인 안 됨이라, 단계 5의 "프로필 자동 → 댓글 달기"에 앞서 `/settings`에서 로그인·상태 확인을 해야 한다. (d) `FAILURE_LABELS`를 playwright 없는 순수 모듈로 옮기면 ④의 문구 복사본을 없앨 수 있다.

리뷰 반영 (2026-10-21, issue-implementer): 리뷰 발견 중 지시받은 8건만 고쳤다. ① 새로고침했거나 다른 탭에서 시작한 게시를 `log.activeJobId`로 이어받을 때(새로 보인 id마다 한 번 `setJobId`), 영상을 고르지 않았다면 `job.video_id`를 골라 둔다. 그래서 작업이 끝나 `activeJobId`가 비어도 캡처·"영상에서 보기"·실패 Alert가 남고 ② 칸도 비지 않는다. 같은 탭에서 시작한 흐름은 `post()`가 `jobId`를 정하므로 그대로다. 목 API로 새로고침 중간(입력 중→게시 완료→댓글 보기, 기록 폴링이 `activeJobId`를 비운 뒤 5초)에도 결과·캡처·카드 선택이 남는 것과, 같은 탭 흐름(스테퍼 진행·성공·실패)이 그대로인 것을 헤드리스 Chrome으로 다시 봤다. ② `DraftPanel`의 `maxChars` 기본값 120을 없앴다. 글자수는 `/api/config`의 `comment.max`가 있을 때만 "N/최대"로, 아직 못 읽었으면 "글자수 N"만 보인다(UI에 글자수 한도 리터럴이 없다). ③ `PostLog`는 `FailureReason`을 `@/lib/browser/poster` 대신 `@/lib/api-types`에서 가져온다(`api-types.ts`가 타입만 다시 내보낸다). `FAILURE_LABELS`는 옮기지 않았다. ④ `client/api.ts`는 `../api-types`를 상대 경로로 가져온다. ⑤ CONTEXT.md가 피하는 단어를 정리했다: 주석의 예외→오류, 출처→"같은 서버가 내주는", aria-label "채널 필터"→"채널별 보기". ⑥ 자막 유무를 `Badge`로 보인다: "자막 있음" / "자막 없음 → 제목·설명·댓글로 작성"(스펙 §7.1 문구 그대로, 아직 모르면 배지 없음). ⑦ `LoginBadge`는 `ProfileCard.tsx`에서 내보내 `PostPanel`이 쓴다(새 파일 없음). ⑧ `src/app/AGENTS.md`의 Current state와 `src/lib/AGENTS.md`의 `client/api.ts` 줄(planned)을 현재 상태로 고쳤다(오케스트레이터가 범위 밖 수정을 승인). `src/lib/AGENTS.md`의 다른 `(planned)` 줄(04-08)도 낡았지만 지시 범위 밖이라 두었다.

메인 세션 브라우저 검증 결과 (2026-10-21, 실데이터, 1280×800, 오케스트레이터 전달): 체크리스트 1 통과 — 카드는 30개가 아니라 29개다(공식 채널 5개×5 + 더 오래된 외롭여 1 + 테스트 채널 영상 3개뿐이라). 테스트 배지 표시됨. 2 통과 — 스켈레톤 → 고민 한 줄·근거 장면·초안 99/120·검증 통과, 카드에 초안 배지가 붙음. 3 통과 — 문장이 바뀜(101/120). 6 통과 — 입력창 아래에 빨간 "허용 채널의 영상이 아닙니다"와 게시 기록 맨 위에 차단 행("Me at the zoo")이 생김. 단계 4(`/settings`) 통과 — 카드 3개와 안내문이 보이고, [상태 확인]으로 세 프로필이 모두 로그인됨(@핸들)이 됨. 가로 스크롤 없음(scrollWidth 1280 = clientWidth 1280). 4(프로필 자동 → 댓글 달기)와 5(같은 영상 → 비활성+툴팁)는 새 테스트 영상에 실제로 한 번 게시해야 해서 아직 안 했다. 7(로그인 안 된 프로필 수동 선택)은 세 프로필이 모두 로그인돼 있어 수동으로 고르면 실제로 게시되므로 실행하지 않았고, 사용자가 건너뛰기로 했다(2026-10-21). 실패 Alert와 캡처는 목 API로만 확인했다. 그래서 체크박스 1·2·3·6과 단계 4만 체크하고 나머지는 비워 두며 Status는 `claimed`로 둔다.
