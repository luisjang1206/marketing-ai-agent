# 02 SQLite 저장소 + 리포지토리

Status: ready-for-agent
Type: task
Blocked by: 01
Agent: issue-implementer
Model: sonnet

## 목표
`node:sqlite`로 `data/agent.db`를 열고 spec §6 테이블을 만든다. 리포지토리 함수는 전부 `db`를 첫 인자로 받아 `:memory:`로 테스트한다.

## 파일
- Create: `src/lib/db.ts`, `src/lib/repo/videos.ts`, `src/lib/repo/captions.ts`, `src/lib/repo/drafts.ts`, `src/lib/repo/posts.ts`, `src/lib/repo/jobs.ts`, `src/lib/repo/profiles.ts`
- Test: `tests/repo.test.ts`

## 인터페이스
```ts
// src/lib/db.ts
import { DatabaseSync } from 'node:sqlite'
export function openDb(file: string): DatabaseSync      // PRAGMA journal_mode=WAL, foreign_keys=ON, migrate()
export function getDb(): DatabaseSync                   // globalThis 싱글턴(HMR 안전), ensureDataDirs() 후 openDb(dbPath())

// repo/videos.ts
export type VideoRow = { id: string; channel_id: string; channel_title: string; title: string; description: string;
  thumbnail_url: string; published_at: string; view_count: number; source: 'list' | 'direct'; fetched_at: string }
export function upsertVideos(db, rows: Omit<VideoRow, 'fetched_at'>[]): void
export function listVideos(db): VideoRow[]                      // published_at DESC
export function getVideo(db, id: string): VideoRow | undefined

// repo/captions.ts
export type CaptionSource = 'subtitle' | 'none'
export function saveCaptions(db, videoId: string, text: string, source: CaptionSource): void
export function getCaptions(db, videoId: string): { text: string; source: CaptionSource } | undefined

// repo/drafts.ts
export type DraftRow = { id: number; video_id: string; concern: string; evidence: string; text: string;
  valid: boolean; violations: string[]; model: string; created_at: string }
export function insertDraft(db, d: Omit<DraftRow, 'id' | 'created_at'>): number
export function latestDraft(db, videoId: string): DraftRow | undefined

// repo/posts.ts
export type PostStatus = 'success' | 'failed' | 'blocked'
export type PostRow = { id: number; video_id: string; profile_id: string; draft_id: number | null; text: string | null;
  status: PostStatus; reason: string | null; screenshot_path: string | null; created_at: string }
export type PostLogRow = PostRow & { video_title: string | null; channel_title: string | null }
export function insertPost(db, p: Omit<PostRow, 'id' | 'created_at'> & { created_at?: string }): number
export function listPosts(db, limit?: number): PostLogRow[]     // created_at DESC, LEFT JOIN videos
export function successCountToday(db, today: string): number    // today 'YYYY-MM-DD' (로컬)
export function hasSuccessForVideo(db, videoId: string): boolean
export function lastSuccessProfileId(db): string | null
export function postedVideoIds(db): string[]                      // status='success' DISTINCT

// repo/jobs.ts
export type JobState = 'queued' | 'opening_profile' | 'typing' | 'posted' | 'verified' | 'failed'
export type JobRow = { id: string; video_id: string; profile_id: string; draft_id: number; state: JobState;
  message: string | null; screenshot_path: string | null; post_id: number | null; created_at: string; updated_at: string }
export function createJob(db, j: Pick<JobRow, 'id' | 'video_id' | 'profile_id' | 'draft_id'>): void
export function updateJob(db, id: string, patch: Partial<Pick<JobRow, 'state' | 'message' | 'screenshot_path' | 'post_id'>>): void
export function getJob(db, id: string): JobRow | undefined
export function activeJob(db): JobRow | undefined                 // state NOT IN ('verified','failed')

// repo/profiles.ts
export type ProfileRow = { id: string; label: string; logged_in: boolean; channel_name: string | null; checked_at: string | null }
export function upsertProfile(db, p: Omit<ProfileRow, 'checked_at'>): void
export function listProfiles(db): ProfileRow[]
export function getProfile(db, id: string): ProfileRow | undefined
```

## 단계
- [ ] 1. 실패하는 테스트 `tests/repo.test.ts`
```ts
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
```
- [ ] 2. `pnpm test tests/repo.test.ts` → FAIL
- [ ] 3. `src/lib/db.ts`
```ts
import { DatabaseSync } from 'node:sqlite'
import { dbPath, ensureDataDirs } from './paths'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, channel_title TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', thumbnail_url TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL CHECK (source IN ('list','direct')),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS captions (
  video_id TEXT PRIMARY KEY REFERENCES videos(id), text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('subtitle','none')),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT NOT NULL REFERENCES videos(id),
  concern TEXT NOT NULL, evidence TEXT NOT NULL, text TEXT NOT NULL, valid INTEGER NOT NULL,
  violations TEXT NOT NULL DEFAULT '[]', model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT NOT NULL REFERENCES videos(id), profile_id TEXT NOT NULL,
  draft_id INTEGER, text TEXT, status TEXT NOT NULL CHECK (status IN ('success','failed','blocked')),
  reason TEXT, screenshot_path TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id), profile_id TEXT NOT NULL, draft_id INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','opening_profile','typing','posted','verified','failed')),
  message TEXT, screenshot_path TEXT, post_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, logged_in INTEGER NOT NULL DEFAULT 0, channel_name TEXT, checked_at TEXT);
`
export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
declare global { var __agentDb: DatabaseSync | undefined }
export function getDb(): DatabaseSync {
  if (!globalThis.__agentDb) { ensureDataDirs(); globalThis.__agentDb = openDb(dbPath()) }
  return globalThis.__agentDb
}
```
- [ ] 4. 리포지토리 구현. 패턴(posts.ts 예):
```ts
import type { DatabaseSync } from 'node:sqlite'
export function insertPost(db: DatabaseSync, p: Omit<PostRow, 'id' | 'created_at'> & { created_at?: string }): number {
  const cols = ['video_id', 'profile_id', 'draft_id', 'text', 'status', 'reason', 'screenshot_path']
  const vals: unknown[] = [p.video_id, p.profile_id, p.draft_id, p.text, p.status, p.reason, p.screenshot_path]
  if (p.created_at) { cols.push('created_at'); vals.push(p.created_at) }
  const r = db.prepare(`INSERT INTO posts (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...(vals as never[]))
  return Number(r.lastInsertRowid)
}
export function successCountToday(db: DatabaseSync, today: string): number {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE status='success' AND date(created_at)=?`).get(today) as { n: number }
  return r.n
}
export function hasSuccessForVideo(db: DatabaseSync, videoId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM posts WHERE video_id=? AND status='success' LIMIT 1`).get(videoId)
}
export function lastSuccessProfileId(db: DatabaseSync): string | null {
  const r = db.prepare(`SELECT profile_id FROM posts WHERE status='success' ORDER BY id DESC LIMIT 1`).get() as { profile_id: string } | undefined
  return r?.profile_id ?? null
}
export function postedVideoIds(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT DISTINCT video_id FROM posts WHERE status='success'`).all() as { video_id: string }[]).map((r) => r.video_id)
}
export function listPosts(db: DatabaseSync, limit = 100): PostLogRow[] {
  return db.prepare(`SELECT p.*, v.title AS video_title, v.channel_title FROM posts p LEFT JOIN videos v ON v.id=p.video_id ORDER BY p.id DESC LIMIT ?`).all(limit) as PostLogRow[]
}
```
drafts는 `valid`를 `0/1`로 저장하고 읽을 때 `!!row.valid`, `violations`는 `JSON.stringify/parse`. jobs의 `updateJob`은 `updated_at = datetime('now','localtime')`를 항상 갱신. `upsertVideos`는 `INSERT ... ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, thumbnail_url=excluded.thumbnail_url, view_count=excluded.view_count, fetched_at=datetime('now','localtime')`.
- [ ] 5. `pnpm test` → PASS
- [ ] 6. 커밋 `feat: add sqlite storage and repositories`

## 완료 기준
테스트 녹색. `getDb()`를 두 번 불러도 같은 인스턴스. `data/agent.db`가 첫 호출 때 생성된다.
