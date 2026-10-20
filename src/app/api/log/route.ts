import { NextResponse } from 'next/server'
import { services } from '@/lib/services'
import { listPosts, postedVideoIds, successCountToday } from '@/lib/repo/posts'
import { activeJob } from '@/lib/repo/jobs'
import type { LogResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { db, today } = services()
  const body: LogResponse = {
    posts: listPosts(db, 100), todayCount: successCountToday(db, today()),
    postedVideoIds: postedVideoIds(db), activeJobId: activeJob(db)?.id ?? null,
  }
  return NextResponse.json(body)
}
