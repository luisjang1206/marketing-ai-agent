import type { DatabaseSync } from 'node:sqlite'
export type PostStatus = 'success' | 'failed' | 'blocked'
export type PostRow = { id: number; video_id: string; profile_id: string; draft_id: number | null; text: string | null;
  status: PostStatus; reason: string | null; screenshot_path: string | null; created_at: string }
export type PostLogRow = PostRow & { video_title: string | null; channel_title: string | null }
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
