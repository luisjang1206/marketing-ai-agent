import { NextResponse } from 'next/server'
import { profilesOf } from '@/lib/config'
import { profileDir } from '@/lib/paths'
import { services } from '@/lib/services'
import { openForLogin } from '@/lib/browser/profiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 사람이 로그인하고 창을 닫을 때까지 끝나지 않으므로 기다리지 않고 202 를 돌려준다.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { cfg } = services()
  const { id } = await params
  const profile = profilesOf(cfg).find((p) => p.id === id)
  if (!profile) return NextResponse.json({ reason: 'profile_not_found', message: '프로필을 찾을 수 없습니다' }, { status: 404 })
  // 프로필 디렉터리가 이미 열려 있거나 Chrome 이 없으면 실패한다. 잡지 않으면 서버 프로세스에 unhandled rejection 이 남는다.
  openForLogin(profileDir(profile.index)).catch((err) => console.error(`${profile.label} 로그인 창을 열지 못했습니다:`, err))
  return NextResponse.json({ ok: true }, { status: 202 })
}
