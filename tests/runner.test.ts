import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { openDb } from '@/lib/db'
import { parseConfig } from '@/lib/config'
import { upsertVideos } from '@/lib/repo/videos'
import { insertDraft, latestDraft } from '@/lib/repo/drafts'
import { upsertProfile } from '@/lib/repo/profiles'
import { listPosts, insertPost } from '@/lib/repo/posts'
import { getJob, createJob } from '@/lib/repo/jobs'
import { profileDir, screenshotDir } from '@/lib/paths'
import { startPostJob, runPostJob } from '@/lib/jobs/runner'

const cfg = parseConfig(`
profiles: [유튜브1, 유튜브2]
channels: [UCxlc0Ky0aWoD8uI09ad44Tg]
comment: { min_chars: 40, max_chars: 120, brand: 운명원, brand_phrases: [x] }
limits: { daily_max_comments: 2 }
`)
const video = { id: 'v1', channel_id: 'UCxlc0Ky0aWoD8uI09ad44Tg', channel_title: 'c', title: 't', description: '', thumbnail_url: '', published_at: '2026-10-19', view_count: 0, source: 'list' as const }
let deps: Parameters<typeof startPostJob>[1]
type Post = Parameters<typeof startPostJob>[1]['post']   // vitest 5 vi.fn does not infer from the assignment target
beforeEach(() => {
  const db = openDb(':memory:')
  upsertVideos(db, [video, { ...video, id: 'v2', channel_id: 'UCzzzzzzzzzzzzzzzzzzzzzz' }])
  insertDraft(db, { video_id: 'v1', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
  upsertProfile(db, { id: 'p1', label: '유튜브1', logged_in: true, channel_name: 'A' })
  upsertProfile(db, { id: 'p2', label: '유튜브2', logged_in: true, channel_name: 'B' })
  deps = { db, cfg, today: () => '2026-10-20', post: vi.fn<Post>(async ({ onProgress }) => { onProgress('opening_profile'); onProgress('typing'); onProgress('posted'); onProgress('verified'); return { ok: true, screenshotPath: '/s.png' } }) }
})
const flush = () => new Promise((r) => setTimeout(r, 10))

describe('startPostJob', () => {
  it('runs a job to verified and records a success', async () => {
    const r = await startPostJob({ videoId: 'v1' }, deps)
    expect(r.ok).toBe(true); await flush()
    const job = getJob(deps!.db, (r as { jobId: string }).jobId)!
    expect(job.state).toBe('verified'); expect(job.profile_id).toBe('p1')
    // 성공 행은 'verified' 시점에 러너가 post에 넘긴 캡처 경로로 기록한다(post 반환값을 기다리지 않음).
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'success', video_id: 'v1', screenshot_path: path.join(screenshotDir(), job.id + '.png') })
  })
  it('records blocked when the channel is not allowed', async () => {
    insertDraft(deps!.db, { video_id: 'v2', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
    const r = await startPostJob({ videoId: 'v2' }, deps)
    expect(r).toMatchObject({ ok: false, status: 409, reason: 'not_allowed_channel' })
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'blocked', reason: 'not_allowed_channel' })
  })
  it('refuses a second concurrent job with busy', async () => {
    deps!.post = vi.fn<Post>(() => new Promise(() => {}))   // never resolves
    await startPostJob({ videoId: 'v1' }, deps)
    const r = await startPostJob({ videoId: 'v1', profileId: 'p2' }, deps)
    expect(r).toMatchObject({ ok: false, reason: 'busy' })
  })
  it('records failure with reason and does not count toward the cap', async () => {
    deps!.post = vi.fn<Post>(async () => ({ ok: false, reason: 'not_logged_in', message: '로그인 안 됨', screenshotPath: '/f.png' }))
    const r = await startPostJob({ videoId: 'v1' }, deps); await flush()
    expect(getJob(deps!.db, (r as { jobId: string }).jobId)!.state).toBe('failed')
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'failed', reason: 'not_logged_in' })
    const again = await startPostJob({ videoId: 'v1' }, deps)   // 실패 후 재시도는 허용
    expect(again.ok).toBe(true)
  })
  it('blocks a video that already has a success, and rotates to the next profile for another video', async () => {
    insertPost(deps!.db, { video_id: 'v1', profile_id: 'p1', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null, created_at: '2026-10-19 10:00:00' })
    expect(await startPostJob({ videoId: 'v1' }, deps)).toMatchObject({ ok: false, reason: 'already_posted' })
    upsertVideos(deps!.db, [{ ...video, id: 'v3' }])
    insertDraft(deps!.db, { video_id: 'v3', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
    const r = await startPostJob({ videoId: 'v3' }, deps)
    expect(r.ok).toBe(true); await flush()
    expect(getJob(deps!.db, (r as { jobId: string }).jobId)!.profile_id).toBe('p2')   // 자동 배정: p1 다음
  })
  it('refuses when no profile is logged in', async () => {
    upsertProfile(deps!.db, { id: 'p1', label: '유튜브1', logged_in: false, channel_name: null })
    upsertProfile(deps!.db, { id: 'p2', label: '유튜브2', logged_in: false, channel_name: null })
    expect(await startPostJob({ videoId: 'v1' }, deps)).toMatchObject({ ok: false, reason: 'no_profile' })
  })
})

describe('runPostJob', () => {
  it('passes the profile directory, channel name, typing delays and screenshot path to post', async () => {
    const r = await startPostJob({ videoId: 'v1', profileId: 'p2' }, deps); await flush()
    const jobId = (r as { jobId: string }).jobId
    expect(deps!.post).toHaveBeenCalledWith(expect.objectContaining({
      userDataDir: profileDir(2), videoId: 'v1', text: 'x'.repeat(50), expectedAuthor: 'B',
      typingDelayMs: [cfg.typing.min_delay_ms, cfg.typing.max_delay_ms], screenshotPath: path.join(screenshotDir(), jobId + '.png'),
    }))
    expect(getJob(deps!.db, jobId)).toMatchObject({ state: 'verified', message: '댓글 보기', screenshot_path: path.join(screenshotDir(), jobId + '.png') })
  })
  it('records failed/unknown instead of throwing when post throws', async () => {
    deps!.post = vi.fn<Post>(async () => { throw new Error('boom') })
    createJob(deps!.db, { id: 'j1', video_id: 'v1', profile_id: 'p1', draft_id: latestDraft(deps!.db, 'v1')!.id })
    await expect(runPostJob('j1', deps)).resolves.toBeUndefined()
    expect(getJob(deps!.db, 'j1')).toMatchObject({ state: 'failed' })
    expect(listPosts(deps!.db)[0]).toMatchObject({ status: 'failed', reason: 'unknown', video_id: 'v1' })
  })
  it('records the success as soon as the comment is verified, and keeps the job active until post closes the window', async () => {
    let release!: (r: Awaited<ReturnType<Post>>) => void
    deps!.post = vi.fn<Post>(({ onProgress }) => { onProgress('opening_profile'); onProgress('typing'); onProgress('posted'); onProgress('verified'); return new Promise((res) => { release = res }) })
    const r = await startPostJob({ videoId: 'v1' }, deps); await flush()
    const jobId = (r as { jobId: string }).jobId
    const shot = path.join(screenshotDir(), jobId + '.png')
    const [row] = listPosts(deps!.db)
    expect(row).toMatchObject({ status: 'success', video_id: 'v1', profile_id: 'p1', screenshot_path: shot })
    expect(getJob(deps!.db, jobId)).toMatchObject({ state: 'posted', post_id: null })   // 창이 닫힐 때까지 진행 중
    // 창이 열려 있는 동안: 같은 영상은 영상당 1개로 차단, 다른 영상은 진행 중 작업으로 busy
    expect(await startPostJob({ videoId: 'v1', profileId: 'p2' }, deps)).toMatchObject({ ok: false, status: 409, reason: 'already_posted' })
    upsertVideos(deps!.db, [{ ...video, id: 'v3' }])
    insertDraft(deps!.db, { video_id: 'v3', concern: 'c', evidence: 'e', text: 'x'.repeat(50), valid: true, violations: [], model: 'm' })
    expect(await startPostJob({ videoId: 'v3' }, deps)).toMatchObject({ ok: false, status: 409, reason: 'busy' })
    release({ ok: true, screenshotPath: shot }); await flush()
    expect(getJob(deps!.db, jobId)).toMatchObject({ state: 'verified', message: '댓글 보기', screenshot_path: shot, post_id: row.id })
    expect(listPosts(deps!.db).filter((p) => p.status === 'success')).toHaveLength(1)
  })
  it('keeps a verified success when post later returns a failure', async () => {
    deps!.post = vi.fn<Post>(async ({ onProgress }) => { onProgress('verified'); return { ok: false, reason: 'unknown', message: '알 수 없음', screenshotPath: '/f.png' } })
    const r = await startPostJob({ videoId: 'v1' }, deps); await flush()
    expect(listPosts(deps!.db).map((p) => p.status)).toEqual(['success'])
    expect(getJob(deps!.db, (r as { jobId: string }).jobId)).toMatchObject({ state: 'verified', post_id: listPosts(deps!.db)[0].id })
  })
  it('keeps a verified success when post later throws', async () => {
    deps!.post = vi.fn<Post>(async ({ onProgress }) => { onProgress('verified'); throw new Error('window closed') })
    const r = await startPostJob({ videoId: 'v1' }, deps); await flush()
    expect(listPosts(deps!.db).map((p) => p.status)).toEqual(['success'])
    expect(getJob(deps!.db, (r as { jobId: string }).jobId)).toMatchObject({ state: 'verified', post_id: listPosts(deps!.db)[0].id })
  })
})
