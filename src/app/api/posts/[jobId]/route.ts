import { NextResponse } from 'next/server'
import { services } from '@/lib/services'
import { getJob } from '@/lib/repo/jobs'
import type { JobResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { db } = services()
  const { jobId } = await params
  const job = getJob(db, jobId)
  if (!job) return NextResponse.json({ reason: 'job_not_found', message: '게시 작업을 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json({ job } satisfies JobResponse)
}
