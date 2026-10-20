# 10 대시보드 UI (세 칸 + 기록) · 설정 페이지

Status: ready-for-agent
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
- [ ] 1. `layout.tsx`: `<html lang="ko">`, 제목 설정, 전역 폰트는 시스템 기본(Pretendard 로딩 금지 — 오프라인 시연 안정성).
- [ ] 2. 컴포넌트 6개 + `/api/screenshots/[file]` 라우트. shadcn: Card, Button, Badge, Select, Table, Tooltip, Alert, Input, Skeleton.
- [ ] 3. `page.tsx` 조립. 데스크톱 3열 그리드(`grid-cols-3`, 1280px 기준), 하단 기록.
- [ ] 4. `/settings`: 프로필 카드 3개 + 안내문("로그인 창 열기 → 구글 로그인 → 창 닫기 → 상태 확인").
- [ ] 5. 브라우저 수동 검증 체크리스트:
  - [ ] 불러오기 → 30개 카드, 테스트 채널 배지
  - [ ] 카드 클릭 → 스켈레톤 → 초안·근거·고민 한 줄·글자수·검증 배지
  - [ ] 다시 생성 → 문장 바뀜
  - [ ] 프로필 자동 → 댓글 달기 → 스테퍼 4단계 → 캡처 표시 → 기록 표 갱신, 배지 1/10
  - [ ] 같은 영상 → 버튼 비활성 + 툴팁 "이미 댓글을 달았습니다"
  - [ ] 허용 밖 링크 추가 → 오류 메시지 + 기록에 차단 행
  - [ ] 로그인 안 된 프로필 수동 선택 → 실패 Alert + 캡처
- [ ] 6. 커밋 `feat: dashboard UI with three-step flow and post log`

## 완료 기준
체크리스트 전부 통과. 1280×800 창에서 가로 스크롤 없음.
