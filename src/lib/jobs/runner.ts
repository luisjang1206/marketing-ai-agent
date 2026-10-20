import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { allowedChannelIds, type AppConfig } from '../config'
import { profileDir, screenshotDir } from '../paths'
import { checkPostAllowed, type RuleReason } from '../rules'
import { pickProfile } from '../browser/rotation'
import { FAILURE_LABELS, type postComment, type PostProgress } from '../browser/poster'
import { getVideo } from '../repo/videos'
import { latestDraft } from '../repo/drafts'
import { listProfiles, getProfile } from '../repo/profiles'
import { insertPost, hasSuccessForVideo, successCountToday, lastSuccessProfileId } from '../repo/posts'
import { createJob, updateJob, getJob, activeJob, type JobRow } from '../repo/jobs'

export type StartResult = { ok: true; jobId: string }
  | { ok: false; status: 409 | 400; reason: RuleReason | 'busy' | 'no_profile' | 'video_not_found' | 'no_draft' | 'invalid_draft'; message: string }
// The route (issue 09) assembles these; tests inject a fake `post`.
export type RunnerDeps = { db: DatabaseSync; cfg: AppConfig; post: typeof postComment; today: () => string }

const PROGRESS_MESSAGES: Record<PostProgress, string> = {
  opening_profile: '프로필 여는 중',
  typing: '입력 중',
  posted: '게시 완료',
  verified: '댓글 보기',
}

// Profile id `p2` -> directory index 2 (config order, from 1).
function profileIndex(id: string): number {
  const m = /^p(\d+)$/.exec(id)
  if (!m) throw new Error(`프로필 id 형식이 아닙니다: ${id}`)
  return Number(m[1])
}

export async function startPostJob(input: { videoId: string; profileId?: string | null }, deps: RunnerDeps): Promise<StartResult> {
  const { db, cfg } = deps
  const video = getVideo(db, input.videoId)
  if (!video) return { ok: false, status: 400, reason: 'video_not_found', message: '영상을 찾을 수 없습니다' }
  const draft = latestDraft(db, video.id)
  if (!draft) return { ok: false, status: 400, reason: 'no_draft', message: '댓글 초안이 없습니다' }
  if (!draft.valid) return { ok: false, status: 400, reason: 'invalid_draft', message: '검증 규칙을 통과하지 못한 초안입니다' }

  // 운영 규칙: 허용 범위 -> 영상당 1개 -> 하루 상한. 차단은 게시 기록에 남긴다.
  const verdict = checkPostAllowed({
    videoChannelId: video.channel_id,
    allowedChannelIds: allowedChannelIds(cfg),
    alreadyPosted: hasSuccessForVideo(db, video.id),
    successCountToday: successCountToday(db, deps.today()),
    dailyMax: cfg.limits.daily_max_comments,
  })
  if (!verdict.allowed) {
    insertPost(db, { video_id: video.id, profile_id: input.profileId ?? '-', draft_id: draft.id, text: draft.text,
      status: 'blocked', reason: verdict.reason, screenshot_path: null })
    return { ok: false, status: 409, reason: verdict.reason, message: verdict.message }
  }

  if (activeJob(db)) return { ok: false, status: 409, reason: 'busy', message: '진행 중인 게시가 끝난 뒤 다시 시도하세요' }

  const profileId = input.profileId
    ?? pickProfile(listProfiles(db).map((p) => ({ id: p.id, loggedIn: p.logged_in })), lastSuccessProfileId(db))
  if (!profileId) return { ok: false, status: 409, reason: 'no_profile', message: '로그인된 프로필 없음' }

  const jobId = randomUUID()
  createJob(db, { id: jobId, video_id: video.id, profile_id: profileId, draft_id: draft.id })
  void runPostJob(jobId, deps)
  return { ok: true, jobId }
}

// Runs in the background after startPostJob returns, so it never throws: any exception is recorded as failed/unknown.
// 영상당 1개: the success row is written the moment post reports 'verified' (post keeps the window open a few
// seconds after that), so there is never a moment where the job is no longer active and the video has no success row.
// Once recorded, a later failure or throw from post never adds a second row or downgrades the job.
export async function runPostJob(jobId: string, deps: RunnerDeps): Promise<void> {
  const { db, cfg } = deps
  let job: JobRow | undefined
  let text: string | null = null
  let successPostId = null as number | null
  try {
    job = getJob(db, jobId)
    if (!job) return
    const j = job
    // The job's draft is the video's latest draft at creation; this runs in the same tick as createJob.
    const draft = latestDraft(db, j.video_id)
    if (!draft || draft.id !== j.draft_id) throw new Error('작업의 댓글 초안을 찾을 수 없습니다')
    text = draft.text   // for the catch path
    const postText = draft.text
    const screenshotPath = path.join(screenshotDir(), jobId + '.png')

    // Inserts the success row and marks the job verified together (synchronous node:sqlite calls, no await between).
    const recordSuccess = (shot: string) => {
      if (successPostId !== null) return
      successPostId = insertPost(db, { video_id: j.video_id, profile_id: j.profile_id, draft_id: j.draft_id, text: postText,
        status: 'success', reason: null, screenshot_path: shot })
      updateJob(db, jobId, { state: 'verified', message: PROGRESS_MESSAGES.verified, screenshot_path: shot, post_id: successPostId })
    }

    const result = await deps.post({
      userDataDir: profileDir(profileIndex(j.profile_id)),
      videoId: j.video_id,
      text: postText,
      expectedAuthor: getProfile(db, j.profile_id)?.channel_name ?? null,
      typingDelayMs: [cfg.typing.min_delay_ms, cfg.typing.max_delay_ms],
      screenshotPath,
      onProgress: (p) => {
        if (successPostId !== null) return
        // post saves the screenshot to `screenshotPath` before reporting 'verified'.
        if (p === 'verified') recordSuccess(screenshotPath)
        else updateJob(db, jobId, { state: p, message: PROGRESS_MESSAGES[p] })
      },
    })

    if (successPostId !== null) return
    if (result.ok) return recordSuccess(result.screenshotPath)   // a post that never reported 'verified'
    const postId = insertPost(db, { video_id: j.video_id, profile_id: j.profile_id, draft_id: j.draft_id, text: postText,
      status: 'failed', reason: result.reason, screenshot_path: result.screenshotPath })
    updateJob(db, jobId, { state: 'failed', message: result.message, screenshot_path: result.screenshotPath, post_id: postId })
  } catch (err) {
    if (!job || successPostId !== null) return
    try {
      const message = `${FAILURE_LABELS.unknown}: ${err instanceof Error ? err.message : String(err)}`
      const postId = insertPost(db, { video_id: job.video_id, profile_id: job.profile_id, draft_id: job.draft_id, text,
        status: 'failed', reason: 'unknown', screenshot_path: null })
      updateJob(db, jobId, { state: 'failed', message, post_id: postId })
    } catch {
      // Recording the failure failed too (e.g. the db is gone); nothing left to report to.
    }
  }
}
