import { describe, it, expect } from 'vitest'
import { matchThread } from '@/lib/browser/poster'

const text = '테스트 댓글입니다. 자동 게시 확인용'
const t = (author: string, content: string) => ({ author, content })

describe('matchThread', () => {
  it('finds my thread by its text, ignoring whitespace differences', () => {
    const threads = [t('@other', '다른 댓글'), t('\n  @Me5th\n', '  테스트 댓글입니다.\n자동 게시   확인용 ')]
    expect(matchThread(threads, text, '@Me5th')).toEqual({ index: 1, authors: ['@Me5th'] })
  })
  it('compares only the first 30 characters of the text', () => {
    const long = '가'.repeat(30) + ' 뒤쪽은 유튜브가 줄여 보여줘도 된다'
    expect(matchThread([t('@Me5th', '가'.repeat(30))], long, '@Me5th').index).toBe(0)
  })
  it('accepts a display name when the comment shows the handle derived from it', () => {
    expect(matchThread([t('@Me5th', text)], text, 'Me 5th').index).toBe(0)
  })
  it('rejects a body match by another author and reports who wrote it', () => {
    expect(matchThread([t('@someoneElse', text)], text, '@Me5th')).toEqual({ index: -1, authors: ['@someoneElse'] })
  })
  it('skips another author and picks my own thread with the same text', () => {
    expect(matchThread([t('@someoneElse', text), t('@Me5th', text)], text, '@Me5th').index).toBe(1)
  })
  it('accepts any author when the profile has no channel name', () => {
    expect(matchThread([t('@anyone', text)], text, null).index).toBe(0)
  })
  it('returns -1 when no body matches', () => {
    expect(matchThread([t('@Me5th', '전혀 다른 댓글')], text, '@Me5th')).toEqual({ index: -1, authors: [] })
  })
})
