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
