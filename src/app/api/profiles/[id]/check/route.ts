import { NextResponse } from 'next/server'
import { profilesOf } from '@/lib/config'
import { profileDir } from '@/lib/paths'
import { services } from '@/lib/services'
import { checkLogin } from '@/lib/browser/profiles'
import { upsertProfile } from '@/lib/repo/profiles'
import type { ProfileResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { cfg, db } = services()
  const { id } = await params
  const profile = profilesOf(cfg).find((p) => p.id === id)
  if (!profile) return NextResponse.json({ reason: 'profile_not_found', message: '프로필을 찾을 수 없습니다' }, { status: 404 })
  try {
    const status = await checkLogin(profileDir(profile.index))
    // channelName 은 @핸들이다. 게시 러너가 expectedAuthor 로 쓰므로 가공하지 않고 저장한다(이슈 08).
    upsertProfile(db, { id: profile.id, label: profile.label, logged_in: status.loggedIn, channel_name: status.channelName })
    return NextResponse.json({ profile: { ...profile, loggedIn: status.loggedIn, channelName: status.channelName } } satisfies ProfileResponse)
  } catch (err) {
    return NextResponse.json({ reason: 'check_failed', message: `로그인 상태를 확인하지 못했습니다: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
