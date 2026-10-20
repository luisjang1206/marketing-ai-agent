import { buildSystemPrompt, buildUserPrompt, type DraftContext } from './prompt'
import { validateDraft, type DraftRules, type Validation, type Violation } from './validate'

export type DraftOutput = { concern: string; evidence: string; text: string }
export type DraftLLM = (system: string, user: string) => Promise<DraftOutput>

// 검증을 통과할 때까지 위반 항목을 되먹여 다시 요청한다. 첫 시도 + 최대 maxRetries(기본 2)회.
export async function generateDraft(ctx: DraftContext, cfg: { rules: DraftRules; brandPhrases: string[]; maxRetries?: number }, llm: DraftLLM)
  : Promise<{ draft: DraftOutput; validation: Validation; attempts: number }> {
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
