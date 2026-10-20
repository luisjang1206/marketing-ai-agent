// 클라이언트 전용: fetch 래퍼와 swr 키만 둔다. 서버 모듈(db, repo, playwright, 어댑터)은 가져오지 않는다.
// 응답 타입은 `import type` 으로만 가져와 번들에 들어가지 않게 한다.
import type { ApiError, ApiReason, DraftResponse, PostStartResponse, ProfileResponse, VideoResponse, VideosResponse } from '../api-types'

export class ApiRequestError extends Error {
  status: number
  reason: ApiReason | 'network' | 'unknown'
  constructor(message: string, status: number, reason: ApiReason | 'network' | 'unknown') {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.reason = reason
  }
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

// Route Handler 는 실패하면 `{ reason, message }` 를 돌려준다. 그 message(한국어)를 그대로 오류 메시지로 쓴다.
async function request<T>(url: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    })
  } catch {
    throw new ApiRequestError('서버에 연결하지 못했습니다', 0, 'network')
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data as Partial<ApiError> | null
    throw new ApiRequestError(e?.message ?? `요청을 처리하지 못했습니다 (${res.status})`, res.status, e?.reason ?? 'unknown')
  }
  return data as T
}

// swr 키. 초안은 POST 라서 URL 대신 튜플 키를 쓴다(영상마다 따로 캐시된다).
export const KEYS = {
  config: '/api/config',
  videos: '/api/videos',
  log: '/api/log',
  profiles: '/api/profiles',
  job: (jobId: string) => `/api/posts/${jobId}`,
  draft: (videoId: string) => ['draft', videoId] as const,
}

export const fetcher = <T>(url: string): Promise<T> => request<T>(url)

export const getVideos = (refresh = false) => request<VideosResponse>(refresh ? `${KEYS.videos}?refresh=1` : KEYS.videos)
export const addVideoLink = (url: string) => request<VideoResponse>(KEYS.videos, { method: 'POST', body: { url } })
export const requestDraft = (videoId: string, regenerate: boolean) =>
  request<DraftResponse>(`/api/videos/${encodeURIComponent(videoId)}/draft`, { method: 'POST', body: { regenerate } })
export const startPost = (videoId: string, profileId?: string) =>
  request<PostStartResponse>('/api/posts', { method: 'POST', body: { videoId, profileId } })
export const openProfileLogin = (profileId: string) => request<{ ok: true }>(`/api/profiles/${encodeURIComponent(profileId)}/login`, { method: 'POST' })
export const checkProfileLogin = (profileId: string) => request<ProfileResponse>(`/api/profiles/${encodeURIComponent(profileId)}/check`, { method: 'POST' })

// 게시 캡처는 서버가 절대 경로로 기록한다. 화면에는 파일 이름만 /api/screenshots/<file> 로 넘긴다.
export function screenshotUrl(screenshotPath: string | null | undefined): string | null {
  if (!screenshotPath) return null
  const file = screenshotPath.split(/[\\/]/).pop()
  return file ? `/api/screenshots/${encodeURIComponent(file)}` : null
}
export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
