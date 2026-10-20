'use client'

import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DraftResponse, VideoView } from '@/lib/api-types'
import { VIOLATION_LABELS, type Violation } from '@/lib/draft/validate'
import { cn } from '@/lib/utils'

// 클라이언트 파일은 repo 모듈을 가져오지 않는다. 같은 타입을 api-types 응답에서 꺼낸다.
type DraftRow = DraftResponse['draft']
type CaptionSource = DraftResponse['captionSource']

// maxChars 는 이슈의 컴포넌트 계약에 없는 선택 속성이다: 글자수 "N/최대" 의 최대를 설정(comment.max_chars)에서만 받는다. 설정을 아직 못 읽었으면 분모 없이 "글자수 N" 만 보인다.
type Props = {
  video: VideoView | null
  draft: DraftRow | null
  captionSource: CaptionSource
  loading: boolean
  onRegenerate(): void
  maxChars?: number
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      {children}
    </div>
  )
}

export function DraftPanel({ video, draft, captionSource, loading, onRegenerate, maxChars }: Props) {
  if (!video) {
    return (
      <Card className="min-w-0">
        <CardContent>
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            왼쪽 목록에서 영상을 고르면 AI가 댓글 초안을 씁니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  const length = draft ? [...draft.text.trim()].length : 0
  const lengthBad = !!draft && (draft.violations.includes('too_short') || draft.violations.includes('too_long'))

  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 gap-3">
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.thumbnail_url} alt="" className="h-[54px] w-24 shrink-0 rounded-md bg-muted object-cover" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="line-clamp-2 text-sm leading-snug font-medium break-words" title={video.title}>
              {video.title}
            </p>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{video.channel_title}</span>
              {video.isTestChannel && <Badge className="bg-amber-100 text-amber-900">테스트</Badge>}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="댓글 초안을 쓰는 중">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-20 w-full" />
            </div>
            <p className="text-xs text-muted-foreground">영상 내용을 읽고 댓글 초안을 쓰는 중입니다…</p>
          </div>
        ) : draft ? (
          <>
            <Field label="고민 한 줄">
              <p className="text-sm break-words">{draft.concern}</p>
            </Field>
            <Field label="근거 장면">
              <p className="text-sm break-words">{draft.evidence}</p>
            </Field>
            <Field label="댓글 초안">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{draft.text}</div>
              <div className="flex items-center justify-between gap-2 text-xs">
                {/* 스펙 §7.1: "자막 있음 / 자막 없음 → 제목·설명·댓글로 작성". 자막을 아직 확인하지 못했으면(null) 배지를 달지 않는다. */}
                {captionSource === 'subtitle' ? (
                  <Badge variant="outline">자막 있음</Badge>
                ) : captionSource === 'none' ? (
                  <Badge variant="outline">자막 없음 → 제목·설명·댓글로 작성</Badge>
                ) : (
                  <span />
                )}
                <span className={cn('shrink-0 tabular-nums', lengthBad ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  글자수 {length}
                  {maxChars !== undefined && `/${maxChars}`}
                </span>
              </div>
            </Field>
            <Field label="검증">
              <div className="flex flex-wrap gap-1.5">
                {draft.valid ? (
                  <Badge className="bg-emerald-100 text-emerald-900">검증 통과</Badge>
                ) : (
                  draft.violations.map((v) => (
                    <Badge key={v} variant="destructive">
                      {VIOLATION_LABELS[v as Violation] ?? v}
                    </Badge>
                  ))
                )}
              </div>
            </Field>
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            아직 댓글 초안이 없습니다. [다시 생성]을 눌러 초안을 쓰게 하세요.
          </p>
        )}

        <Button type="button" variant="outline" onClick={onRegenerate} disabled={loading} className="self-start">
          <RefreshCw data-icon="inline-start" className={cn(loading && 'animate-spin')} />
          다시 생성
        </Button>
      </CardContent>
    </Card>
  )
}
