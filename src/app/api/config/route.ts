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
    rising: { keyword: cfg.rising.keyword, minViews: cfg.rising.min_views, maxViews: cfg.rising.max_views,
      minViewsPerHour: cfg.rising.min_views_per_hour, publishedWithinHours: cfg.rising.published_within_hours },
  }
  return NextResponse.json(body)
}
