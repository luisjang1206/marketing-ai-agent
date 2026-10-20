import type { DatabaseSync } from 'node:sqlite'
export type DraftRow = { id: number; video_id: string; concern: string; evidence: string; text: string;
  valid: boolean; violations: string[]; model: string; created_at: string }
export function insertDraft(db: DatabaseSync, d: Omit<DraftRow, 'id' | 'created_at'>): number {
  const r = db.prepare(`INSERT INTO drafts (video_id, concern, evidence, text, valid, violations, model) VALUES (?,?,?,?,?,?,?)`)
    .run(d.video_id, d.concern, d.evidence, d.text, d.valid ? 1 : 0, JSON.stringify(d.violations), d.model)
  return Number(r.lastInsertRowid)
}
export function latestDraft(db: DatabaseSync, videoId: string): DraftRow | undefined {
  const row = db.prepare(`SELECT * FROM drafts WHERE video_id=? ORDER BY id DESC LIMIT 1`).get(videoId) as
    (Omit<DraftRow, 'valid' | 'violations'> & { valid: number; violations: string }) | undefined
  if (!row) return undefined
  return { ...row, valid: !!row.valid, violations: JSON.parse(row.violations) as string[] }
}
