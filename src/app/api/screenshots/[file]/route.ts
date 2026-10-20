import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { screenshotDir } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// data/screenshots/<file> 을 image/png 로 돌려준다. 게시 캡처는 <jobId>.png 한 종류뿐이다.
// 경로 탈출을 막으려고 path.basename 만 받고, 확장자도 .png 로 제한한다.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const name = path.basename(file)
  const notFound = () => NextResponse.json({ reason: 'not_found', message: '캡처를 찾을 수 없습니다' }, { status: 404 })
  if (!name.toLowerCase().endsWith('.png')) return notFound()
  try {
    const bytes = await readFile(path.join(screenshotDir(), name))
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  } catch {
    return notFound()
  }
}
