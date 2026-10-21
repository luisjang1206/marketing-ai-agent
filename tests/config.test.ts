import { describe, it, expect } from 'vitest'
import { parseConfig, profilesOf, allowedChannelIds, testChannelIds } from '@/lib/config'

const yaml = `
profiles: [유튜브1, 유튜브2]
channels:
  - UCxlc0Ky0aWoD8uI09ad44Tg
  - { id: UCkGl2jieOVhGiHPdXF77Yyw, test: true }
comment: { min_chars: 40, max_chars: 120, brand: 운명원, brand_phrases: [잘 본다던데] }
limits: { daily_max_comments: 10 }
`
describe('parseConfig', () => {
  it('normalizes channels to {id,test}', () => {
    const cfg = parseConfig(yaml)
    expect(cfg.channels).toEqual([
      { id: 'UCxlc0Ky0aWoD8uI09ad44Tg', test: false },
      { id: 'UCkGl2jieOVhGiHPdXF77Yyw', test: true },
    ])
  })
  it('applies defaults for fetch/typing/banned_phrases', () => {
    const cfg = parseConfig(yaml)
    expect(cfg.fetch.per_channel).toBe(5)
    expect(cfg.typing).toEqual({ min_delay_ms: 40, max_delay_ms: 110 })
    expect(cfg.comment.banned_phrases).toEqual([])
  })
  it('defaults rising rules when the block is absent', () => {
    expect(parseConfig(yaml).rising).toEqual({ keyword: '연애', min_views: 1000, max_views: 5000, min_views_per_hour: 150, published_within_hours: 48, pages: 2 })
  })
  it('derives profiles with ids p1..pn', () => {
    expect(profilesOf(parseConfig(yaml))).toEqual([
      { id: 'p1', label: '유튜브1', index: 1 }, { id: 'p2', label: '유튜브2', index: 2 },
    ])
  })
  it('splits allowed and test channel ids', () => {
    const cfg = parseConfig(yaml)
    expect(allowedChannelIds(cfg)).toEqual(['UCxlc0Ky0aWoD8uI09ad44Tg', 'UCkGl2jieOVhGiHPdXF77Yyw'])
    expect(testChannelIds(cfg)).toEqual(['UCkGl2jieOVhGiHPdXF77Yyw'])
  })
  it('rejects a bad channel id', () => {
    expect(() => parseConfig(yaml.replace('UCxlc0Ky0aWoD8uI09ad44Tg', 'nope'))).toThrow()
  })
})
