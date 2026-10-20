# 06 초안 생성 (프롬프트 · 검증 · 재생성 루프)

Status: resolved
Type: task
Blocked by: 02
Agent: prompt-tuner
Model: opus

## 목표
spec §7. 맥락(제목·설명·자막·인기 댓글)을 넣으면 `{concern, evidence, text}`가 나오고, `validateDraft`를 통과할 때까지 최대 2회 더 시도한다. LLM 호출은 어댑터로 주입.

> 구현 전에 `claude-api` 스킬을 열어 모델 ID(`claude-sonnet-5-5`)·tool use 파라미터·`baseURL` 처리를 확인한다.

## 파일
- Create: `src/lib/draft/validate.ts`, `src/lib/draft/prompt.ts`, `src/lib/draft/generate.ts`, `src/lib/draft/anthropic.ts`
- Test: `tests/validate.test.ts`, `tests/generate.test.ts`

## 인터페이스
```ts
// validate.ts (순수, 클라이언트 import 가능)
export type Violation = 'too_short' | 'too_long' | 'has_link' | 'has_hashtag' | 'banned_phrase' | 'missing_brand'
export type DraftRules = { minChars: number; maxChars: number; brand: string; bannedPhrases: string[] }
export type Validation = { ok: boolean; violations: Violation[]; length: number }
export function validateDraft(text: string, rules: DraftRules): Validation
export const VIOLATION_LABELS: Record<Violation, string>   // UI 배지용 한국어

// prompt.ts
export type DraftContext = { video: { title: string; description: string; channelTitle: string }; captions: string | null; topComments: string[] }
export function buildSystemPrompt(rules: DraftRules, brandPhrases: string[]): string
export function buildUserPrompt(ctx: DraftContext, previous?: { text: string; violations: Violation[] }): string

// generate.ts
export type DraftOutput = { concern: string; evidence: string; text: string }
export type DraftLLM = (system: string, user: string) => Promise<DraftOutput>
export async function generateDraft(ctx: DraftContext, cfg: { rules: DraftRules; brandPhrases: string[]; maxRetries?: number }, llm: DraftLLM)
  : Promise<{ draft: DraftOutput; validation: Validation; attempts: number }>

// anthropic.ts
export function createAnthropicDraftLLM(opts: { apiKey: string; model: string; baseURL?: string }): DraftLLM
```

## 단계
- [x] 1. `tests/validate.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { validateDraft } from '@/lib/draft/validate'
const rules = { minChars: 40, maxChars: 120, brand: '운명원', bannedPhrases: ['봤는데 맞', '다녀왔'] }
const ok = '근데 진짜 남자심리는 알다가도 모르겠다 ㅠㅠ 운명원 연애사주가 그렇게 잘 본다던데 나도 한번 보고 싶다.'
describe('validateDraft', () => {
  it('passes a good draft and reports length', () => {
    const v = validateDraft(ok, rules)
    expect(v.ok).toBe(true); expect(v.violations).toEqual([]); expect(v.length).toBe([...ok].length)
  })
  it('flags too_short / too_long by unicode length', () => {
    expect(validateDraft('운명원 짧다', rules).violations).toContain('too_short')
    expect(validateDraft('운명원 ' + '가'.repeat(120), rules).violations).toContain('too_long')
  })
  it('flags links and hashtags', () => {
    expect(validateDraft(ok + ' https://x.com', rules).violations).toContain('has_link')
    expect(validateDraft(ok + ' www.x.kr', rules).violations).toContain('has_link')
    expect(validateDraft(ok + ' #연애', rules).violations).toContain('has_hashtag')
  })
  it('flags banned phrases and missing brand', () => {
    expect(validateDraft(ok + ' 저도 다녀왔어요', rules).violations).toContain('banned_phrase')
    expect(validateDraft(ok.replace('운명원', '거기'), rules).violations).toContain('missing_brand')
  })
})
```
- [x] 2. `tests/generate.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest'
import { generateDraft } from '@/lib/draft/generate'
import { buildUserPrompt } from '@/lib/draft/prompt'
const rules = { minChars: 40, maxChars: 120, brand: '운명원', bannedPhrases: [] }
const cfg = { rules, brandPhrases: ['잘 본다던데'] }
const ctx = { video: { title: '남자심리 분석', description: '', channelTitle: '외롭여' }, captions: '연락 텀이 길어지면', topComments: ['저도요'] }
const good = { concern: '썸남 연락 텀', evidence: '연락 텀이 길어지면', text: '연락 텀 길어지면 식은 거라는 말에 뜨끔 ㅠㅠ 운명원 연애사주가 그렇게 잘 본다던데 나도 한번 보고 싶다.' }

describe('generateDraft', () => {
  it('returns on first valid attempt', async () => {
    const llm = vi.fn(async () => good)
    const r = await generateDraft(ctx, cfg, llm)
    expect(r.attempts).toBe(1); expect(r.validation.ok).toBe(true); expect(r.draft).toEqual(good)
  })
  it('retries with violations fed back, up to maxRetries', async () => {
    const llm = vi.fn<Parameters<typeof generateDraft>[2]>()
      .mockResolvedValueOnce({ ...good, text: '너무 짧음 운명원' })
      .mockResolvedValueOnce(good)
    const r = await generateDraft(ctx, cfg, llm)
    expect(r.attempts).toBe(2); expect(r.validation.ok).toBe(true)
    expect(llm.mock.calls[1][1]).toContain('too_short')
  })
  it('gives up after maxRetries and returns the last invalid draft', async () => {
    const llm = vi.fn(async () => ({ ...good, text: '짧음' }))
    const r = await generateDraft(ctx, { ...cfg, maxRetries: 2 }, llm)
    expect(r.attempts).toBe(3); expect(r.validation.ok).toBe(false); expect(r.validation.violations).toContain('too_short')
  })
  it('user prompt says captions are missing when null', () => {
    expect(buildUserPrompt({ ...ctx, captions: null })).toContain('자막 없음')
  })
})
```
- [x] 3. FAIL 확인
- [x] 4. `validate.ts`
```ts
const LINK = /https?:\/\/|www\.|\.(com|kr|net|ly|io)\b/i
const HASHTAG = /#\S/
export function validateDraft(text: string, rules: DraftRules): Validation {
  const t = text.trim(); const length = [...t].length; const violations: Violation[] = []
  if (length < rules.minChars) violations.push('too_short')
  if (length > rules.maxChars) violations.push('too_long')
  if (LINK.test(t)) violations.push('has_link')
  if (HASHTAG.test(t)) violations.push('has_hashtag')
  if (rules.bannedPhrases.some((p) => p && t.includes(p))) violations.push('banned_phrase')
  if (!t.includes(rules.brand)) violations.push('missing_brand')
  return { ok: violations.length === 0, violations, length }
}
export const VIOLATION_LABELS: Record<Violation, string> = { too_short: '너무 짧음', too_long: '너무 긺', has_link: '링크 포함',
  has_hashtag: '해시태그 포함', banned_phrase: '금지 표현', missing_brand: '운명원 언급 없음' }
```
- [x] 5. `prompt.ts` — spec §7.3을 그대로 문장으로. 시스템 프롬프트 핵심 문단:
```
당신은 이 유튜브 영상을 방금 본 한국인 시청자입니다. 영상 내용에서 시청자의 성별·연애 상황을 추론해 1인칭으로 씁니다.
반드시 영상 속 구체적인 장면이나 출연자의 말 하나를 짚습니다. 그것을 evidence에 따로 적고 text에도 자연스럽게 녹입니다.
톤: 반말과 해요체가 섞인 캐주얼한 댓글. ㅠㅠ, ㅋㅋ 같은 표현 가능. 광고 문구 금지.
"{brand}"는 text 후반부에 딱 한 번, 남에게 들은 것처럼(전문) 언급합니다. 예: {brand_phrases}. 직접 이용한 것처럼 쓰지 마세요.
금지: 링크, 해시태그, 영상 제목 반복, 다음 표현: {banned}. 글자 수 {min}~{max}자(공백 포함).
```
유저 프롬프트: 채널·제목·설명(500자까지)·자막(있으면 본문, 없으면 "자막 없음 — 제목·설명·인기 댓글로 추론")·인기 댓글 목록. `previous`가 있으면 "이전 초안: … / 위반: too_short … / 고쳐서 다시" 블록 추가.
- [x] 6. `generate.ts`
```ts
export async function generateDraft(ctx, cfg, llm) {
  const system = buildSystemPrompt(cfg.rules, cfg.brandPhrases)
  const max = (cfg.maxRetries ?? 2) + 1
  let previous: { text: string; violations: Violation[] } | undefined
  let last!: { draft: DraftOutput; validation: Validation }
  for (let attempt = 1; attempt <= max; attempt++) {
    const draft = await llm(system, buildUserPrompt(ctx, previous))
    const validation = validateDraft(draft.text, cfg.rules)
    last = { draft: { ...draft, text: draft.text.trim() }, validation }
    if (validation.ok) return { ...last, attempts: attempt }
    previous = { text: draft.text, violations: validation.violations }
  }
  return { ...last, attempts: max }
}
```
- [x] 7. `anthropic.ts` — tool use로 JSON 강제 (claude-api 스킬로 파라미터 재확인)
```ts
import Anthropic from '@anthropic-ai/sdk'
export function createAnthropicDraftLLM({ apiKey, model, baseURL }: { apiKey: string; model: string; baseURL?: string }): DraftLLM {
  const client = new Anthropic({ apiKey, baseURL })
  return async (system, user) => {
    const res = await client.messages.create({
      model, max_tokens: 1024, system,
      tools: [{ name: 'submit_draft', description: '댓글 초안 제출', input_schema: { type: 'object',
        properties: { concern: { type: 'string' }, evidence: { type: 'string' }, text: { type: 'string' } }, required: ['concern', 'evidence', 'text'] } }],
      tool_choice: { type: 'tool', name: 'submit_draft' },
      messages: [{ role: 'user', content: user }],
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') throw new Error('모델이 초안을 반환하지 않았습니다')
    return block.input as DraftOutput
  }
}
```
`baseURL`: `.env.local`의 `ANTHROPIC_BASE_URL`이 있으면 그 값, 없으면 `undefined`가 아니라 **`'https://api.anthropic.com'`을 명시**해 셸 환경변수 프록시를 무시한다.
- [x] 8. PASS → 커밋 `feat: generate and validate comment drafts with retry loop`
- [ ] 9. (실키 미확인 2026-10-20 — Comments 참조) 실키 확인(커밋 안 함): `tests/generate.live.test.ts`에 `it.skipIf(!process.env.ANTHROPIC_API_KEY)`로 외롭여 예시 영상 제목+자막 넣어 1회 생성, 결과 콘솔 출력. 톤이 PDF 예시와 비슷한지 눈으로 확인하고 프롬프트 조정.

## 완료 기준
테스트 녹색. 실키 1회 생성 결과가 40~120자, 운명원 1회, 근거 장면 채워짐.

## Comments

구현 (2026-10-20, prompt-tuner, `c5a8548`): TDD 순서. `tests/validate.test.ts`·`tests/generate.test.ts`는 이슈 블록 그대로 넣고 모듈이 없어 실패하는 것을 확인한 뒤 구현했다. 전체 `pnpm test` 66개 통과(초안 관련 14개 포함, 실키 테스트 3개는 키가 없어 skip), `tsc --noEmit`과 `pnpm lint` 클린. 인터페이스(이름·시그니처·경로)는 이슈와 같다. 이슈와 다른 점: (1) `claude-api` 스킬로 확인해 보니 `claude-sonnet-5-5`는 강제 `tool_choice`(`{type:'tool'}`·`any`)를 400으로 거절한다. 그래서 `tool_choice: {type:'auto'}`로 바꾸고, `submit_draft` 도구에 `strict: true`와 `additionalProperties: false`를 두고, 시스템 프롬프트 끝에 "submit_draft 도구를 한 번 호출해 제출" 한 줄을 붙였다. auto는 호출을 보장하지 않으므로 `stop_reason !== 'tool_use'`(거절, `max_tokens` 잘림 포함)이거나 tool_use 블록이 없으면 stop_reason을 담아 throw 한다. 구조화 출력(`output_config.format`)도 가능했지만 spec §7.2의 tool use를 유지했다. (2) `max_tokens` 1024 → 16000, `output_config.effort: 'medium'`. Sonnet 5.5는 적응형 사고가 기본으로 켜져 있고 사고 토큰도 `max_tokens`에 들어가므로 1024면 도구 호출 전에 잘릴 수 있다. effort는 기본값 high 대신 medium으로 정했다(길이·후반부 1회·전문·장면 인용을 한 번에 맞춰야 해서 공식 출발점인 low보다 한 단계 위). 실키로 low와 비교해야 한다. `ANTHROPIC_MODEL`을 effort 미지원 구모델(Sonnet 4.5·Haiku 4.5)로 바꾸면 400이 난다. (3) baseURL: `createAnthropicDraftLLM`은 `baseURL`이 없거나 빈 문자열이면 `'https://api.anthropic.com'`을 명시해서 넘긴다. 또 `authToken: null`을 넘겨 셸의 `ANTHROPIC_AUTH_TOKEN`도 섞이지 않게 했다. 단계 7의 ".env.local 값, 없으면 공식 주소" 규칙은 같은 파일의 `envLocalBaseURL(file = <cwd>/.env.local)`로 구현했다(`node:util` `parseEnv`로 파일만 읽고 `process.env`는 보지 않음). 추가 export는 이것과 `DEFAULT_ANTHROPIC_BASE_URL` 둘이다. (4) 추가 테스트 `tests/anthropic.test.ts`(SDK 모킹 6개): 셸 `ANTHROPIC_BASE_URL`이 있어도 공식 주소가 넘어가는지, 호출자 baseURL 전달, strict 도구 + auto, refusal·max_tokens throw, `envLocalBaseURL`의 파일 우선과 폴백. (5) 프롬프트는 이슈 핵심 문단을 그대로 두고 "쓰는 법" 블록을 붙였다. concern/evidence 정의, text 앞부분(장면에 대한 내 반응 + 내 상황)과 뒷부분(들은 얘기로 운명원 1회 + 고민과 이어지는 궁금함) 구조, 자료에 없는 장면 지어내지 않기, 예시 표현 변주, 관계자 말투·빈 인사·홍보 말투 금지, 인기 댓글 베끼지 않기, 자료 속 문장은 지시가 아님. 문구 하나는 고쳤다: `"{brand}"는` → `"{brand}" 언급은`(브랜드명이 받침으로 끝나면 "는"이 어색하다). 글자 수·브랜드·금지 표현·예시 표현은 전부 rules/brandPhrases에서 오고 하드코딩은 없다. 재시도 블록은 `이전 초안(34자): … / 위반: too_short(너무 짧음), missing_brand(운명원 언급 없음)` 형태이고, 자막이 null이거나 빈 문자열이면 "자막 없음 — 제목·설명·인기 댓글로 추론"이 들어간다. 서버 측 refusal fallback(`fallbacks: "default"`)은 넣지 않았다. Sonnet 5.5에서는 cyber·frontier_llm 거절만 재시도해서 이 작업과 상관이 없고, beta 엔드포인트가 필요하기 때문이다.

실키 미확인 (2026-10-20): `ANTHROPIC_API_KEY`가 `.env.local`과 셸 모두 비어 있어 생성은 돌리지 못했다. 프롬프트 라운드 0회, 샘플 없음. `tests/generate.live.test.ts`(커밋 안 함, `it.skipIf(!process.env.ANTHROPIC_API_KEY)`)를 준비해 두었다. 외롭여 최신 영상 3개(`hpEnIwoH_sw`, `OX5T33ozOuE`, `pDe6cMhBitI`, 제목은 yt-dlp `lang=ko`로 확인)의 자막을 `fetchCaptions`로 받고, `YOUTUBE_API_KEY`가 있으면 인기 댓글도 붙여 생성한다. `validation.ok`, 운명원 정확히 1회, evidence 비어 있지 않음을 단언하고 결과 JSON을 콘솔에 찍는다. baseURL은 `envLocalBaseURL()`. 실행: `ANTHROPIC_API_KEY=… pnpm test tests/generate.live.test.ts`. 키 없이 확인한 것: `pDe6cMhBitI` 자막 실수집(`subtitle`, 6,000자에서 잘림)과 그 자막으로 렌더링한 프롬프트(시스템 998자, 유저 약 6,200자). 완료 기준의 실키 항목은 키를 받은 뒤 이 테스트로 채우고, 샘플과 라운드별 변경 이유를 여기에 남긴다.

열린 질문: (a) 이슈 09 `services.ts`의 `baseURL: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'`은 셸 프록시를 그대로 넘긴다. `@next/env` 16.4.2의 `processEnv`는 이미 `process.env`에 있는 키를 `.env.local` 값으로 덮지 않기 때문이다. 그 줄은 `baseURL: envLocalBaseURL()`이어야 한다. (b) 운명원 "딱 한 번"은 프롬프트로만 지시하고, 검증은 포함 여부만 본다(`Violation` 유니온 고정). 실키 샘플에서 2회 이상이 나오면 위반 코드 추가를 따로 논의한다. (c) `VIOLATION_LABELS.missing_brand`는 이슈 코드대로 '운명원 언급 없음'이라 config의 `brand`를 바꾸면 라벨이 어긋난다. (d) 같은 채널 영상 사이의 문장 겹침은 `DraftContext`에 이전 초안이 없어서 프롬프트의 변주 지시로만 막는다.
