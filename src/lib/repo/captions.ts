import type { DatabaseSync } from 'node:sqlite'
export type CaptionSource = 'subtitle' | 'none'
export function saveCaptions(db: DatabaseSync, videoId: string, text: string, source: CaptionSource): void {
  db.prepare(`INSERT INTO captions (video_id, text, source) VALUES (?,?,?)
    ON CONFLICT(video_id) DO UPDATE SET text=excluded.text, source=excluded.source, fetched_at=datetime('now','localtime')`).run(videoId, text, source)
}
export function getCaptions(db: DatabaseSync, videoId: string): { text: string; source: CaptionSource } | undefined {
  return db.prepare(`SELECT text, source FROM captions WHERE video_id=?`).get(videoId) as { text: string; source: CaptionSource } | undefined
}
