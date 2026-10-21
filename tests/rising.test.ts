import { describe, it, expect } from 'vitest'
import { assessRising, publishedAfterIso } from '@/lib/youtube/rising'
const rules = { minViews: 1000, maxViews: 5000, minViewsPerHour: 150 }
const now = new Date('2026-10-21T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
describe('assessRising', () => {
  it('computes average views per hour since publish', () => {
    const a = assessRising({ viewCount: 3000, publishedAt: hoursAgo(10) }, now, rules)
    expect(a.hoursSincePublish).toBeCloseTo(10); expect(a.viewsPerHour).toBeCloseTo(300); expect(a.rising).toBe(true)
  })
  it('includes the boundaries', () => {
    expect(assessRising({ viewCount: 1000, publishedAt: hoursAgo(1) }, now, rules).rising).toBe(true)
    expect(assessRising({ viewCount: 5000, publishedAt: hoursAgo(33) }, now, rules).rising).toBe(true)   // 151.5/h
    expect(assessRising({ viewCount: 1500, publishedAt: hoursAgo(10) }, now, rules).rising).toBe(true)   // 정확히 150/h
  })
  it('rejects too few, too many, or too slow', () => {
    expect(assessRising({ viewCount: 999, publishedAt: hoursAgo(1) }, now, rules).rising).toBe(false)
    expect(assessRising({ viewCount: 5001, publishedAt: hoursAgo(1) }, now, rules).rising).toBe(false)
    expect(assessRising({ viewCount: 3000, publishedAt: hoursAgo(30) }, now, rules).rising).toBe(false)   // 100/h
  })
  it('clamps age to one minute so a just-published video does not divide by zero', () => {
    const a = assessRising({ viewCount: 1200, publishedAt: now.toISOString() }, now, rules)
    expect(a.hoursSincePublish).toBeCloseTo(1 / 60); expect(Number.isFinite(a.viewsPerHour)).toBe(true); expect(a.rising).toBe(true)
  })
})
describe('publishedAfterIso', () => {
  it('formats RFC3339 without milliseconds', () => {
    expect(publishedAfterIso(now, 48)).toBe('2026-10-19T12:00:00Z')
  })
})
