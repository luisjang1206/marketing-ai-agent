import { describe, it, expect, beforeEach } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '@/lib/db'
import { upsertVideos, listVideos, getVideo } from '@/lib/repo/videos'
import { insertDraft, latestDraft, recentChannelDraftTexts } from '@/lib/repo/drafts'
import { insertPost, successCountToday, hasSuccessForVideo, lastSuccessProfileId, listPosts, postedVideoIds } from '@/lib/repo/posts'
import { createJob, updateJob, getJob, activeJob } from '@/lib/repo/jobs'
import { insertRisingSearch, latestRisingSearch, listRisingCandidates } from '@/lib/repo/rising'

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
  it('recentChannelDraftTexts returns same-channel texts newest first, up to limit', () => {
    const other = 'UC-ee_ziASM251TMXe3P3VZA'
    upsertVideos(db, [video('a'), video('b'), { ...video('c'), channel_id: other }])
    const add = (v: string, text: string) => insertDraft(db, { video_id: v, concern: 'c', evidence: 'e', text, valid: true, violations: [], model: 'm' })
    add('a', 'a1'); add('c', 'c1'); add('b', 'b1'); add('a', 'a2')
    expect(recentChannelDraftTexts(db, 'UCxlc0Ky0aWoD8uI09ad44Tg')).toEqual(['a2', 'b1', 'a1'])
    expect(recentChannelDraftTexts(db, 'UCxlc0Ky0aWoD8uI09ad44Tg', 2)).toEqual(['a2', 'b1'])
    expect(recentChannelDraftTexts(db, other)).toEqual(['c1'])
    for (let i = 3; i <= 6; i++) add('b', 'b' + i)
    expect(recentChannelDraftTexts(db, 'UCxlc0Ky0aWoD8uI09ad44Tg')).toEqual(['b6', 'b5', 'b4', 'b3', 'a2'])   // 기본 5개
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

describe('rising', () => {
  it('stores a search with candidates and lists the latest search by views per hour', () => {
    upsertVideos(db, [{ ...video('r1'), source: 'rising' }, { ...video('r2'), source: 'rising' }])
    insertRisingSearch(db, { keyword: '연애', scanned: 10, found: 0 }, [])
    const id = insertRisingSearch(db, { keyword: '연애', scanned: 100, found: 2 }, [
      { video_id: 'r1', view_count: 1200, hours_since_publish: 6, views_per_hour: 200 },
      { video_id: 'r2', view_count: 4000, hours_since_publish: 8, views_per_hour: 500 },
    ])
    const latest = latestRisingSearch(db)!
    expect(latest.id).toBe(id); expect(latest).toMatchObject({ keyword: '연애', scanned: 100, found: 2 })
    const rows = listRisingCandidates(db, id)
    expect(rows.map((r) => r.video_id)).toEqual(['r2', 'r1'])
    expect(rows[0]).toMatchObject({ title: 'tr2', views_per_hour: 500, source: 'rising' })
  })
  it('latestRisingSearch is undefined before any search', () => expect(latestRisingSearch(db)).toBeUndefined())
})
