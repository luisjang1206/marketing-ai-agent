import { describe, it, expect } from 'vitest'
import { toRow } from '@/lib/youtube/map'
import type { VideoMeta } from '@/lib/youtube/api'

const meta: VideoMeta = { id: 'akn-AvCeHBI', channelId: 'UCxlc0Ky0aWoD8uI09ad44Tg', channelTitle: '외롭여', title: '남자 심리', description: '설명',
  thumbnailUrl: 'https://i.ytimg.com/vi/akn-AvCeHBI/mqdefault.jpg', publishedAt: '2026-10-19T09:00:00Z', viewCount: 1234 }

describe('toRow', () => {
  it('maps VideoMeta to a snake_case VideoRow without fetched_at', () => {
    expect(toRow(meta, 'list')).toEqual({ id: 'akn-AvCeHBI', channel_id: 'UCxlc0Ky0aWoD8uI09ad44Tg', channel_title: '외롭여', title: '남자 심리',
      description: '설명', thumbnail_url: 'https://i.ytimg.com/vi/akn-AvCeHBI/mqdefault.jpg', published_at: '2026-10-19T09:00:00Z', view_count: 1234, source: 'list' })
  })
  it('carries the source through', () => {
    expect(toRow(meta, 'direct').source).toBe('direct')
  })
})
