import { NextResponse } from 'next/server'
import { services } from '@/lib/services'
import { captionDir } from '@/lib/paths'
import { fetchCaptions } from '@/lib/youtube/captions'
import { generateDraft } from '@/lib/draft/generate'
import { getVideo } from '@/lib/repo/videos'
import { getCaptions, saveCaptions } from '@/lib/repo/captions'
import { insertDraft, latestDraft, recentChannelDraftTexts } from '@/lib/repo/drafts'
import type { DraftResponse } from '@/lib/api-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { cfg, db, youtube, llm, model } = services()
  const { id } = await params
  const video = getVideo(db, id)
  if (!video) return NextResponse.json({ reason: 'not_found', message: '영상을 찾을 수 없습니다' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as { regenerate?: unknown } | null

  // 검증을 통과한 초안이 있으면 다시 생성하지 않는 한 그대로 돌려준다.
  const cached = latestDraft(db, id)
  if (cached?.valid && body?.regenerate !== true) {
    return NextResponse.json({ draft: cached, captionSource: getCaptions(db, id)?.source ?? null } satisfies DraftResponse)
  }

  try {
    const captions = await fetchCaptions(id, { outDir: captionDir() })
    saveCaptions(db, id, captions.text, captions.source)
    const topComments = await youtube.getTopComments(id)
    // 같은 영상의 최신 초안을 맨 앞에 두고, 같은 채널 최근 초안에서 그것을 뺀 나머지를 잇는다(이슈 13). 다시 생성하면 짜임이 바뀐다.
    const channelDrafts = recentChannelDraftTexts(db, video.channel_id)
    const recentDrafts = cached ? [cached.text, ...channelDrafts.filter((t) => t !== cached.text)] : channelDrafts
    const { draft, validation } = await generateDraft(
      { video: { title: video.title, description: video.description, channelTitle: video.channel_title },
        captions: captions.source === 'subtitle' ? captions.text : null, topComments, recentDrafts },
      { rules: { minChars: cfg.comment.min_chars, maxChars: cfg.comment.max_chars, brand: cfg.comment.brand, bannedPhrases: cfg.comment.banned_phrases },
        brandPhrases: cfg.comment.brand_phrases },
      llm)
    insertDraft(db, { video_id: id, concern: draft.concern, evidence: draft.evidence, text: draft.text, valid: validation.ok, violations: validation.violations, model })
    return NextResponse.json({ draft: latestDraft(db, id)!, captionSource: captions.source } satisfies DraftResponse)
  } catch (err) {
    return NextResponse.json({ reason: 'upstream_error', message: `댓글 초안을 만들지 못했습니다: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }
}
