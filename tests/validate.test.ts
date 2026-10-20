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
