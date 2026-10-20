# 06 초안 생성 (프롬프트 · 검증 · 재생성 루프)

Status: ready-for-agent
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
- [ ] 1. `tests/validate.test.ts`
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
- [ ] 2. `tests/generate.test.ts`
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
- [ ] 3. FAIL 확인
- [ ] 4. `validate.ts`
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
- [ ] 5. `prompt.ts` — spec §7.3을 그대로 문장으로. 시스템 프롬프트 핵심 문단:
```
당신은 이 유튜브 영상을 방금 본 한국인 시청자입니다. 영상 내용에서 시청자의 성별·연애 상황을 추론해 1인칭으로 씁니다.
반드시 영상 속 구체적인 장면이나 출연자의 말 하나를 짚습니다. 그것을 evidence에 따로 적고 text에도 자연스럽게 녹입니다.
톤: 반말과 해요체가 섞인 캐주얼한 댓글. ㅠㅠ, ㅋㅋ 같은 표현 가능. 광고 문구 금지.
"{brand}"는 text 후반부에 딱 한 번, 남에게 들은 것처럼(전문) 언급합니다. 예: {brand_phrases}. 직접 이용한 것처럼 쓰지 마세요.
금지: 링크, 해시태그, 영상 제목 반복, 다음 표현: {banned}. 글자 수 {min}~{max}자(공백 포함).
```
유저 프롬프트: 채널·제목·설명(500자까지)·자막(있으면 본문, 없으면 "자막 없음 — 제목·설명·인기 댓글로 추론")·인기 댓글 목록. `previous`가 있으면 "이전 초안: … / 위반: too_short … / 고쳐서 다시" 블록 추가.
- [ ] 6. `generate.ts`
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
- [ ] 7. `anthropic.ts` — tool use로 JSON 강제 (claude-api 스킬로 파라미터 재확인)
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
- [ ] 8. PASS → 커밋 `feat: generate and validate comment drafts with retry loop`
- [ ] 9. 실키 확인(커밋 안 함): `tests/generate.live.test.ts`에 `it.skipIf(!process.env.ANTHROPIC_API_KEY)`로 외롭여 예시 영상 제목+자막 넣어 1회 생성, 결과 콘솔 출력. 톤이 PDF 예시와 비슷한지 눈으로 확인하고 프롬프트 조정.

## 완료 기준
테스트 녹색. 실키 1회 생성 결과가 40~120자, 운명원 1회, 근거 장면 채워짐.
