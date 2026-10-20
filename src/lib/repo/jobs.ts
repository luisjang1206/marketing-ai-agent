import type { DatabaseSync } from 'node:sqlite'
export type JobState = 'queued' | 'opening_profile' | 'typing' | 'posted' | 'verified' | 'failed'
export type JobRow = { id: string; video_id: string; profile_id: string; draft_id: number; state: JobState;
  message: string | null; screenshot_path: string | null; post_id: number | null; created_at: string; updated_at: string }
export function createJob(db: DatabaseSync, j: Pick<JobRow, 'id' | 'video_id' | 'profile_id' | 'draft_id'>): void {
  db.prepare(`INSERT INTO jobs (id, video_id, profile_id, draft_id, state) VALUES (?,?,?,?, 'queued')`).run(j.id, j.video_id, j.profile_id, j.draft_id)
}
export function updateJob(db: DatabaseSync, id: string, patch: Partial<Pick<JobRow, 'state' | 'message' | 'screenshot_path' | 'post_id'>>): void {
  const sets: string[] = []
  const vals: unknown[] = []
  for (const key of ['state', 'message', 'screenshot_path', 'post_id'] as const) {
    if (key in patch) { sets.push(`${key}=?`); vals.push(patch[key] ?? null) }
  }
  sets.push(`updated_at=datetime('now','localtime')`)
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id=?`).run(...(vals as never[]), id)
}
export function getJob(db: DatabaseSync, id: string): JobRow | undefined {
  return db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id) as JobRow | undefined
}
export function activeJob(db: DatabaseSync): JobRow | undefined {
  return db.prepare(`SELECT * FROM jobs WHERE state NOT IN ('verified','failed') ORDER BY created_at DESC LIMIT 1`).get() as JobRow | undefined
}
