import { NextResponse } from 'next/server'
import { profilesOf } from '@/lib/config'
import { services } from '@/lib/services'
import { startPostJob } from '@/lib/jobs/runner'
import { postComment } from '@/lib/browser/poster'
import type { PostStartResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { cfg, db, today } = services()
  const body = (await req.json().catch(() => null)) as { videoId?: unknown; profileId?: unknown } | null
  if (typeof body?.videoId !== 'string' || !body.videoId) {
    return NextResponse.json({ reason: 'invalid_request', message: '영상을 지정해야 합니다' }, { status: 400 })
  }
  // 설정에 없는 프로필 번호는 data/profiles/<n> 을 새로 열게 되므로 여기서 막는다. 비우면(생략·null·빈 문자열) 자동 배정.
  const profileId = body.profileId === '' ? null : body.profileId
  if (profileId != null && (typeof profileId !== 'string' || !profilesOf(cfg).some((p) => p.id === profileId))) {
    return NextResponse.json({ reason: 'invalid_profile', message: '알 수 없는 프로필입니다' }, { status: 400 })
  }
  const r = await startPostJob({ videoId: body.videoId, profileId }, { db, cfg, post: postComment, today })
  if (!r.ok) return NextResponse.json({ reason: r.reason, message: r.message }, { status: r.status })
  return NextResponse.json({ jobId: r.jobId } satisfies PostStartResponse, { status: 202 })
}
