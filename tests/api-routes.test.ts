import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '@/lib/db'
import { parseConfig, profilesOf } from '@/lib/config'
import { profileDir, captionDir } from '@/lib/paths'
import { upsertVideos, getVideo } from '@/lib/repo/videos'
import { insertDraft, latestDraft } from '@/lib/repo/drafts'
import { saveCaptions, getCaptions } from '@/lib/repo/captions'
import { insertPost, listPosts } from '@/lib/repo/posts'
import { createJob, getJob } from '@/lib/repo/jobs'
import { upsertProfile, getProfile } from '@/lib/repo/profiles'
import type { VideoMeta, YoutubeApi } from '@/lib/youtube/api'
import type { DraftLLM } from '@/lib/draft/generate'
import { generateDraft } from '@/lib/draft/generate'
import { fetchCaptions } from '@/lib/youtube/captions'
import { openForLogin, checkLogin } from '@/lib/browser/profiles'
import { postComment } from '@/lib/browser/poster'
import type { services } from '@/lib/services'
import type { ConfigResponse, VideosResponse, VideoResponse, DraftResponse, JobResponse, LogResponse, ProfilesResponse, ProfileResponse } from '@/lib/api-types'
import { GET as getConfig } from '@/app/api/config/route'
import { GET as getVideos, POST as postVideos } from '@/app/api/videos/route'
import { POST as postDraft } from '@/app/api/videos/[id]/draft/route'
import { POST as postPosts } from '@/app/api/posts/route'
import { GET as getJobRoute } from '@/app/api/posts/[jobId]/route'
import { GET as getLog } from '@/app/api/log/route'
import { GET as getProfiles } from '@/app/api/profiles/route'
import { POST as loginProfile } from '@/app/api/profiles/[id]/login/route'
import { POST as checkProfile } from '@/app/api/profiles/[id]/check/route'

// services() 는 실키가 필요한 싱글턴이라 통째로 바꾼다. 브라우저·자막·포스터 모듈도 막아 크롬이 뜨거나 네트워크를 타지 않게 한다.
const env = vi.hoisted(() => ({ svc: undefined as unknown }))
vi.mock('@/lib/services', () => ({ services: () => env.svc }))
vi.mock('@/lib/youtube/captions', () => ({ fetchCaptions: vi.fn() }))
vi.mock('@/lib/browser/profiles', () => ({ openForLogin: vi.fn(), checkLogin: vi.fn() }))
vi.mock('@/lib/browser/poster', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/browser/poster')>()),
  postComment: vi.fn(),
}))
// generateDraft 는 진짜를 그대로 쓰되 넘어온 컨텍스트를 들여다볼 수 있게 감싼다.
vi.mock('@/lib/draft/generate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/draft/generate')>()
  return { ...actual, generateDraft: vi.fn(actual.generateDraft) }
})

const X = 'UCxlc0Ky0aWoD8uI09ad44Tg'      // 허용 채널
const T = 'UC09L3JxGVcn7SKLa-pjTEmw'      // 허용 채널 (테스트 채널)
const OUT = 'UCVdtDW-HF4KluixGaBAcI4w'    // 허용 밖 채널
const cfg = parseConfig(`
profiles: [유튜브1, 유튜브2, 유튜브3]
channels:
  - ${X}
  - { id: ${T}, test: true }
comment: { min_chars: 40, max_chars: 120, brand: 운명원, banned_phrases: [결제], brand_phrases: [운명원 연애사주가 그렇게 잘 본다던데] }
limits: { daily_max_comments: 2 }
fetch: { per_channel: 3 }
`)

const meta = (id: string, channelId = X): VideoMeta => ({ id, channelId, channelTitle: '채널', title: `제목 ${id}`, description: '설명',
  thumbnailUrl: 'https://i.ytimg.com/x.jpg', publishedAt: '2026-10-19T00:00:00Z', viewCount: 10 })
const row = (id: string, channel_id = X, over: Partial<Parameters<typeof upsertVideos>[1][number]> = {}) => ({ id, channel_id, channel_title: 'ch', title: `제목 ${id}`,
  description: '', thumbnail_url: '', published_at: '2026-10-19T00:00:00Z', view_count: 1, source: 'list' as const, ...over })
// 40~120자, 운명원 1회, 링크·해시태그 없음 — validateDraft 를 통과한다.
const good = (tag: string) => `${tag} 장면이 내 얘기 같아서 한참 멈칫했어요. 요즘 운명원 연애사주가 그렇게 잘 본다던데 나도 궁금하네요.`
const seedDraft = (db: DatabaseSync, video_id: string, text: string, valid = true) =>
  insertDraft(db, { video_id, concern: 'c', evidence: 'e', text, valid, violations: valid ? [] : ['too_short'], model: 'm' })

const get = (p: string) => new Request(`http://localhost:3000${p}`)
const post = (p: string, body?: unknown) => new Request(`http://localhost:3000${p}`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) })

let db: DatabaseSync
let n: number
const yt = { listLatestVideos: vi.fn<YoutubeApi['listLatestVideos']>(), getVideo: vi.fn<YoutubeApi['getVideo']>(), getTopComments: vi.fn<YoutubeApi['getTopComments']>() }
const llm = vi.fn<DraftLLM>()
beforeEach(() => {
  db = openDb(':memory:')
  n = 0
  env.svc = { cfg, db, youtube: yt, llm, today: () => '2026-10-21', model: 'test-model' } satisfies ReturnType<typeof services>
  for (const m of Object.values(yt)) m.mockReset()
  yt.getTopComments.mockResolvedValue(['인기 댓글 하나', '인기 댓글 둘'])
  llm.mockReset()
  llm.mockImplementation(async () => ({ concern: '썸남 연락 텀', evidence: '연락 텀이 길어지면', text: good(`${++n}번째`) }))
  vi.mocked(generateDraft).mockClear()
  vi.mocked(fetchCaptions).mockReset()
  vi.mocked(fetchCaptions).mockResolvedValue({ text: '자막 내용', source: 'subtitle' })
  vi.mocked(openForLogin).mockReset()
  vi.mocked(checkLogin).mockReset()
  vi.mocked(postComment).mockReset()
  vi.mocked(postComment).mockResolvedValue({ ok: true, screenshotPath: '/s.png' })
})

describe('GET /api/config', () => {
  it('returns the public config', async () => {
    const body = (await (await getConfig()).json()) as ConfigResponse
    expect(body).toEqual({ profiles: profilesOf(cfg), dailyMax: 2, allowedChannelIds: [X, T], testChannelIds: [T], comment: { min: 40, max: 120, brand: '운명원' } })
  })
})

describe('GET /api/videos', () => {
  it('lists stored videos newest first with caption source, draft flag and test-channel flag', async () => {
    upsertVideos(db, [row('v1', X, { published_at: '2026-10-19T00:00:00Z' }), row('v2', T, { published_at: '2026-10-18T00:00:00Z' })])
    saveCaptions(db, 'v1', '자막', 'subtitle')
    seedDraft(db, 'v1', good('a'))
    const { videos } = (await (await getVideos(get('/api/videos'))).json()) as VideosResponse
    expect(videos.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(videos[0]).toMatchObject({ captionSource: 'subtitle', hasDraft: true, isTestChannel: false, title: '제목 v1' })
    expect(videos[1]).toMatchObject({ captionSource: null, hasDraft: false, isTestChannel: true })
    expect(yt.listLatestVideos).not.toHaveBeenCalled()
  })
  it('refresh=1 fetches the allowed channels first and stores the result as list', async () => {
    yt.listLatestVideos.mockResolvedValue([meta('l1', X), meta('l2', T)])
    const { videos } = (await (await getVideos(get('/api/videos?refresh=1'))).json()) as VideosResponse
    expect(yt.listLatestVideos).toHaveBeenCalledWith([X, T], 3)   // allowedChannelIds(cfg), fetch.per_channel
    expect(videos.map((v) => v.id).sort()).toEqual(['l1', 'l2'])
    expect(getVideo(db, 'l1')).toMatchObject({ source: 'list', channel_id: X, title: '제목 l1' })
  })
  it('returns an upstream_error JSON when the Data API fails', async () => {
    yt.listLatestVideos.mockRejectedValue(new Error('quotaExceeded'))
    const res = await getVideos(get('/api/videos?refresh=1'))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ reason: 'upstream_error' })
  })
})

describe('POST /api/videos (Direct Link)', () => {
  const ID = 'aaaaaaaaaaa'
  it.each([[{}], [{ url: 123 }], [{ url: 'https://example.com/watch?v=aaaaaaaaaaa' }], ['not json']])('400 invalid_url for %j', async (body) => {
    const res = await postVideos(post('/api/videos', body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ reason: 'invalid_url', message: '유튜브 영상 링크가 아닙니다' })
    expect(yt.getVideo).not.toHaveBeenCalled()
  })
  it('404 not_found when the Data API does not know the video', async () => {
    yt.getVideo.mockResolvedValue(null)
    const res = await postVideos(post('/api/videos', { url: `https://youtu.be/${ID}` }))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ reason: 'not_found' })
    expect(getVideo(db, ID)).toBeUndefined()
  })
  it('409 not_allowed_channel records a blocked row and keeps the video so the log shows its title', async () => {
    yt.getVideo.mockResolvedValue(meta(ID, OUT))
    const res = await postVideos(post('/api/videos', { url: `https://youtu.be/${ID}` }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ reason: 'not_allowed_channel', message: '허용 채널의 영상이 아닙니다' })
    expect(listPosts(db)).toMatchObject([{ video_id: ID, profile_id: '-', status: 'blocked', reason: 'not_allowed_channel', text: null, video_title: `제목 ${ID}` }])
  })
  it('200 stores an allowed-channel video as direct and writes no post row', async () => {
    yt.getVideo.mockResolvedValue(meta(ID, T))
    const res = await postVideos(post('/api/videos', { url: ` https://www.youtube.com/watch?v=${ID}&t=10s ` }))
    expect(res.status).toBe(200)
    const { video } = (await res.json()) as VideoResponse
    expect(video).toMatchObject({ id: ID, channel_id: T, source: 'direct' })
    expect(getVideo(db, ID)).toEqual(video)
    expect(listPosts(db)).toEqual([])
  })
})

describe('POST /api/videos/[id]/draft', () => {
  beforeEach(() => { upsertVideos(db, [row('A', X), row('B', X), row('D', X), row('C', T)]) })
  const draftReq = (id: string, body?: unknown) => postDraft(post(`/api/videos/${id}/draft`, body), ctx({ id }))
  const draftCtx = (call = 0) => vi.mocked(generateDraft).mock.calls[call][0]

  it('404 for a video that is not stored', async () => {
    const res = await draftReq('nope', {})
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ reason: 'not_found' })
    expect(llm).not.toHaveBeenCalled()
  })
  it('builds the first draft from captions and top comments and stores it', async () => {
    const res = await draftReq('A', {})
    expect(res.status).toBe(200)
    const { draft, captionSource } = (await res.json()) as DraftResponse
    expect(captionSource).toBe('subtitle')
    expect(draft).toMatchObject({ video_id: 'A', valid: true, violations: [], model: 'test-model', concern: '썸남 연락 텀', text: good('1번째') })
    expect(latestDraft(db, 'A')).toEqual(draft)
    expect(getCaptions(db, 'A')).toEqual({ text: '자막 내용', source: 'subtitle' })
    expect(fetchCaptions).toHaveBeenCalledWith('A', { outDir: captionDir() })
    expect(yt.getTopComments).toHaveBeenCalledWith('A')
    expect(draftCtx()).toMatchObject({ video: { title: '제목 A', description: '', channelTitle: 'ch' }, captions: '자막 내용', topComments: ['인기 댓글 하나', '인기 댓글 둘'] })
  })
  it('gives the model null captions and reports captionSource none when there is no subtitle', async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({ text: '', source: 'none' })
    const { captionSource } = (await (await draftReq('A', {})).json()) as DraftResponse
    expect(captionSource).toBe('none')
    expect(draftCtx().captions).toBeNull()
    expect(getCaptions(db, 'A')).toEqual({ text: '', source: 'none' })
  })
  it('returns the cached valid draft without touching captions, comments or the model', async () => {
    const first = (await (await draftReq('A', {})).json()) as DraftResponse
    vi.mocked(fetchCaptions).mockClear()
    const again = (await (await draftReq('A', {})).json()) as DraftResponse
    expect(again).toEqual(first)
    expect(llm).toHaveBeenCalledTimes(1)
    expect(fetchCaptions).not.toHaveBeenCalled()
    expect(yt.getTopComments).toHaveBeenCalledTimes(1)
  })
  it('regenerates on request: a new latest draft, and the model sees the previous one', async () => {
    const first = (await (await draftReq('A', {})).json()) as DraftResponse
    const second = (await (await draftReq('A', { regenerate: true })).json()) as DraftResponse
    expect(llm).toHaveBeenCalledTimes(2)
    expect(second.draft.id).toBeGreaterThan(first.draft.id)
    expect(second.draft.text).toBe(good('2번째'))
    expect(latestDraft(db, 'A')).toEqual(second.draft)
    expect(llm.mock.calls[1][1]).toContain(first.draft.text)
  })
  it('regenerates when the cached draft failed validation, even without regenerate', async () => {
    seedDraft(db, 'A', '짧음', false)
    const { draft } = (await (await draftReq('A', {})).json()) as DraftResponse
    expect(llm).toHaveBeenCalledTimes(1)
    expect(draft).toMatchObject({ valid: true, text: good('1번째') })
  })
  it('stores a draft that still fails validation, with its violations', async () => {
    llm.mockReset()
    llm.mockResolvedValue({ concern: 'c', evidence: 'e', text: '짧음' })
    const res = await draftReq('A', {})
    expect(res.status).toBe(200)
    const { draft } = (await res.json()) as DraftResponse
    expect(draft.valid).toBe(false)
    expect(draft.violations).toEqual(expect.arrayContaining(['too_short', 'missing_brand']))
    expect(latestDraft(db, 'A')).toEqual(draft)
  })
  it('recentDrafts: the same video latest draft first, then the channel drafts without it; other channels are left out', async () => {
    seedDraft(db, 'A', '텍스트A1'); seedDraft(db, 'A', '텍스트A2'); seedDraft(db, 'B', '텍스트B1'); seedDraft(db, 'C', '텍스트C1')
    await draftReq('A', { regenerate: true })
    expect(draftCtx().recentDrafts).toEqual(['텍스트A2', '텍스트B1', '텍스트A1'])
    expect(llm.mock.calls[0][1]).toContain('텍스트A2')   // 프롬프트까지 실제로 전달됨
    expect(llm.mock.calls[0][1]).not.toContain('텍스트C1')
  })
  it('recentDrafts of a video with no draft yet are the channel drafts, newest first', async () => {
    seedDraft(db, 'A', '텍스트A1'); seedDraft(db, 'A', '텍스트A2'); seedDraft(db, 'B', '텍스트B1'); seedDraft(db, 'C', '텍스트C1')
    await draftReq('D', {})
    expect(draftCtx().recentDrafts).toEqual(['텍스트B1', '텍스트A2', '텍스트A1'])
  })
  it('502 upstream_error when the model call fails, and no draft is stored', async () => {
    llm.mockReset()
    llm.mockRejectedValue(new Error('overloaded'))
    const res = await draftReq('A', {})
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ reason: 'upstream_error' })
    expect(latestDraft(db, 'A')).toBeUndefined()
  })
})

describe('POST /api/posts', () => {
  const postsReq = (body: unknown) => postPosts(post('/api/posts', body))
  beforeEach(() => {
    upsertVideos(db, [row('v1', X)])
    seedDraft(db, 'v1', good('a'))
    upsertProfile(db, { id: 'p1', label: '유튜브1', logged_in: true, channel_name: '@one' })
    upsertProfile(db, { id: 'p2', label: '유튜브2', logged_in: true, channel_name: '@two' })
  })

  it.each([[{}], [{ videoId: 5 }], ['not json']])('400 invalid_request for %j', async (body) => {
    const res = await postsReq(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ reason: 'invalid_request' })
    expect(postComment).not.toHaveBeenCalled()
  })
  it('400 invalid_profile for a profile that is not in config.yaml', async () => {
    const res = await postsReq({ videoId: 'v1', profileId: 'p9' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ reason: 'invalid_profile' })
    expect(postComment).not.toHaveBeenCalled()
  })
  it('400 video_not_found for an unknown video', async () => {
    const res = await postsReq({ videoId: 'nope' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ reason: 'video_not_found' })
  })
  it('202 {jobId} and runs the job on the chosen profile', async () => {
    const res = await postsReq({ videoId: 'v1', profileId: 'p2' })
    expect(res.status).toBe(202)
    const { jobId } = (await res.json()) as { jobId: string }
    await vi.waitFor(() => expect(getJob(db, jobId)?.state).toBe('verified'))
    expect(postComment).toHaveBeenCalledWith(expect.objectContaining({ userDataDir: profileDir(2), videoId: 'v1', text: good('a'), expectedAuthor: '@two', typingDelayMs: [40, 110] }))
    expect(listPosts(db)[0]).toMatchObject({ status: 'success', video_id: 'v1', profile_id: 'p2' })
  })
  it('assigns the next logged-in profile when profileId is omitted', async () => {
    const { jobId } = (await (await postsReq({ videoId: 'v1' })).json()) as { jobId: string }
    await vi.waitFor(() => expect(getJob(db, jobId)?.state).toBe('verified'))
    expect(postComment).toHaveBeenCalledWith(expect.objectContaining({ userDataDir: profileDir(1) }))
  })
  it('409 already_posted with the rule message, and a blocked row', async () => {
    insertPost(db, { video_id: 'v1', profile_id: 'p1', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null })
    const res = await postsReq({ videoId: 'v1' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ reason: 'already_posted', message: '이 영상에는 이미 댓글을 달았습니다' })
    expect(listPosts(db)[0]).toMatchObject({ status: 'blocked', reason: 'already_posted' })
    expect(postComment).not.toHaveBeenCalled()
  })
  it('409 daily_cap_reached counts successes on the injected local date', async () => {
    upsertVideos(db, [row('v2'), row('v3')])
    for (const v of ['v2', 'v3']) insertPost(db, { video_id: v, profile_id: 'p1', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null, created_at: '2026-10-21 09:00:00' })
    const res = await postsReq({ videoId: 'v1' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: 'daily_cap_reached' })
  })
  it('409 busy while another job is running', async () => {
    vi.mocked(postComment).mockReturnValue(new Promise(() => {}))
    expect((await postsReq({ videoId: 'v1' })).status).toBe(202)
    upsertVideos(db, [row('v2')]); seedDraft(db, 'v2', good('b'))
    const res = await postsReq({ videoId: 'v2' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: 'busy' })
  })
})

describe('GET /api/posts/[jobId]', () => {
  it('returns the job', async () => {
    upsertVideos(db, [row('v1')])
    createJob(db, { id: 'j1', video_id: 'v1', profile_id: 'p1', draft_id: 1 })
    const res = await getJobRoute(get('/api/posts/j1'), ctx({ jobId: 'j1' }))
    expect(res.status).toBe(200)
    expect(((await res.json()) as JobResponse).job).toMatchObject({ id: 'j1', state: 'queued' })
  })
  it('404 for an unknown job', async () => {
    const res = await getJobRoute(get('/api/posts/zz'), ctx({ jobId: 'zz' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ reason: 'job_not_found' })
  })
})

describe('GET /api/log', () => {
  it('returns the Post Log newest first, today count, posted videos and the active job', async () => {
    upsertVideos(db, [row('v1'), row('v2'), row('v3')])
    const p = { profile_id: 'p1', draft_id: null, text: 'x', reason: null, screenshot_path: null }
    insertPost(db, { ...p, video_id: 'v1', status: 'success', created_at: '2026-10-20 23:00:00' })   // 어제
    insertPost(db, { ...p, video_id: 'v2', status: 'success', created_at: '2026-10-21 10:00:00' })   // 오늘
    insertPost(db, { ...p, video_id: 'v3', status: 'blocked', reason: 'daily_cap_reached', created_at: '2026-10-21 11:00:00' })
    createJob(db, { id: 'j1', video_id: 'v3', profile_id: 'p1', draft_id: 1 })
    const body = (await (await getLog()).json()) as LogResponse
    expect(Object.keys(body).sort()).toEqual(['activeJobId', 'postedVideoIds', 'posts', 'todayCount'])
    expect(body.posts.map((r) => r.video_id)).toEqual(['v3', 'v2', 'v1'])
    expect(body.posts[0]).toMatchObject({ status: 'blocked', reason: 'daily_cap_reached', video_title: '제목 v3' })
    expect(body.todayCount).toBe(1)
    expect(body.postedVideoIds.sort()).toEqual(['v1', 'v2'])
    expect(body.activeJobId).toBe('j1')
  })
  it('is empty and has no active job on a fresh database', async () => {
    expect(await (await getLog()).json()).toEqual({ posts: [], todayCount: 0, postedVideoIds: [], activeJobId: null })
  })
})

describe('GET /api/profiles', () => {
  it('merges config profiles with stored login state; unknown rows are logged out', async () => {
    upsertProfile(db, { id: 'p2', label: 'old label', logged_in: true, channel_name: '@handle' })
    const { profiles } = (await (await getProfiles()).json()) as ProfilesResponse
    expect(profiles).toEqual([
      { id: 'p1', label: '유튜브1', index: 1, loggedIn: false, channelName: null },
      { id: 'p2', label: '유튜브2', index: 2, loggedIn: true, channelName: '@handle' },
      { id: 'p3', label: '유튜브3', index: 3, loggedIn: false, channelName: null },
    ])
  })
})

describe('POST /api/profiles/[id]/login', () => {
  const loginReq = (id: string) => loginProfile(post(`/api/profiles/${id}/login`), ctx({ id }))
  it('202 right away and opens the profile directory for the human to log in', async () => {
    vi.mocked(openForLogin).mockReturnValue(new Promise(() => {}))   // 사람이 창을 닫을 때까지 끝나지 않는다
    const res = await loginReq('p2')
    expect(res.status).toBe(202)
    expect(openForLogin).toHaveBeenCalledWith(profileDir(2))
  })
  it('404 for a profile that is not in config.yaml', async () => {
    const res = await loginReq('p9')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ reason: 'profile_not_found' })
    expect(openForLogin).not.toHaveBeenCalled()
  })
  it('logs a failed launch instead of leaving an unhandled rejection', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(openForLogin).mockRejectedValue(new Error('profile locked'))
    expect((await loginReq('p1')).status).toBe(202)
    await vi.waitFor(() => expect(err).toHaveBeenCalled())
    err.mockRestore()
  })
})

describe('POST /api/profiles/[id]/check', () => {
  const checkReq = (id: string) => checkProfile(post(`/api/profiles/${id}/check`), ctx({ id }))
  it('stores the @handle from checkLogin as channel_name and returns the merged profile', async () => {
    vi.mocked(checkLogin).mockResolvedValue({ loggedIn: true, channelName: '@운명원팬' })
    const res = await checkReq('p1')
    expect(res.status).toBe(200)
    expect(checkLogin).toHaveBeenCalledWith(profileDir(1))
    expect(((await res.json()) as ProfileResponse).profile).toEqual({ id: 'p1', label: '유튜브1', index: 1, loggedIn: true, channelName: '@운명원팬' })
    expect(getProfile(db, 'p1')).toMatchObject({ label: '유튜브1', logged_in: true, channel_name: '@운명원팬' })
  })
  it('records a logged-out profile', async () => {
    upsertProfile(db, { id: 'p3', label: '유튜브3', logged_in: true, channel_name: '@old' })
    vi.mocked(checkLogin).mockResolvedValue({ loggedIn: false, channelName: null })
    const { profile } = (await (await checkReq('p3')).json()) as ProfileResponse
    expect(profile).toMatchObject({ id: 'p3', loggedIn: false, channelName: null })
    expect(getProfile(db, 'p3')).toMatchObject({ logged_in: false, channel_name: null })
  })
  it('404 for a profile that is not in config.yaml', async () => {
    const res = await checkReq('p9')
    expect(res.status).toBe(404)
    expect(checkLogin).not.toHaveBeenCalled()
  })
  it('500 check_failed JSON when Chrome cannot be opened', async () => {
    vi.mocked(checkLogin).mockRejectedValue(new Error('profile locked'))
    const res = await checkReq('p1')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ reason: 'check_failed' })
    expect(getProfile(db, 'p1')).toBeUndefined()
  })
})
