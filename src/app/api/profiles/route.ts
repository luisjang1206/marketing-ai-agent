import { NextResponse } from 'next/server'
import { profilesOf } from '@/lib/config'
import { services } from '@/lib/services'
import { listProfiles } from '@/lib/repo/profiles'
import type { ProfilesResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 설정의 프로필(번호·라벨)에 저장된 로그인 상태를 합친다. 확인한 적 없는 프로필은 로그인 안 됨.
export async function GET() {
  const { cfg, db } = services()
  const stored = new Map(listProfiles(db).map((r) => [r.id, r]))
  const body: ProfilesResponse = {
    profiles: profilesOf(cfg).map((p) => ({ ...p, loggedIn: stored.get(p.id)?.logged_in ?? false, channelName: stored.get(p.id)?.channel_name ?? null })),
  }
  return NextResponse.json(body)
}
