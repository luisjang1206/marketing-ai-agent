export type VideoMeta = { id: string; channelId: string; channelTitle: string; title: string; description: string;
  thumbnailUrl: string; publishedAt: string; viewCount: number }
export type YoutubeApi = {
  listLatestVideos(channelIds: string[], perChannel: number): Promise<VideoMeta[]>
  getVideo(id: string): Promise<VideoMeta | null>
  getTopComments(id: string, max?: number): Promise<string[]>
  searchRecentVideos(q: string, publishedAfter: string, pages: number): Promise<VideoMeta[]>
}

export class YoutubeApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'YoutubeApiError'
  }
}

// Only the response fields we read; the Data API returns far more.
type ApiErrorBody = { error?: { message?: string; errors?: { reason?: string }[] } }
type VideoItem = {
  id: string
  snippet: {
    channelId: string; channelTitle: string; title: string; description?: string; publishedAt: string
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } }
  }
  statistics?: { viewCount?: string }
}
type PlaylistItem = { contentDetails: { videoId: string } }
type SearchItem = { id: { videoId?: string } }
type CommentThread = { snippet: { topLevelComment: { snippet: { textDisplay: string } } } }

const BASE = 'https://www.googleapis.com/youtube/v3'

export function createYoutubeApi(apiKey: string, fetchImpl: typeof fetch = fetch): YoutubeApi {
  async function call<T>(resource: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${BASE}/${resource}`)
    for (const [k, v] of Object.entries({ ...params, key: apiKey })) u.searchParams.set(k, v)
    const res = await fetchImpl(u)
    const body: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = (body as ApiErrorBody | null)?.error
      throw new YoutubeApiError(res.status, err?.errors?.[0]?.reason ?? err?.message ?? `YouTube API ${res.status}`)
    }
    return body as T
  }
  const toMeta = (it: VideoItem): VideoMeta => ({ id: it.id, channelId: it.snippet.channelId, channelTitle: it.snippet.channelTitle,
    title: it.snippet.title, description: it.snippet.description ?? '', thumbnailUrl: it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url ?? '',
    publishedAt: it.snippet.publishedAt, viewCount: Number(it.statistics?.viewCount ?? 0) })
  async function videosByIds(ids: string[]): Promise<VideoMeta[]> {
    const out: VideoMeta[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const body = await call<{ items: VideoItem[] }>('videos', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(',') })
      out.push(...body.items.map(toMeta))
    }
    return out
  }
  return {
    async listLatestVideos(channelIds, perChannel) {
      const ids: string[] = []
      for (const ch of channelIds) {
        try {
          const body = await call<{ items: PlaylistItem[] }>('playlistItems',
            { part: 'contentDetails', playlistId: 'UU' + ch.slice(2), maxResults: String(perChannel) })
          ids.push(...body.items.map((i) => i.contentDetails.videoId))
        } catch (e) {
          // A channel with no uploads has no uploads playlist: skip it, keep the rest.
          if (e instanceof YoutubeApiError && e.status === 404) continue
          throw e
        }
      }
      return videosByIds(ids)
    },
    async getVideo(id) { return (await videosByIds([id]))[0] ?? null },
    async searchRecentVideos(q, publishedAfter, pages) {
      const ids: string[] = []
      let pageToken: string | undefined
      for (let p = 0; p < pages; p++) {
        const body = await call<{ items: SearchItem[]; nextPageToken?: string }>('search', {
          part: 'snippet', type: 'video', order: 'date', maxResults: '50', regionCode: 'KR', relevanceLanguage: 'ko', q, publishedAfter,
          ...(pageToken ? { pageToken } : {}) })
        for (const it of body.items) if (it.id.videoId) ids.push(it.id.videoId)
        pageToken = body.nextPageToken
        if (!pageToken) break
      }
      return videosByIds([...new Set(ids)])
    },
    async getTopComments(id, max = 10) {
      try {
        const body = await call<{ items: CommentThread[] }>('commentThreads', { part: 'snippet', videoId: id, order: 'relevance', maxResults: String(max), textFormat: 'plainText' })
        return body.items.map((i) => i.snippet.topLevelComment.snippet.textDisplay)
      } catch (e) {
        if (e instanceof YoutubeApiError && e.message === 'commentsDisabled') return []
        throw e
      }
    },
  }
}
