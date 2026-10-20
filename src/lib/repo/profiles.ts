import type { DatabaseSync } from 'node:sqlite'
export type ProfileRow = { id: string; label: string; logged_in: boolean; channel_name: string | null; checked_at: string | null }
type RawProfile = Omit<ProfileRow, 'logged_in'> & { logged_in: number }
const toRow = (r: RawProfile): ProfileRow => ({ ...r, logged_in: !!r.logged_in })
export function upsertProfile(db: DatabaseSync, p: Omit<ProfileRow, 'checked_at'>): void {
  db.prepare(`INSERT INTO profiles (id, label, logged_in, channel_name, checked_at) VALUES (?,?,?,?, datetime('now','localtime'))
    ON CONFLICT(id) DO UPDATE SET label=excluded.label, logged_in=excluded.logged_in, channel_name=excluded.channel_name, checked_at=excluded.checked_at`)
    .run(p.id, p.label, p.logged_in ? 1 : 0, p.channel_name)
}
export function listProfiles(db: DatabaseSync): ProfileRow[] {
  return (db.prepare(`SELECT * FROM profiles ORDER BY id`).all() as RawProfile[]).map(toRow)
}
export function getProfile(db: DatabaseSync, id: string): ProfileRow | undefined {
  const r = db.prepare(`SELECT * FROM profiles WHERE id=?`).get(id) as RawProfile | undefined
  return r && toRow(r)
}
