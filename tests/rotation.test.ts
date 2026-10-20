import { describe, it, expect } from 'vitest'
import { pickProfile } from '@/lib/browser/rotation'
const all = [{ id: 'p1', loggedIn: true }, { id: 'p2', loggedIn: true }, { id: 'p3', loggedIn: true }]
describe('pickProfile', () => {
  it('starts with the first logged-in profile', () => expect(pickProfile(all, null)).toBe('p1'))
  it('rotates to the next after the last used', () => { expect(pickProfile(all, 'p1')).toBe('p2'); expect(pickProfile(all, 'p3')).toBe('p1') })
  it('skips profiles that are not logged in', () => expect(pickProfile([all[0], { id: 'p2', loggedIn: false }, all[2]], 'p1')).toBe('p3'))
  it('returns null when nobody is logged in', () => expect(pickProfile(all.map((p) => ({ ...p, loggedIn: false })), 'p1')).toBeNull())
  it('falls back to first when last used id is unknown', () => expect(pickProfile(all, 'p9')).toBe('p1'))
})
