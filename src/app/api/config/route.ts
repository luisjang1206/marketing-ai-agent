import { NextResponse } from 'next/server'
import { allowedChannelIds, profilesOf, testChannelIds } from '@/lib/config'
import { services } from '@/lib/services'
import type { ConfigResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { cfg } = services()
  const body: ConfigResponse = {
    profiles: profilesOf(cfg), dailyMax: cfg.limits.daily_max_comments,
    allowedChannelIds: allowedChannelIds(cfg), testChannelIds: testChannelIds(cfg),
    comment: { min: cfg.comment.min_chars, max: cfg.comment.max_chars, brand: cfg.comment.brand },
  }
  return NextResponse.json(body)
}
