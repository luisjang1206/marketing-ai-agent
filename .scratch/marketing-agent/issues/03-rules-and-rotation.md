# 03 운영 규칙 + 자동 배정 (순수 함수)

Status: ready-for-agent
Type: task
Blocked by: 02

## 목표
spec §9 `checkPostAllowed`와 §10 `pickProfile`. I/O 없음. 클라이언트에서도 import 가능해야 한다(버튼 사전 비활성용).

## 파일
- Create: `src/lib/rules.ts`, `src/lib/browser/rotation.ts`
- Test: `tests/rules.test.ts`, `tests/rotation.test.ts`

## 인터페이스
```ts
// src/lib/rules.ts
export type RuleReason = 'not_allowed_channel' | 'already_posted' | 'daily_cap_reached'
export type RuleVerdict = { allowed: true } | { allowed: false; reason: RuleReason; message: string }
export type RuleInput = { videoChannelId: string; allowedChannelIds: string[]; alreadyPosted: boolean; successCountToday: number; dailyMax: number }
export function checkPostAllowed(i: RuleInput): RuleVerdict
export const RULE_MESSAGES: Record<RuleReason, (i: RuleInput) => string>

// src/lib/browser/rotation.ts
export type ProfileStatus = { id: string; loggedIn: boolean }
export function pickProfile(profiles: ProfileStatus[], lastUsedId: string | null): string | null
```

## 단계
- [ ] 1. `tests/rules.test.ts`
```ts
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
```
- [ ] 2. `tests/rotation.test.ts`
```ts
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
```
- [ ] 3. 실행 → FAIL
- [ ] 4. 구현
```ts
// src/lib/rules.ts
export const RULE_MESSAGES: Record<RuleReason, (i: RuleInput) => string> = {
  not_allowed_channel: () => '허용 채널의 영상이 아닙니다',
  already_posted: () => '이 영상에는 이미 댓글을 달았습니다',
  daily_cap_reached: (i) => `오늘 게시 상한(${i.dailyMax}개)에 도달했습니다`,
}
export function checkPostAllowed(i: RuleInput): RuleVerdict {
  const fail = (reason: RuleReason): RuleVerdict => ({ allowed: false, reason, message: RULE_MESSAGES[reason](i) })
  if (!i.allowedChannelIds.includes(i.videoChannelId)) return fail('not_allowed_channel')
  if (i.alreadyPosted) return fail('already_posted')
  if (i.successCountToday >= i.dailyMax) return fail('daily_cap_reached')
  return { allowed: true }
}
// src/lib/browser/rotation.ts
export function pickProfile(profiles: ProfileStatus[], lastUsedId: string | null): string | null {
  const ok = profiles.filter((p) => p.loggedIn)
  if (ok.length === 0) return null
  const idx = profiles.findIndex((p) => p.id === lastUsedId)
  if (idx === -1) return ok[0].id
  for (let k = 1; k <= profiles.length; k++) {
    const cand = profiles[(idx + k) % profiles.length]
    if (cand.loggedIn) return cand.id
  }
  return null
}
```
- [ ] 5. PASS → 커밋 `feat: add operating rules and profile rotation`

## 완료 기준
두 테스트 파일 녹색. 모듈에 `node:` import 없음(클라이언트 번들 가능).
