import { NextResponse } from 'next/server'
import { allowedChannelIds, testChannelIds } from '@/lib/config'
import { checkPostAllowed } from '@/lib/rules'
import { services } from '@/lib/services'
import { parseVideoId } from '@/lib/youtube/url'
import { toRow } from '@/lib/youtube/map'
import { getVideo, listVideos, upsertVideos } from '@/lib/repo/videos'
import { getCaptions } from '@/lib/repo/captions'
import { latestDraft } from '@/lib/repo/drafts'
import { insertPost } from '@/lib/repo/posts'
import type { VideoResponse, VideosResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function GET(req: Request) {
  const { cfg, db, youtube } = services()
  if (new URL(req.url).searchParams.get('refresh') === '1') {
    try {
      const metas = await youtube.listLatestVideos(allowedChannelIds(cfg), cfg.fetch.per_channel)
      upsertVideos(db, metas.map((m) => toRow(m, 'list')))
    } catch (err) {
      return NextResponse.json({ reason: 'upstream_error', message: `영상 목록을 불러오지 못했습니다: ${errorText(err)}` }, { status: 502 })
    }
  }
  const testIds = testChannelIds(cfg)
  const body: VideosResponse = {
    videos: listVideos(db).map((v) => ({ ...v, captionSource: getCaptions(db, v.id)?.source ?? null, hasDraft: !!latestDraft(db, v.id),
      isTestChannel: testIds.includes(v.channel_id) })),
  }
  return NextResponse.json(body)
}

// 직접 입력(Direct Link): 목록에서 고른 영상과 똑같이 허용 범위 검사를 받는다.
export async function POST(req: Request) {
  const { cfg, db, youtube } = services()
  const { url } = ((await req.json().catch(() => null)) ?? {}) as { url?: unknown }
  const id = typeof url === 'string' ? parseVideoId(url) : null
  if (!id) return NextResponse.json({ reason: 'invalid_url', message: '유튜브 영상 링크가 아닙니다' }, { status: 400 })
  let meta
  try {
    meta = await youtube.getVideo(id)
  } catch (err) {
    return NextResponse.json({ reason: 'upstream_error', message: `영상 정보를 불러오지 못했습니다: ${errorText(err)}` }, { status: 502 })
  }
  if (!meta) return NextResponse.json({ reason: 'not_found', message: '영상을 찾을 수 없습니다' }, { status: 404 })
  const verdict = checkPostAllowed({ videoChannelId: meta.channelId, allowedChannelIds: allowedChannelIds(cfg), alreadyPosted: false, successCountToday: 0, dailyMax: 1 })
  upsertVideos(db, [toRow(meta, 'direct')])   // 막힌 영상도 게시 기록에 제목이 보이도록 저장한다
  if (!verdict.allowed) {
    insertPost(db, { video_id: id, profile_id: '-', draft_id: null, text: null, status: 'blocked', reason: verdict.reason, screenshot_path: null })
    return NextResponse.json({ reason: verdict.reason, message: verdict.message }, { status: 409 })
  }
  return NextResponse.json({ video: getVideo(db, id)! } satisfies VideoResponse)
}
