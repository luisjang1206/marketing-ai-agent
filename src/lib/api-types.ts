// Route Handler 응답 타입. UI(issue 10)와 공유하므로 타입만 둔다(런타임 import 없음).
import type { Profile } from './config'
import type { CaptionSource } from './repo/captions'
import type { DraftRow } from './repo/drafts'
import type { JobRow } from './repo/jobs'
import type { PostLogRow } from './repo/posts'
import type { VideoRow } from './repo/videos'
import type { StartResult } from './jobs/runner'

// UI 가 posts.reason(실패 사유 코드)의 키를 맞출 수 있게 타입만 다시 내보낸다. 클라이언트는 어댑터 모듈 대신 이 파일에서 가져온다.
export type { FailureReason } from './browser/poster'

// 게시 시작이 거절되는 사유: 운영 규칙 코드 + busy · no_profile · video_not_found · no_draft · invalid_draft (runner 가 정한다).
export type StartFailReason = Extract<StartResult, { ok: false }>['reason']
// Route Handler 가 돌려주는 사유 코드 전부. 값을 더하면 여기에도 더한다.
export type ApiReason = StartFailReason
  | 'invalid_url' | 'not_found' | 'upstream_error'          // 영상 목록 · 직접 입력 · 초안
  | 'invalid_request' | 'invalid_profile' | 'job_not_found'  // 게시
  | 'profile_not_found' | 'check_failed'                     // 프로필
export type ApiError = { reason: ApiReason; message: string }

export type ConfigResponse = { profiles: Profile[]; dailyMax: number; allowedChannelIds: string[]; testChannelIds: string[];
  comment: { min: number; max: number; brand: string };
  rising: { keyword: string; minViews: number; maxViews: number; minViewsPerHour: number; publishedWithinHours: number } }

export type VideoView = VideoRow & { captionSource: CaptionSource | null; hasDraft: boolean; isTestChannel: boolean }
export type VideosResponse = { videos: VideoView[] }
export type VideoResponse = { video: VideoRow }

// 뜨기 직전 영상 후보. view_count 는 검색 시점 스냅샷이다(rising_candidates.view_count).
export type RisingCandidateView = VideoView & { viewsPerHour: number; hoursSincePublish: number }
export type RisingResponse = { keyword: string; searchedAt: string | null; scanned: number; candidates: RisingCandidateView[] }

export type DraftResponse = { draft: DraftRow; captionSource: CaptionSource | null }

export type PostStartResponse = { jobId: string }
export type JobResponse = { job: JobRow }
export type LogResponse = { posts: PostLogRow[]; todayCount: number; postedVideoIds: string[]; activeJobId: string | null }

export type ProfileView = { id: string; label: string; index: number; loggedIn: boolean; channelName: string | null }
export type ProfilesResponse = { profiles: ProfileView[] }
export type ProfileResponse = { profile: ProfileView }
