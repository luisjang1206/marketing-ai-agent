import { describe, it, expect } from 'vitest'
import { checkPostAllowed } from '@/lib/rules'
const base = { videoChannelId: 'UCa', allowedChannelIds: ['UCa', 'UCb'], alreadyPosted: false, successCountToday: 0, dailyMax: 10 }
describe('checkPostAllowed', () => {
  it('allows a fresh video on an allowed channel', () => expect(checkPostAllowed(base)).toEqual({ allowed: true }))
  it('blocks a channel outside the allowlist first', () => {
    const v = checkPostAllowed({ ...base, videoChannelId: 'UCz', alreadyPosted: true, successCountToday: 10 })
    expect(v).toMatchObject({ allowed: false, reason: 'not_allowed_channel' })
  })
  it('blocks a video that already has a successful post', () =>
    expect(checkPostAllowed({ ...base, alreadyPosted: true })).toMatchObject({ allowed: false, reason: 'already_posted' }))
  it('blocks when today reached the cap, allows one below', () => {
    expect(checkPostAllowed({ ...base, successCountToday: 10 })).toMatchObject({ allowed: false, reason: 'daily_cap_reached', message: expect.stringContaining('10') })
    expect(checkPostAllowed({ ...base, successCountToday: 9 })).toEqual({ allowed: true })
  })
})
