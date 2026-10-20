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
// 같은 채널 최근 초안 text (최신순). 초안 프롬프트가 겹치지 않게 참고한다(이슈 13).
export function recentChannelDraftTexts(db: DatabaseSync, channelId: string, limit = 5): string[] {
  const rows = db.prepare(`SELECT d.text FROM drafts d JOIN videos v ON v.id = d.video_id WHERE v.channel_id=? ORDER BY d.id DESC LIMIT ?`)
    .all(channelId, limit) as { text: string }[]
  return rows.map((r) => r.text)
}
