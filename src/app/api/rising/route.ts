import { NextResponse } from 'next/server'
import { testChannelIds } from '@/lib/config'
import { services } from '@/lib/services'
import { assessRising, publishedAfterIso } from '@/lib/youtube/rising'
import { toRow } from '@/lib/youtube/map'
import { upsertVideos } from '@/lib/repo/videos'
import { getCaptions } from '@/lib/repo/captions'
import { latestDraft } from '@/lib/repo/drafts'
import { insertRisingSearch, latestRisingSearch, listRisingCandidates } from '@/lib/repo/rising'
import type { RisingResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

// 화면에 보이는 최신 검색 한 건. 후보의 view_count 는 검색 시점 스냅샷이다(listRisingCandidates 참고).
function currentRising(): RisingResponse {
  const { cfg, db } = services()
  const s = latestRisingSearch(db)
  if (!s) return { keyword: cfg.rising.keyword, searchedAt: null, scanned: 0, candidates: [] }
  const testIds = testChannelIds(cfg)
  return {
    keyword: s.keyword, searchedAt: s.searched_at, scanned: s.scanned,
    candidates: listRisingCandidates(db, s.id).map((r) => ({
      ...r, captionSource: getCaptions(db, r.id)?.source ?? null, hasDraft: !!latestDraft(db, r.id), isTestChannel: testIds.includes(r.channel_id),
      viewsPerHour: r.views_per_hour, hoursSincePublish: r.hours_since_publish,
    })),
  }
}

export async function GET() {
  return NextResponse.json(currentRising())
}

// 버튼 한 번에 search.list 를 cfg.rising.pages 번 부른다(페이지당 100유닛). 자동 갱신은 없다.
export async function POST() {
  const { cfg, db, youtube } = services()
  const now = new Date()
  const rules = { minViews: cfg.rising.min_views, maxViews: cfg.rising.max_views, minViewsPerHour: cfg.rising.min_views_per_hour }
  let metas
  try {
    metas = await youtube.searchRecentVideos(cfg.rising.keyword, publishedAfterIso(now, cfg.rising.published_within_hours), cfg.rising.pages)
  } catch (err) {
    return NextResponse.json({ reason: 'upstream_error', message: `뜨기 직전 영상을 찾지 못했습니다: ${errorText(err)}` }, { status: 502 })
  }
  const rising = metas.map((meta) => ({ meta, a: assessRising(meta, now, rules) })).filter((x) => x.a.rising)
  // 후보만 저장한다. 이미 목록·직접 입력으로 저장된 영상은 upsert 가 source 를 바꾸지 않아 원래 source 를 유지한다.
  upsertVideos(db, rising.map((x) => toRow(x.meta, 'rising')))
  insertRisingSearch(db, { keyword: cfg.rising.keyword, scanned: metas.length, found: rising.length },
    rising.map((x) => ({ video_id: x.meta.id, view_count: x.meta.viewCount, hours_since_publish: x.a.hoursSincePublish, views_per_hour: x.a.viewsPerHour })))
  return NextResponse.json(currentRising())
}
