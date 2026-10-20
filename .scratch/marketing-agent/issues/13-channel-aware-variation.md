# 13 같은 채널 초안 겹침 막기 (채널 인지 짜임)

Status: ready-for-agent
Type: task
Blocked by: 06
Agent: prompt-tuner
Model: opus

## 목표
CONTEXT.md 검증 규칙 "영상마다 다를 것"을 같은 채널 안에서 지킨다. 이슈 06은 짜임(시작·전문 꼴·궁금증·끝)을 제목 해시로만 골라서, 생성기가 같은 채널의 다른 초안을 모른다. 그래서 06 최종 세트 3개 중 2개가 "ㅋㅋㅋ … 대목에서 빵 터졌 … 내 얘기"로 수렴했고, 채널당 5개면 시작 짜임이 겹칠 확률이 약 91%다. 같은 이유로 이슈 10의 [다시 생성]도 같은 영상에 늘 같은 짜임을 준다.

해결: 같은 채널의 최근 초안을 `DraftContext`에 넘기고, 프롬프트가 그것과 겹치지 않게 한다. 재생성이면 같은 영상의 이전 초안도 들어가므로 짜임이 바뀐다.

## 파일
- Modify: `src/lib/draft/prompt.ts`, `src/lib/repo/drafts.ts`
- Test: `tests/generate.test.ts`, `tests/repo.test.ts`
- 실키 확인: `tests/generate.live.test.ts` (커밋 안 함, 이슈 06과 같음)

## 인터페이스
```ts
// prompt.ts — 필드 추가만. 없으면 이슈 06과 똑같이 동작한다.
export type DraftContext = {
  video: { title: string; description: string; channelTitle: string }
  captions: string | null
  topComments: string[]
  recentDrafts?: string[]   // 같은 채널 최근 초안 text, 최신순. 같은 영상의 이전 초안 포함
}

// repo/drafts.ts — drafts JOIN videos ON video_id, videos.channel_id = ?, drafts.id DESC
export function recentChannelDraftTexts(db: DatabaseSync, channelId: string, limit?: number): string[]  // 기본 5
```
`generateDraft`, `buildSystemPrompt`, `buildUserPrompt(ctx, previous?)`, `DraftLLM`, `validateDraft` 시그니처는 그대로다.

## 동작
- `recentDrafts`가 비어 있거나 없으면 `buildUserPrompt` 출력이 지금과 바이트 단위로 같다. 이슈 06 테스트는 손대지 않는다.
- 있으면 유저 프롬프트에 "같은 채널에 이미 쓴 댓글" 블록을 넣는다. 시작·끝·브랜드 문장 꼴·눈에 띄는 표현을 겹치지 말라고 지시한다.
- 짜임 선택에 `recentDrafts`를 반영한다. 방법은 담당이 정한다(예: seed에 넣기, 최근 초안이 쓴 짜임 피하기). 조건은 두 가지다.
  - 같은 입력이면 같은 짜임이다. 순수 함수이고 Date·random이 없다.
  - 같은 영상에 이전 초안이 하나 추가되면 짜임이 달라진다.
- 재시도(`previous`)는 짜임을 바꾸지 않는다.
- 이슈 06 리뷰 잔여 2건을 같이 처리한다.
  - `ANGLES`의 '내 연애운 흐름'처럼 초안에 낱말 그대로 옮겨지는 힌트는 방향만 주는 표현으로 바꾼다. 06 실키에서 "운명원에서 연애운 흐름을 보면"이 서비스 메뉴 설명처럼 읽혔다.
  - 재시도 때 짜임이 그대로인지 단언하는 테스트를 추가한다.
- 코드 검증 규칙(`Violation`)은 늘리지 않는다. 겹침은 프롬프트로 막는다(prompt-tuner 규칙 6).

## 단계
- [ ] 1. `tests/repo.test.ts`: `recentChannelDraftTexts`가 같은 채널만, 최신순으로, limit만큼 돌려주는지 확인한다. 다른 채널 초안은 빠진다.
- [ ] 2. `tests/generate.test.ts`
  - `recentDrafts` 없음과 `[]`의 출력이 같다.
  - 있으면 블록이 들어가고 각 초안 text가 보인다.
  - 같은 영상 초안을 하나 넣으면 짜임 줄이 바뀐다.
  - `previous`가 있어도 짜임 줄이 같다.
- [ ] 3. FAIL 확인 → 구현 → PASS. `pnpm exec tsc --noEmit`, `pnpm lint`, 전체 `pnpm test`.
- [ ] 4. 실키: 외롭여 영상 5개를 차례로 생성하고, 앞서 나온 초안 text를 다음 영상의 `recentDrafts`로 넘긴다. 이어서 영상 1개를 [다시 생성]처럼 한 번 더 생성한다(이전 초안 포함). 프롬프트 라운드는 최대 5회. 라운드마다 샘플 1개와 바꾼 이유를 `## Comments`에 남긴다.
- [ ] 5. 커밋 `feat: feed recent channel drafts into prompt to keep drafts distinct`

## 완료 기준
- 테스트 녹색.
- 실키 6개가 모두 `validateDraft`를 통과한다. 운명원은 정확히 1회이고 근거 장면이 채워져 있다.
- 공백을 뺀 초안끼리 공통 부분 문자열이 8자 이상인 쌍이 0개다("운명원연애사주가"처럼 브랜드 문장이 겹쳐도 센다).
- 시작 짜임이 서로 다르다.
- 재생성 초안의 시작·끝이 원래 초안과 다르다.
