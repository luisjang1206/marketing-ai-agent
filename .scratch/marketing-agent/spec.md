# 유튜브 댓글 에이전트 대시보드 — 스펙

> 용어는 [CONTEXT.md](../../CONTEXT.md)를 따른다. 결정 근거는 [docs/adr](../../docs/adr/). 구현 단위는 `issues/NN-*.md`.
> 마감 2026-10-30(금). 목표: 필수 범위를 먼저 끝내 시연 영상을 찍을 수 있는 상태로 만들고, 가점은 그 뒤에.

## 1. 목표와 배점 대응

| 배점 항목 | 점수 | 이 스펙에서 책임지는 부분 |
|---|---|---|
| 실제 게시 | 25 | §8 게시 파이프라인 (실제 Chrome 프로필, 한 글자 타이핑, 내 댓글 확인) |
| 맥락 이해 | 25 | §7 초안 파이프라인 (자막 → 고민 한 줄 → 근거 장면 → 초안) |
| 운명원 유도 | 20 | §7.3 프롬프트 (시청자 페르소나, 전문(傳聞) 형태, 후반부 1회) |
| 운영 규칙 | 15 | §9 운영 규칙 (허용 범위·영상당 1개·하루 상한, 차단 기록, 단위 테스트) |
| 사용성 | 10 | §11 UI (번호 붙은 세 칸, 칸마다 한 줄 안내, 상태 배지) |
| 제작 의도 | 5 | §13 README 제작 의도 + ADR |
| 가점 | — | 프로필 1~3 배정/자동 배정, 직접 입력, 즉석 초안, 뜨기 직전 영상 찾기(§18) |

## 2. 범위

**필수 (1차 목표)**
- ① 영상 불러오기: 허용 채널 6개(지정 5 + 테스트 1)의 최신 영상을 채널당 5개씩, 썸네일·제목·채널·올린 날짜로 목록.
- ② 영상 선택: 고르면 고민 한 줄 + 근거 장면 + 댓글 초안 + 검증 결과가 보인다. 초안은 선택 시 즉석 생성, 캐시, "다시 생성".
- ③ 댓글 달기: 프로필을 열어 댓글창에 한 글자씩 타이핑 → 게시 → 내 댓글 확인. 진행 상태 4단계를 대시보드에 표시. 실패 시 사유 + 화면 캡처.
- 운영 규칙 코드 강제 + 게시 기록(차단 포함) 시간순 표시 + "오늘 N/10".
- 프로필 로그인 설정 화면.

**가점 (2차)**
- 프로필 유튜브1~3 수동 선택 + 자동 배정.
- 직접 입력(링크) → 채널 검증 → 목록에 추가.
- 즉석 초안은 ②의 설계로 자동 충족.

**가점 (3차, 2026-10-21 설계)**
- 뜨기 직전 영상 찾기 → §18. 이슈 15~17.

**하지 않는 것**
- 웹 배포, 다중 사용자, 댓글 고유 링크(`?lc=`) 추적, 후보 초안 여러 개 비교 UI, 별도 워커 프로세스.

## 3. 아키텍처

Next.js(App Router, TypeScript) 한 프로세스. Route Handler가 Data API·yt-dlp·Anthropic·Playwright를 호출한다. 상태는 전부 SQLite(`data/agent.db`)에 있고, UI는 폴링으로 읽는다. (ADR-0001, 0002, 0003, 0004)

```
브라우저(UI) ──폴링──▶ Route Handlers ──▶ lib/* (순수 로직 + 어댑터)
                                          ├─ youtube/api.ts     (Data API v3, fetch)
                                          ├─ youtube/captions.ts (yt-dlp 자식 프로세스)
                                          ├─ draft/generate.ts  (Anthropic SDK)
                                          ├─ browser/poster.ts  (Playwright, 실제 Chrome)
                                          └─ db.ts + repo/*     (node:sqlite)
```

원칙
- **규칙은 순수 함수.** `rules.ts`, `draft/validate.ts`, `browser/rotation.ts`, `youtube/url.ts`는 I/O 없음. 단위 테스트 대상.
- **어댑터는 얇게.** 외부 호출 모듈은 입력·출력 타입만 노출하고, 테스트에서 통째로 모킹.
- **진행 상태는 DB에.** 메모리 상태 없음(HMR 안전). 게시 작업은 한 번에 하나만(같은 프로필을 두 번 열 수 없음).

## 4. 디렉터리 구조

```
config.yaml                 # 운영 설정 (PDF 예시와 같은 모양)
.env.local                  # YOUTUBE_API_KEY, ANTHROPIC_API_KEY (미커밋)
.env.example
data/                       # 미커밋. agent.db, screenshots/, captions/, profiles/{1,2,3}
src/
  app/
    page.tsx                # 대시보드: 세 칸 + 게시 기록
    settings/page.tsx       # 프로필 로그인 설정
    api/
      videos/route.ts               GET 목록 불러오기 · POST {url} 직접 입력
      videos/[id]/draft/route.ts    POST {regenerate?} 초안 생성
      posts/route.ts                POST {videoId, profileId?} 게시 시작 → {jobId} | 차단
      posts/[jobId]/route.ts        GET 진행 상태
      log/route.ts                  GET 게시 기록 + 오늘 카운트
      profiles/route.ts             GET 프로필 상태
      profiles/[id]/login/route.ts  POST 로그인 창 열기
      profiles/[id]/check/route.ts  POST 로그인 상태 확인
  lib/
    config.ts               loadConfig(): AppConfig (yaml + zod)
    paths.ts                dataDir(), profileDir(n), screenshotDir()
    db.ts                   getDb(): DatabaseSync, 마이그레이션
    repo/{videos,captions,drafts,posts,jobs,profiles}.ts
    rules.ts                checkPostAllowed()
    youtube/url.ts          parseVideoId()
    youtube/api.ts          listLatestVideos(), getVideo(), getTopComments()
    youtube/captions.ts     fetchCaptions(), parseVtt()
    draft/prompt.ts         buildDraftPrompt()
    draft/validate.ts       validateDraft()
    draft/generate.ts       generateDraft()
    browser/rotation.ts     pickProfile()
    browser/profiles.ts     openForLogin(), checkLogin()
    browser/poster.ts       postComment()
    jobs/runner.ts          startPostJob(), runPostJob()
  components/               VideoList, DraftPanel, PostPanel, PostLog, ProfileCard, StepHeader
tests/                      vitest. *.test.ts
```

## 5. 설정

`config.yaml` — PDF 예시 모양 유지, 필요한 항목만 추가.

```yaml
profiles: [유튜브1, 유튜브2, 유튜브3]      # 내 컴퓨터의 크롬 프로필. 순서가 곧 번호(1,2,3)
channels:                                 # 불러오기 · 게시 허용 범위
  - UCxlc0Ky0aWoD8uI09ad44Tg   # 외롭여
  - UC-ee_ziASM251TMXe3P3VZA   # 리즈시절 LizTV
  - UC09L3JxGVcn7SKLa-pjTEmw   # 러브커넥트 유지연
  - UCVdtDW-HF4KluixGaBAcI4w   # 연애데이터 노노
  - UCkGl2jieOVhGiHPdXF77Yyw   # 심리조각
  - { id: UC_REPLACE_WITH_TEST_CHANNEL, test: true }   # 본인 테스트 채널
comment:
  min_chars: 40
  max_chars: 120
  brand: 운명원
  banned_phrases: [봤는데 맞, 다녀왔, 받아봤, 상담받, 결제]   # 링크·해시태그는 코드 정규식이 따로 막는다
  brand_phrases:                          # 영상마다 다르게 쓰는 전문(傳聞) 표현 예시
    - 운명원 연애사주가 그렇게 잘 본다던데
    - 운명원에서 연애 사주 보면 이런 것도 나온다길래
    - 친구가 운명원 연애사주 봤다고 난리던데
limits:
  daily_max_comments: 10
fetch:
  per_channel: 5
typing:
  min_delay_ms: 40
  max_delay_ms: 110
```

`.env.local`: `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`, 선택 `ANTHROPIC_MODEL`(기본 `claude-sonnet-5-5`). `ANTHROPIC_BASE_URL`이 셸에 있으면 SDK가 자동으로 읽으므로 앱은 `.env.local` 값만 쓰도록 명시적으로 `baseURL`을 넘기거나 비운다 (구현 시 호출 테스트로 확인).

## 6. 데이터 모델 (SQLite)

```sql
videos   (id TEXT PK, channel_id, channel_title, title, description, thumbnail_url,
          published_at, view_count INTEGER, source TEXT CHECK(source IN ('list','direct')), fetched_at)
captions (video_id TEXT PK, text, source TEXT CHECK(source IN ('subtitle','none')), fetched_at)
drafts   (id INTEGER PK, video_id, concern, evidence, text, valid INTEGER,
          violations TEXT /*json*/, model, created_at)          -- 영상의 최신 행이 현재 초안
posts    (id INTEGER PK, video_id, profile_id, draft_id, text,
          status TEXT CHECK(status IN ('success','failed','blocked')),
          reason TEXT, screenshot_path, created_at)              -- 게시 기록 (차단 포함)
jobs     (id TEXT PK, video_id, profile_id, draft_id,
          state TEXT CHECK(state IN ('queued','opening_profile','typing','posted','verified','failed')),
          message, screenshot_path, post_id, created_at, updated_at)
profiles (id TEXT PK, label, logged_in INTEGER, channel_name, checked_at)
```

- 하루 상한 카운트 = `posts.status='success' AND date(created_at,'localtime') = date('now','localtime')`.
- 영상당 1개 = `EXISTS posts WHERE video_id=? AND status='success'`.
- 진행 상태 ↔ PDF 표현: opening_profile=프로필 여는 중, typing=입력 중, posted=게시 완료, verified=댓글 보기, failed=실패.

## 7. 초안 파이프라인

### 7.1 맥락 수집 (영상 선택 시)
1. `videos` 행 (제목·설명·채널).
2. 자막: `yt-dlp --skip-download --write-auto-sub --write-sub --sub-lang ko --sub-format vtt -o data/captions/%(id)s <url>` → `data/captions/<id>.ko.vtt` → `parseVtt()`로 타임스탬프 제거·연속 중복 줄 제거 → 최대 6,000자로 자름. yt-dlp 없음/자막 없음이면 `source='none'`. 수동/자동 자막은 구분하지 않는다(`'subtitle'`).
3. 인기 댓글: Data API `commentThreads.list(videoId, order=relevance, maxResults=10)` → 텍스트만.
4. 자막 유무를 UI 배지로 표시("자막 있음 / 자막 없음 → 제목·설명·댓글로 작성").

### 7.2 생성
Anthropic Messages API, 모델 `claude-sonnet-5-5`, tool use로 JSON 강제:

```json
{ "concern": "영상이 다루는 연애 고민 한 문장",
  "evidence": "댓글이 짚은 영상 속 구체 장면·말 (원문 인용 또는 묘사)",
  "text": "댓글 초안 40~120자" }
```

### 7.3 프롬프트 요지
- 화자 = 이 영상을 본 시청자. 영상 내용에서 시청자 성별·상황을 추론해 1인칭으로.
- 반드시 영상 속 구체적 장면이나 말 하나를 짚는다(`evidence`에 따로 적고, `text`에도 녹인다).
- 톤: 반말·해요체 섞인 캐주얼, "ㅠㅠ" 같은 감정 표현 허용, 광고 느낌 금지.
- 운명원은 후반부에 1회, `brand_phrases` 중 하나를 변주한 전문(傳聞) 형태("잘 본다던데 나도 보고 싶다"). 직접 이용한 것처럼 쓰지 않는다.
- 금지: 링크, 해시태그, `banned_phrases`, 영상 제목 그대로 반복.
- 40~120자. 영상마다 다른 문장.
- 이전 시도가 검증에 실패했으면 위반 항목을 넣어 다시 요청(최대 2회 추가).

### 7.4 검증 (`validateDraft`)
위반 코드: `too_short`, `too_long`, `has_link`, `has_hashtag`, `banned_phrase`, `missing_brand`. 글자수는 `[...text].length`. 링크 = `/https?:\/\/|www\.|\.(com|kr|net|ly)\b/i`. 해시태그 = `/#\S/`. 통과 못 하면 `drafts.valid=0`, 사유 표시, 댓글 달기 버튼 비활성.

## 8. 게시 파이프라인

```
POST /api/posts {videoId, profileId?}
  → 운영 규칙 검사 (§9). 차단이면 posts(status=blocked) 기록 후 409 {reason}
  → 진행 중 job 있으면 409 {reason:'busy'}
  → profileId 없으면 자동 배정(pickProfile)
  → jobs 행 생성(queued), runPostJob(jobId) 백그라운드 시작, 202 {jobId}
runPostJob
  opening_profile: launchPersistentContext(profileDir(n), {channel:'chrome', headless:false, locale:'ko-KR', viewport:null})
                   youtube.com/watch?v=<id> 이동, 로그인 확인(아바타 버튼 없으면 → failed not_logged_in)
  typing:          #comments 로 스크롤 → #placeholder-area 클릭 → #contenteditable-root 에 pressSequentially(text, 랜덤 지연)
                   댓글창 없으면 → failed comments_disabled
  posted:          #submit-button 클릭
  verified:        최대 30초 동안 ytd-comment-thread-renderer 중 author == 내 채널명 && 본문 == text 찾기
                   → scrollIntoView + 하이라이트(테두리) + 전체 화면 캡처 data/screenshots/<jobId>.png
                   posts(status=success) 기록, 브라우저 3초 후 닫기
  failed:          사유 분류(not_logged_in | comments_disabled | element_not_found | timeout | unknown)
                   + 캡처 + posts(status=failed) 기록
```

UI는 `GET /api/posts/<jobId>`를 0.5초마다 읽어 4단계 스테퍼를 갱신하고, 끝나면 캡처 이미지와 영상 링크를 보여준다("댓글 보기").

## 9. 운영 규칙 (`checkPostAllowed`)

순수 함수. 입력: 영상 채널 ID, 영상 ID, 허용 채널 목록, 하루 상한, 오늘 성공 수, 해당 영상 성공 존재 여부.
순서: 허용 범위 → 영상당 1개 → 하루 상한. 첫 위반 하나만 반환.

| 사유 코드 | 메시지 |
|---|---|
| `not_allowed_channel` | 허용 채널의 영상이 아닙니다 |
| `already_posted` | 이 영상에는 이미 댓글을 달았습니다 |
| `daily_cap_reached` | 오늘 게시 상한(10개)에 도달했습니다 |

UI는 같은 함수 결과로 버튼을 미리 비활성화하고 툴팁에 메시지를 보여준다. 서버는 어쨌든 다시 검사한다. 차단은 `posts(status='blocked', reason)`로 기록돼 게시 기록에 보인다.

## 10. 프로필

- 디렉터리 `data/profiles/<n>` (n = config 순서 1부터). 라벨은 config 문자열(유튜브1…).
- `/settings`: 프로필 카드 3개. [로그인 창 열기] → persistent context로 `youtube.com` 열고 반환(사용자가 로그인 후 창을 닫음). [상태 확인] → 헤드풀로 짧게 열어 아바타 버튼 유무·채널명(아바타 메뉴 or `youtube.com/account`)을 읽어 `profiles` 갱신.
- 자동 배정: `pickProfile(profiles, lastUsedId)` — 로그인된 프로필만, 마지막 사용 다음 순서, 없으면 첫 번째, 하나도 없으면 null → UI에 "로그인된 프로필 없음".

## 11. UI

단일 페이지, 한국어. 상단에 "오늘 게시 N/10" 배지와 [설정] 링크.

| 칸 | 제목 | 한 줄 안내 | 내용 |
|---|---|---|---|
| ① | 영상 불러오기 | 버튼 한 번에 허용 채널 최신 영상 | [불러오기] 버튼, 채널 칩 필터, 카드 목록(썸네일·제목·채널·날짜·자막 배지), 하단 "링크 직접 입력" 입력창 + [추가] |
| ② | 영상 선택 | 목록에서 고르면 AI가 초안을 씁니다 | 선택 영상 요약, 고민 한 줄, 근거 장면, 초안(글자수), 검증 배지, [다시 생성] |
| ③ | 댓글 달기 | 프로필을 골라 누르면 크롬이 열립니다 | 프로필 선택(자동/유튜브1~3 + 로그인 상태), [댓글 달기](차단 시 비활성 + 툴팁), 4단계 스테퍼, 결과 캡처, 실패 사유 |

하단: 게시 기록 표(시각·영상·프로필·댓글·결과·사유·캡처 링크), 최신순.

## 12. 테스트 전략

- vitest 단위 테스트: `rules`, `draft/validate`, `youtube/url`, `youtube/captions.parseVtt`, `browser/rotation`, `youtube/api`(fetch 모킹), `draft/generate`(SDK 모킹, 재생성 루프).
- Playwright 게시 흐름: 수동 + 시연 영상. 셀렉터 변경 리스크는 `scripts/try-post.ts`(단독 실행 스크립트)로 빨리 재현.
- Route Handler: 얇게 유지, 테스트 생략.

## 13. 산출물

- README: 설치(Node ≥ 25, pnpm, Chrome, yt-dlp 선택), 키 설정, 실행, 프로필 로그인, 사용법, **제작 의도**(맥락 우선 / 사람처럼 / 안전장치) + ADR 링크, 오픈소스 출처.
- 시연 영상 시나리오(2~3분): README `docs/demo.md`.
  1. 0:00 대시보드 한 바퀴(세 칸, 오늘 0/10)
  2. 0:15 ① 불러오기 → 6채널 목록
  3. 0:35 ② 테스트 영상 선택 → 고민 한 줄·근거 장면·초안·검증 배지 → [다시 생성] 한 번
  4. 1:05 ③ 프로필 "유튜브2" 선택 → [댓글 달기] → 크롬 창 → 한 글자씩 타이핑 → 게시 → 내 댓글 하이라이트 → 대시보드 스테퍼·캡처
  5. 2:05 같은 영상 다시 → 버튼 비활성·차단 기록. 허용 밖 채널 링크 직접 입력 → 차단
  6. 2:30 게시 기록 표, 제작 의도 한 줄
- 제출 전: `git log -p | grep -i api_key` 류 비밀값 스캔, `.env.example`만 커밋됐는지 확인.

## 14. 전역 제약

- Node ≥ 25 (`node:sqlite`), pnpm, macOS + 설치된 Google Chrome.
- yt-dlp는 선택 설치. 없어도 동작(자막 없음 폴백).
- 댓글 40~120자, 하루 상한 10, 영상당 1개 — 값은 `config.yaml`에서만 온다.
- UI·문서 한국어, 코드 식별자 영어. 용어는 CONTEXT.md.
- 비밀값은 `.env.local`에만. 저장소는 Public.
- 시연 영상 전에는 개발 서버를 끄고 `pnpm reset:data`로 `data/`를 비운 상태에서 시작(`data/profiles/`의 구글 로그인은 남긴다).

## 15. 리뷰 포커스 (스펙이 암시하지만 테스트가 안 다루기 쉬운 것)

1. 자막·설명 모두 없는 영상 → 초안은 제목+인기 댓글로 생성되고 "자막 없음" 배지. 실패가 아니다. (06 초안 테스트)
2. 프로필 로그인이 만료된 상태에서 게시 → `not_logged_in` 실패 + 캡처, 하루 상한 카운트는 오르지 않는다. (08 게시, 03 규칙 테스트)
3. 하루 상한 도달 후 로컬 자정이 지나면 다시 허용된다. (03 규칙 테스트: 날짜 주입)
4. 직접 입력 링크 형식이 다양하다(`youtu.be/ID`, `watch?v=ID&t=10s`, `shorts/ID`, 앞뒤 공백, ID만) → 전부 파싱되거나 명확한 오류. (04 URL 테스트)
5. 같은 영상에서 게시가 실패한 뒤 재시도 → 허용(실패는 영상당 1개에 안 센다). 게시 중에 또 누르면 `busy` 409. (03, 09 테스트)

## 16. 리스크

| 리스크 | 대응 |
|---|---|
| YouTube DOM 셀렉터 변경 | `poster.ts`에 셀렉터 상수 모음, `scripts/try-post.ts`로 즉시 재현. 실패 시 캡처가 남는다 |
| 구글이 자동화 프로필 로그인 차단 | 실제 Chrome 채널 + persistent context(ADR-0002). 로그인은 사람이 직접 |
| `ANTHROPIC_BASE_URL` 프록시 간섭 | 앱에서 `baseURL`을 명시, 구현 첫날 호출 테스트 |
| Data API 할당량 | 목록 1회 ≈ 12유닛, 하루 10,000. 문제 없음. `search.list`(100)는 미룸 범위에만 |
| yt-dlp 미설치/자막 없음 | 폴백 경로를 기본 테스트 케이스로 |
| Next.js가 playwright를 번들하려 함 | `serverExternalPackages: ['playwright']` |

## 17. 실행 순서

| 이슈 | 내용 | Blocked by |
|---|---|---|
| 01 | 프로젝트 뼈대 + 설정 로더 | — |
| 02 | SQLite 저장소 + 리포지토리 | 01 |
| 03 | 운영 규칙 + 자동 배정 (순수 함수) | 02 |
| 04 | 링크 파서 + Data API 클라이언트 | 02 |
| 05 | 자막 수집 (yt-dlp) + VTT 파서 | 02 |
| 06 | 초안 생성 (프롬프트·검증·재생성) | 02 |
| 07 | 크롬 프로필 (로그인 창·상태 확인) | 02 |
| 08 | 댓글 게시 (Playwright) + 작업 러너 | 03, 06, 07 |
| 09 | API 라우트 | 04, 05, 06, 08 |
| 10 | 대시보드 UI + 설정 페이지 | 09 |
| 11 | README · 제작 의도 · 시연 시나리오 | 10 |
| 12 | 시연 리허설 · 제출 체크 (사람) | 11 |
| 13 | 같은 채널 초안 겹침 막기 | 06 |
| 14 | 짜임 힌트 문구 · 길이 안정화 | 13 |
| 15 | 뜨기 직전: 설정 · 스키마 · 판정 · 검색 어댑터 · 리포 | 11 |
| 16 | 뜨기 직전: 라우트 · ① 토글 UI | 15 |
| 17 | 뜨기 직전: README · AGENTS.md · 시연 컷 | 16 |

03~07은 02 뒤에 서로 독립. 07은 사람 로그인이 필요하므로 일찍 시작해 둔다.

## 18. 뜨기 직전 영상 (Rising Video) — 2026-10-21 추가

근거: ADR-0005. 용어: CONTEXT.md "뜨기 직전 영상", "시간당 조회수".

### 18.1 판정 (순수 함수 `youtube/rising.ts`)
- `hoursSincePublish = max((now − publishedAt) / 1h, 1/60)` — 1분 미만은 1분으로 본다(0 나눗셈 방지).
- `viewsPerHour = viewCount / hoursSincePublish`.
- `rising = minViews ≤ viewCount ≤ maxViews ∧ viewsPerHour ≥ minViewsPerHour` (경계 포함).
- `publishedAfterIso(now, withinHours)` → RFC3339, 밀리초 없이.

### 18.2 검색 (`youtube/api.ts` `searchRecentVideos`)
`search.list` part=snippet, type=video, order=date, maxResults=50, regionCode=KR, relevanceLanguage=ko, q=`rising.keyword`, publishedAfter → `nextPageToken`으로 `rising.pages`까지 → 영상 ID 중복 제거 → `videos.list`로 메타(조회수 포함). 반환 `VideoMeta[]`(훑은 영상 전부). 판정은 호출자가 한다.

### 18.3 설정 (`config.yaml`, zod default로 기존 설정 호환)
```yaml
rising:
  keyword: 연애
  min_views: 1000
  max_views: 5000
  min_views_per_hour: 150
  published_within_hours: 48
  pages: 2            # search.list 페이지 수, 페이지당 100유닛
```

### 18.4 데이터 모델
```sql
videos.source CHECK (source IN ('list','direct','rising'))   -- 'rising' 추가. 구 DB는 reset 필요
rising_searches   (id INTEGER PK, keyword, scanned INTEGER, found INTEGER, searched_at DEFAULT localtime)
rising_candidates (search_id REFERENCES rising_searches(id), video_id REFERENCES videos(id),
                   view_count INTEGER, hours_since_publish REAL, views_per_hour REAL, PRIMARY KEY (search_id, video_id))
```
- 화면은 최신 `rising_searches` 한 건의 후보만 보여준다(교체 의미). 이전 검색은 DB에 남는다.
- `openDb`는 `sqlite_master`의 videos 생성문에 `'rising'`이 없으면 한국어 오류를 던진다: "data/agent.db 스키마가 바뀌었습니다. 개발 서버를 끄고 pnpm reset:data 를 실행한 뒤 다시 시작하세요".

### 18.5 API
| 메서드·경로 | 동작 | 응답 |
|---|---|---|
| GET `/api/rising` | 최신 검색 + 후보(영상 JOIN, 시간당 조회수 내림차순) | `RisingResponse` |
| POST `/api/rising` | 검색 실행 → 판정 → `upsertVideos(rising만, 'rising')` → `insertRisingSearch` | `RisingResponse` / 502 `upstream_error` |

`RisingResponse = { keyword: string; searchedAt: string | null; scanned: number; candidates: RisingCandidateView[] }`
`RisingCandidateView = VideoView & { viewsPerHour: number; hoursSincePublish: number }`
`ConfigResponse.rising = { keyword, minViews, maxViews, minViewsPerHour }` (안내 문구용)

### 18.6 UI (① 칸 안)
- 모드 토글: **허용 채널 최신** | **뜨기 직전**. 기본 = 허용 채널 최신.
- 뜨기 직전 모드: 버튼 [뜨기 직전 찾기], 안내 "'연애' 48시간 · 조회수 1,000~5,000 · 시간당 150+", 상태 "마지막 검색 N분 전 · 훑은 영상 M개 · 후보 K개". 카드는 같은 모양 + 배지 "조회수 3,210 · 시간당 +210". 채널 칩 없음. 직접 입력 폼은 그대로.
- 후보 선택 → ② 기존 초안 파이프라인. ③은 허용 범위 verdict가 막고, 안내 한 줄 "뜨기 직전 영상은 초안까지만 만듭니다 (허용 채널 아님)". 허용 채널 영상이면 기존대로 게시 가능.
- 자동 갱신 없음. 버튼은 로딩 중 비활성.

### 18.7 테스트
`tests/rising.test.ts`(판정 경계·publishedAfter 형식), `tests/youtube-api.test.ts`(검색 페이지네이션·파라미터), `tests/repo.test.ts`(rising 리포), `tests/config.test.ts`(default), `tests/db.test.ts`(구 스키마 감지). 라우트·UI는 수동.
