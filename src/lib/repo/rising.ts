import type { DatabaseSync } from 'node:sqlite'
import type { VideoRow } from './videos'

export type RisingSearchRow = { id: number; keyword: string; scanned: number; found: number; searched_at: string }
export type RisingCandidateRow = { search_id: number; video_id: string; view_count: number; hours_since_publish: number; views_per_hour: number }
export type RisingCandidateJoined = RisingCandidateRow & VideoRow

// 검색 한 건과 후보를 저장하고 검색 id 를 돌려준다. 후보의 video_id 는 videos 에 먼저 upsert 되어 있어야 한다.
export function insertRisingSearch(
  db: DatabaseSync,
  s: { keyword: string; scanned: number; found: number },
  candidates: Omit<RisingCandidateRow, 'search_id'>[],
): number {
  const res = db.prepare(`INSERT INTO rising_searches (keyword, scanned, found) VALUES (?,?,?)`).run(s.keyword, s.scanned, s.found)
  const searchId = Number(res.lastInsertRowid)
  const stmt = db.prepare(`INSERT INTO rising_candidates (search_id, video_id, view_count, hours_since_publish, views_per_hour) VALUES (?,?,?,?,?)`)
  for (const c of candidates) stmt.run(searchId, c.video_id, c.view_count, c.hours_since_publish, c.views_per_hour)
  return searchId
}

export function latestRisingSearch(db: DatabaseSync): RisingSearchRow | undefined {
  return db.prepare(`SELECT * FROM rising_searches ORDER BY id DESC LIMIT 1`).get() as RisingSearchRow | undefined
}

export function listRisingCandidates(db: DatabaseSync, searchId: number): RisingCandidateJoined[] {
  return db.prepare(`SELECT c.*, v.* FROM rising_candidates c JOIN videos v ON v.id=c.video_id WHERE c.search_id=? ORDER BY c.views_per_hour DESC`)
    .all(searchId) as RisingCandidateJoined[]
}
