import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from '@/lib/db'
describe('openDb', () => {
  it('creates the rising tables on a fresh database', () => {
    const db = openDb(':memory:')
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['rising_searches', 'rising_candidates']))
  })
  it('refuses a database whose videos table predates source=rising', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'db-')), 'agent.db')
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE videos (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, channel_title TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', thumbnail_url TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL CHECK (source IN ('list','direct')),
      fetched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`)
    old.close()
    expect(() => openDb(file)).toThrow(/reset:data/)
  })
})
