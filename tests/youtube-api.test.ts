import { describe, it, expect, vi } from 'vitest'
import { createYoutubeApi } from '@/lib/youtube/api'

function fakeFetch(routes: Record<string, unknown | ((u: URL) => unknown)>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input))
    const key = u.pathname.split('/').pop()!
    const r = routes[key]
    if (!r) return new Response('{}', { status: 404 })
    const body = typeof r === 'function' ? (r as (u: URL) => unknown)(u) : r
    const status = (body as { __status?: number }).__status ?? 200
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}
const snippet = (id: string, ch: string) => ({ id, snippet: { channelId: ch, channelTitle: 'ch', title: 'T' + id, description: 'd',
  publishedAt: '2026-10-19T00:00:00Z', thumbnails: { medium: { url: 'thumb/' + id } } }, statistics: { viewCount: '1234' } })

describe('createYoutubeApi', () => {
  it('lists latest videos via uploads playlist and batches videos.list', async () => {
    const fetchImpl = fakeFetch({
      playlistItems: (u: URL) => ({ items: u.searchParams.get('playlistId') === 'UUa' ? [{ contentDetails: { videoId: 'v1' } }] : [{ contentDetails: { videoId: 'v2' } }] }),
      videos: (u: URL) => ({ items: u.searchParams.get('id')!.split(',').map((id: string) => snippet(id, id === 'v1' ? 'UCa' : 'UCb')) }),
    })
    const api = createYoutubeApi('KEY', fetchImpl)
    const list = await api.listLatestVideos(['UCa', 'UCb'], 5)
    expect(list.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(list[0]).toMatchObject({ channelId: 'UCa', viewCount: 1234, thumbnailUrl: 'thumb/v1' })
    const calls = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]))
    expect(calls.filter((c) => c.includes('/videos?')).length).toBe(1)
    expect(calls.every((c) => c.includes('key=KEY'))).toBe(true)
  })
  it('skips a channel whose uploads playlist returns 404', async () => {
    const fetchImpl = fakeFetch({
      playlistItems: (u: URL) => u.searchParams.get('playlistId') === 'UUa'
        ? { __status: 404, error: { errors: [{ reason: 'playlistNotFound' }], message: 'not found' } }
        : { items: [{ contentDetails: { videoId: 'v2' } }] },
      videos: (u: URL) => ({ items: u.searchParams.get('id')!.split(',').map((id: string) => snippet(id, 'UCb')) }),
    })
    const api = createYoutubeApi('KEY', fetchImpl)
    const list = await api.listLatestVideos(['UCa', 'UCb'], 5)
    expect(list.map((v) => v.id)).toEqual(['v2'])
    expect(list.every((v) => v.channelId === 'UCb')).toBe(true)
  })
  it('still throws when playlistItems fails with a non-404 status', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({
      playlistItems: { __status: 403, error: { errors: [{ reason: 'quotaExceeded' }] } },
      videos: { items: [] },
    }))
    await expect(api.listLatestVideos(['UCa'], 5)).rejects.toMatchObject({ name: 'YoutubeApiError', status: 403 })
  })
  it('returns [] without calling videos.list when no video ids were collected', async () => {
    const fetchImpl = fakeFetch({
      playlistItems: { items: [] },
      videos: { items: [] },
    })
    const api = createYoutubeApi('KEY', fetchImpl)
    expect(await api.listLatestVideos(['UCa', 'UCb'], 5)).toEqual([])
    const calls = (fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('/videos?'))).toBe(false)
  })
  it('getVideo returns null for unknown id', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({ videos: { items: [] } }))
    expect(await api.getVideo('zzz')).toBeNull()
  })
  it('getTopComments returns [] when comments are disabled', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({ commentThreads: { __status: 403, error: { errors: [{ reason: 'commentsDisabled' }] } } }))
    expect(await api.getTopComments('v1')).toEqual([])
  })
  it('throws YoutubeApiError on other failures', async () => {
    const api = createYoutubeApi('KEY', fakeFetch({ videos: { __status: 400, error: { message: 'bad key' } } }))
    await expect(api.getVideo('v1')).rejects.toThrow('bad key')
  })
})
