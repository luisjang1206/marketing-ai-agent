// 순수 모듈: 클라이언트 컴포넌트도 import 한다. node:*, db, repo 를 들이지 않는다.
export type Violation = 'too_short' | 'too_long' | 'has_link' | 'has_hashtag' | 'banned_phrase' | 'missing_brand'
export type DraftRules = { minChars: number; maxChars: number; brand: string; bannedPhrases: string[] }
export type Validation = { ok: boolean; violations: Violation[]; length: number }

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
