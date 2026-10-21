import { DatabaseSync } from 'node:sqlite'
import { dbPath, ensureDataDirs } from './paths'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, channel_title TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', thumbnail_url TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL CHECK (source IN ('list','direct','rising')),
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
CREATE TABLE IF NOT EXISTS rising_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, scanned INTEGER NOT NULL, found INTEGER NOT NULL,
  searched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS rising_candidates (
  search_id INTEGER NOT NULL REFERENCES rising_searches(id), video_id TEXT NOT NULL REFERENCES videos(id),
  view_count INTEGER NOT NULL, hours_since_publish REAL NOT NULL, views_per_hour REAL NOT NULL,
  PRIMARY KEY (search_id, video_id));
`
export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  // CREATE TABLE IF NOT EXISTS 는 구 videos 표를 고치지 못한다. source CHECK 에 'rising' 이 없으면 reset 을 안내한다.
  const videosSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='videos'`).get() as { sql: string }).sql
  if (!videosSql.includes(`'rising'`)) {
    db.close()
    throw new Error('data/agent.db 스키마가 바뀌었습니다. 개발 서버를 끄고 pnpm reset:data 를 실행한 뒤 다시 시작하세요')
  }
  return db
}
declare global { var __agentDb: DatabaseSync | undefined }
export function getDb(): DatabaseSync {
  if (!globalThis.__agentDb) { ensureDataDirs(); globalThis.__agentDb = openDb(dbPath()) }
  return globalThis.__agentDb
}
