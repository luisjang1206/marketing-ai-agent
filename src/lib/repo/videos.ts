import type { DatabaseSync } from 'node:sqlite'
export type VideoRow = { id: string; channel_id: string; channel_title: string; title: string; description: string;
  thumbnail_url: string; published_at: string; view_count: number; source: 'list' | 'direct'; fetched_at: string }
export function upsertVideos(db: DatabaseSync, rows: Omit<VideoRow, 'fetched_at'>[]): void {
  const stmt = db.prepare(`INSERT INTO videos (id, channel_id, channel_title, title, description, thumbnail_url, published_at, view_count, source)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, thumbnail_url=excluded.thumbnail_url, view_count=excluded.view_count, fetched_at=datetime('now','localtime')`)
  for (const r of rows) stmt.run(r.id, r.channel_id, r.channel_title, r.title, r.description, r.thumbnail_url, r.published_at, r.view_count, r.source)
}
export function listVideos(db: DatabaseSync): VideoRow[] {
  return db.prepare(`SELECT * FROM videos ORDER BY published_at DESC`).all() as VideoRow[]
}
export function getVideo(db: DatabaseSync, id: string): VideoRow | undefined {
  return db.prepare(`SELECT * FROM videos WHERE id=?`).get(id) as VideoRow | undefined
}
