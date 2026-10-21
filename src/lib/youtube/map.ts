import type { VideoRow } from '../repo/videos'
import type { VideoMeta } from './api'

// Data API 응답(camelCase)을 videos 테이블 행(snake_case)으로. fetched_at 은 DB 가 채운다.
export function toRow(meta: VideoMeta, source: VideoRow['source']): Omit<VideoRow, 'fetched_at'> {
  return { id: meta.id, channel_id: meta.channelId, channel_title: meta.channelTitle, title: meta.title, description: meta.description,
    thumbnail_url: meta.thumbnailUrl, published_at: meta.publishedAt, view_count: meta.viewCount, source }
}
