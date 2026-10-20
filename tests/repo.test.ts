import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '@/lib/db'
import { upsertVideos, listVideos, getVideo } from '@/lib/repo/videos'
import { insertDraft, latestDraft } from '@/lib/repo/drafts'
import { insertPost, successCountToday, hasSuccessForVideo, lastSuccessProfileId, listPosts, postedVideoIds } from '@/lib/repo/posts'
import { createJob, updateJob, getJob, activeJob } from '@/lib/repo/jobs'

const video = (id: string) => ({ id, channel_id: 'UCxlc0Ky0aWoD8uI09ad44Tg', channel_title: '외롭여', title: 't' + id,
  description: '', thumbnail_url: '', published_at: '2026-10-19T00:00:00Z', view_count: 10, source: 'list' as const })

let db: DatabaseSync
beforeEach(() => { db = openDb(':memory:') })

describe('videos', () => {
  it('upserts and lists newest first', () => {
    upsertVideos(db, [video('a'), { ...video('b'), published_at: '2026-10-20T00:00:00Z' }])
    upsertVideos(db, [{ ...video('a'), title: 'renamed' }])
    expect(listVideos(db).map((v) => v.id)).toEqual(['b', 'a'])
    expect(getVideo(db, 'a')?.title).toBe('renamed')
  })
})

describe('drafts', () => {
  it('latestDraft returns the most recent row and parses violations', () => {
    upsertVideos(db, [video('a')])
    insertDraft(db, { video_id: 'a', concern: 'c1', evidence: 'e1', text: 't1', valid: false, violations: ['too_short'], model: 'm' })
    insertDraft(db, { video_id: 'a', concern: 'c2', evidence: 'e2', text: 't2', valid: true, violations: [], model: 'm' })
    const d = latestDraft(db, 'a')
    expect(d?.text).toBe('t2'); expect(d?.valid).toBe(true); expect(d?.violations).toEqual([])
  })
})

describe('posts', () => {
  beforeEach(() => upsertVideos(db, [video('a'), video('b')]))
  it('counts only successes on the given local date', () => {
    insertPost(db, { video_id: 'a', profile_id: 'p1', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null, created_at: '2026-10-20 10:00:00' })
    insertPost(db, { video_id: 'b', profile_id: 'p1', draft_id: null, text: 'x', status: 'failed', reason: 'timeout', screenshot_path: null, created_at: '2026-10-20 11:00:00' })
    insertPost(db, { video_id: 'b', profile_id: 'p2', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null, created_at: '2026-10-19 23:59:59' })
    expect(successCountToday(db, '2026-10-20')).toBe(1)
    expect(successCountToday(db, '2026-10-21')).toBe(0)   // 자정 지나면 리셋
  })
  it('hasSuccessForVideo ignores failed/blocked rows', () => {
    insertPost(db, { video_id: 'a', profile_id: 'p1', draft_id: null, text: null, status: 'blocked', reason: 'daily_cap_reached', screenshot_path: null })
    insertPost(db, { video_id: 'a', profile_id: 'p1', draft_id: null, text: 'x', status: 'failed', reason: 'timeout', screenshot_path: null })
    expect(hasSuccessForVideo(db, 'a')).toBe(false)
    insertPost(db, { video_id: 'a', profile_id: 'p2', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null })
    expect(hasSuccessForVideo(db, 'a')).toBe(true)
    expect(postedVideoIds(db)).toEqual(['a'])
    expect(lastSuccessProfileId(db)).toBe('p2')
  })
  it('listPosts joins video title, newest first', () => {
    insertPost(db, { video_id: 'a', profile_id: 'p1', draft_id: null, text: 'x', status: 'success', reason: null, screenshot_path: null, created_at: '2026-10-20 10:00:00' })
    insertPost(db, { video_id: 'b', profile_id: 'p1', draft_id: null, text: 'y', status: 'blocked', reason: 'already_posted', screenshot_path: null, created_at: '2026-10-20 10:01:00' })
    const rows = listPosts(db)
    expect(rows[0].video_title).toBe('tb'); expect(rows[1].video_title).toBe('ta')
  })
})

describe('jobs', () => {
  it('tracks the active job until terminal state', () => {
    upsertVideos(db, [video('a')])
    createJob(db, { id: 'j1', video_id: 'a', profile_id: 'p1', draft_id: 1 })
    expect(activeJob(db)?.id).toBe('j1')
    updateJob(db, 'j1', { state: 'typing', message: '입력 중' })
    expect(getJob(db, 'j1')?.state).toBe('typing')
    updateJob(db, 'j1', { state: 'failed', message: '시간 초과' })
    expect(activeJob(db)).toBeUndefined()
  })
})
