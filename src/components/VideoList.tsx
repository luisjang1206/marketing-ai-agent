'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { RisingResponse, VideoView } from '@/lib/api-types'
import { cn } from '@/lib/utils'

type Props = {
  videos: VideoView[]
  selectedId: string | null
  postedIds: string[]
  loading: boolean
  onFetch(): void
  onSelect(id: string): void
  onAddLink(url: string): Promise<{ ok: boolean; message?: string }>
  mode: 'latest' | 'rising'
  onModeChange(mode: 'latest' | 'rising'): void
  rising: RisingResponse | null
  risingLoading: boolean
  onSearchRising(): void
  risingHint: string   // 예: "'연애' 48시간 · 조회수 1,000~5,000 · 시간당 150+"
}

// 'all' 전체 · 'test' 테스트 채널 · 그 밖에는 채널 ID
type Filter = 'all' | 'test' | (string & {})

function relativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}일 전`
  if (day < 365) return `${Math.floor(day / 30)}개월 전`
  return `${Math.floor(day / 365)}년 전`
}

export function VideoList({ videos, selectedId, postedIds, loading, onFetch, onSelect, onAddLink, mode, onModeChange, rising, risingLoading, onSearchRising, risingHint }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [url, setUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const posted = new Set(postedIds)
  // 테스트 채널은 "테스트" 칩 하나로 모으고, 나머지 허용 채널은 채널명 칩으로 나눈다.
  const channels = [...new Map(videos.filter((v) => !v.isTestChannel).map((v) => [v.channel_id, v.channel_title])).entries()]
  const hasTest = videos.some((v) => v.isTestChannel)
  const shown = videos.filter((v) => (filter === 'all' ? true : filter === 'test' ? v.isTestChannel : v.channel_id === filter))

  // 직접 입력으로 추가한 영상은 목록 끝쪽에 있을 수 있으니, 선택된 카드가 보이게 스크롤한다.
  useEffect(() => {
    if (selectedId) document.getElementById(`video-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, videos.length, mode, rising?.candidates.length])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (!value || adding) return
    setAdding(true)
    setNote(null)
    try {
      const r = await onAddLink(value)
      if (r.ok) {
        setUrl('')
        setFilter('all')
        setNote({ ok: true, text: r.message ?? '영상을 추가했습니다' })
      } else {
        setNote({ ok: false, text: r.message ?? '영상을 추가하지 못했습니다' })
      }
    } finally {
      setAdding(false)
    }
  }

  const chip = (key: Filter, label: string, count: number) => (
    <Button
      key={key}
      type="button"
      size="xs"
      variant={filter === key ? 'default' : 'outline'}
      aria-pressed={filter === key}
      onClick={() => setFilter(key)}
      className="max-w-40"
    >
      <span className="truncate">{label}</span>
      <span className="opacity-70">{count}</span>
    </Button>
  )

  const modeButton = (key: Props['mode'], label: string) => (
    <Button key={key} type="button" size="xs" variant={mode === key ? 'default' : 'outline'} aria-pressed={mode === key} onClick={() => onModeChange(key)}>
      {label}
    </Button>
  )

  // 영상 카드 한 장. 뜨기 직전 모드는 같은 마크업에 배지(extra)만 앞에 더한다.
  const card = (v: VideoView, extra?: ReactNode) => {
    const selected = v.id === selectedId
    return (
      <li key={v.id} id={`video-${v.id}`} className="min-w-0">
        <button
          type="button"
          onClick={() => onSelect(v.id)}
          aria-pressed={selected}
          className={cn(
            'flex w-full min-w-0 gap-3 rounded-xl bg-card p-2.5 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
            selected && 'bg-muted/40 ring-2 ring-primary hover:bg-muted/40',
          )}
        >
          {v.thumbnail_url ? (
            // 썸네일은 i.ytimg.com 원본을 그대로 쓴다(next/image 는 next.config 에 도메인 등록이 필요해 쓰지 않는다).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnail_url} alt="" loading="lazy" className="h-[54px] w-24 shrink-0 rounded-md bg-muted object-cover" />
          ) : (
            <span className="h-[54px] w-24 shrink-0 rounded-md bg-muted" aria-hidden="true" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="line-clamp-2 text-sm leading-snug font-medium break-words" title={v.title}>
              {v.title}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{v.channel_title}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0" title={v.published_at}>
                {relativeTime(v.published_at)}
              </span>
            </span>
            <span className="flex flex-wrap gap-1">
              {extra}
              {v.captionSource === 'subtitle' && <Badge variant="outline">자막</Badge>}
              {v.hasDraft && <Badge variant="secondary">초안</Badge>}
              {posted.has(v.id) && <Badge>게시됨</Badge>}
              {v.isTestChannel && <Badge className="bg-amber-100 text-amber-900">테스트</Badge>}
            </span>
          </span>
        </button>
      </li>
    )
  }

  const candidates = rising?.candidates ?? []

  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="영상 찾는 방법">
          {modeButton('latest', '허용 채널 최신')}
          {modeButton('rising', '뜨기 직전')}
        </div>

        {mode === 'latest' ? (
          <>
            <div className="flex items-center gap-3">
              <Button type="button" onClick={onFetch} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                {loading ? '불러오는 중…' : '불러오기'}
              </Button>
              <span className="text-xs text-muted-foreground">영상 {videos.length}개</span>
            </div>

            {videos.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="채널별 보기">
                {chip('all', '전체', videos.length)}
                {hasTest && chip('test', '테스트', videos.filter((v) => v.isTestChannel).length)}
                {channels.map(([id, title]) => chip(id, title, videos.filter((v) => v.channel_id === id).length))}
              </div>
            )}

            {loading && videos.length === 0 ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
                ))}
              </div>
            ) : videos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                아직 불러온 영상이 없습니다. [불러오기]를 누르면 허용 채널의 최신 영상을 가져옵니다.
              </p>
            ) : (
              <ul className="flex max-h-[28rem] min-h-40 flex-col gap-2 overflow-y-auto pr-1">
                {shown.map((v) => card(v))}
                {shown.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">이 채널의 영상이 없습니다.</li>}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button type="button" onClick={onSearchRising} disabled={risingLoading}>
                {risingLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                {risingLoading ? '찾는 중…' : '뜨기 직전 찾기'}
              </Button>
              <span className="min-w-0 text-xs text-muted-foreground">{risingHint}</span>
            </div>

            {/* 저장된 검색 결과를 아직 못 읽었으면(rising === null) 상태 줄을 비운다. */}
            {rising && (
              <p role="status" className="text-xs text-muted-foreground">
                {rising.searchedAt
                  // DB 가 'YYYY-MM-DD HH:mm:ss'(로컬 시각)로 주므로 'T' 로 바꿔 어느 브라우저에서나 로컬 시각으로 읽게 한다.
                  ? `마지막 검색 ${relativeTime(rising.searchedAt.replace(' ', 'T'))} · 훑은 영상 ${rising.scanned}개 · 후보 ${candidates.length}개`
                  : '아직 검색하지 않았습니다'}
              </p>
            )}

            {risingLoading && candidates.length === 0 ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
                ))}
              </div>
            ) : candidates.length > 0 ? (
              <ul className="flex max-h-[28rem] min-h-40 flex-col gap-2 overflow-y-auto pr-1">
                {candidates.map((v) =>
                  card(
                    v,
                    <Badge className="bg-sky-100 text-sky-900 tabular-nums">
                      {`조회수 ${v.view_count.toLocaleString('ko-KR')} · 시간당 +${Math.round(v.viewsPerHour)}`}
                    </Badge>,
                  ),
                )}
              </ul>
            ) : rising?.searchedAt ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                조건에 맞는 영상이 없습니다. 잠시 뒤 다시 찾아보세요
              </p>
            ) : null}
          </>
        )}

        <form onSubmit={submit} className="flex flex-col gap-1.5 border-t pt-3">
          <label htmlFor="direct-link" className="text-xs font-medium text-muted-foreground">
            링크 직접 입력
          </label>
          <div className="flex gap-2">
            <Input
              id="direct-link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={adding}
              autoComplete="off"
            />
            <Button type="submit" variant="outline" disabled={adding || !url.trim()}>
              {adding ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              추가
            </Button>
          </div>
          {note && (
            <p role={note.ok ? 'status' : 'alert'} className={cn('text-xs break-words', note.ok ? 'text-muted-foreground' : 'text-destructive')}>
              {note.text}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
