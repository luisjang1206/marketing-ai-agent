// Route Handler 응답 타입. UI(issue 10)와 공유하므로 타입만 둔다(런타임 import 없음).
import type { Profile } from './config'
import type { CaptionSource } from './repo/captions'
import type { DraftRow } from './repo/drafts'
import type { JobRow } from './repo/jobs'
import type { PostLogRow } from './repo/posts'
import type { VideoRow } from './repo/videos'

export type ApiError = { reason: string; message: string }

export type ConfigResponse = { profiles: Profile[]; dailyMax: number; allowedChannelIds: string[]; testChannelIds: string[];
  comment: { min: number; max: number; brand: string } }

export type VideoView = VideoRow & { captionSource: CaptionSource | null; hasDraft: boolean; isTestChannel: boolean }
export type VideosResponse = { videos: VideoView[] }
export type VideoResponse = { video: VideoRow }

export type DraftResponse = { draft: DraftRow; captionSource: CaptionSource | null }

export type PostStartResponse = { jobId: string }
export type JobResponse = { job: JobRow }
export type LogResponse = { posts: PostLogRow[]; todayCount: number; postedVideoIds: string[]; activeJobId: string | null }

export type ProfileView = { id: string; label: string; index: number; loggedIn: boolean; channelName: string | null }
export type ProfilesResponse = { profiles: ProfileView[] }
export type ProfileResponse = { profile: ProfileView }
