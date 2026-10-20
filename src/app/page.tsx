'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import { CircleAlert, Settings } from 'lucide-react'
import { DraftPanel } from '@/components/DraftPanel'
import { PostLog } from '@/components/PostLog'
import { PostPanel } from '@/components/PostPanel'
import { StepHeader } from '@/components/StepHeader'
import { VideoList } from '@/components/VideoList'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ConfigResponse, DraftResponse, JobResponse, LogResponse, ProfilesResponse, VideosResponse } from '@/lib/api-types'
import { KEYS, addVideoLink, errorMessage, fetcher, getVideos, requestDraft, startPost } from '@/lib/client/api'
import { checkPostAllowed } from '@/lib/rules'
import { cn } from '@/lib/utils'

const isJobDone = (state: JobResponse['job']['state']) => state === 'verified' || state === 'failed'

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription className="break-words">{message}</AlertDescription>
    </Alert>
  )
}

export default function Home() {
  // 읽기 상태는 모두 swr 이다. 진행 상태의 원본은 서버(jobs 표)이고, 화면에는 jobId 만 들고 있다.
  const { data: config, error: configError } = useSWR<ConfigResponse>(KEYS.config, fetcher, { revalidateOnFocus: false })
  const { data: videosData, isLoading: videosLoading } = useSWR<VideosResponse>(KEYS.videos, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })
  // swr 는 새로고침 요청도 dedupingInterval(기본 2초) 안에서는 합친다. 갱신 간격보다 짧게 줘야 간격대로 읽는다.
  const { data: log } = useSWR<LogResponse>(KEYS.log, fetcher, { refreshInterval: 2000, dedupingInterval: 1000 })
  const { data: profilesData } = useSWR<ProfilesResponse>(KEYS.profiles, fetcher, { refreshInterval: 5000 })

  const [pickedId, setPickedId] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<string>('auto')
  const [jobId, setJobId] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [videosError, setVideosError] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [draftActionError, setDraftActionError] = useState<{ videoId: string; message: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  // 진행 중인 게시(다른 탭에서 시작했거나 새로고침한 경우 포함)가 있으면 그것을 따라간다.
  const currentJobId = log?.activeJobId ?? jobId
  const { data: jobData, error: jobError } = useSWR<JobResponse>(currentJobId ? KEYS.job(currentJobId) : null, fetcher, {
    // 끝났거나 읽지 못하면 멈춘다. 끝나면 게시 기록과 오늘 카운트를 바로 갱신한다.
    refreshInterval: (latest) => (latest && !isJobDone(latest.job.state) ? 500 : 0),
    dedupingInterval: 250,
    onSuccess: (d) => {
      if (isJobDone(d.job.state)) void mutate(KEYS.log)
    },
  })
  const job = jobData?.job ?? null
  const jobRunning = currentJobId !== null && !jobError && (job ? !isJobDone(job.state) : true)
  const busy = starting || jobRunning

  const videos = videosData?.videos ?? []
  const postedIds = log?.postedVideoIds ?? []
  const selectedId = pickedId ?? (job && !isJobDone(job.state) ? job.video_id : null)
  const video = videos.find((v) => v.id === selectedId) ?? null

  const { data: draftData, error: draftError, isLoading: draftLoading } = useSWR<DraftResponse>(
    video ? KEYS.draft(video.id) : null,
    ([, id]: readonly ['draft', string]) => requestDraft(id, false),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,   // 초안 생성은 유료 호출이라 실패해도 저절로 다시 부르지 않는다
      onSuccess: () => void mutate(KEYS.videos),
    },
  )
  const draft = draftData?.draft ?? null
  const regenerating = !!video && regeneratingId === video.id
  const draftMessage = (draftActionError && video && draftActionError.videoId === video.id ? draftActionError.message : null)
    ?? (draftError ? errorMessage(draftError) : null)

  const todayCount = log?.todayCount ?? 0
  // 같은 함수(rules.ts)로 서버처럼 미리 검사한다. 서버는 어쨌든 다시 검사한다.
  const verdict = video && config && log
    ? checkPostAllowed({
        videoChannelId: video.channel_id,
        allowedChannelIds: config.allowedChannelIds,
        alreadyPosted: postedIds.includes(video.id),
        successCountToday: todayCount,
        dailyMax: config.dailyMax,
      })
    : null
  const capReached = !!config && todayCount >= config.dailyMax

  async function fetchVideos() {
    setFetching(true)
    setVideosError(null)
    try {
      await mutate(KEYS.videos, await getVideos(true), { revalidate: false })
    } catch (err) {
      setVideosError(errorMessage(err))
    } finally {
      setFetching(false)
    }
  }

  async function addLink(url: string) {
    try {
      const r = await addVideoLink(url)
      await mutate(KEYS.videos)
      setPickedId(r.video.id)
      setPostError(null)
      return { ok: true, message: '영상을 추가하고 골랐습니다' }
    } catch (err) {
      void mutate(KEYS.log)   // 허용 범위 밖이면 서버가 게시 기록에 차단 행을 남긴다
      return { ok: false, message: errorMessage(err) }
    }
  }

  async function regenerate() {
    if (!video) return
    const id = video.id
    setRegeneratingId(id)
    setDraftActionError(null)
    try {
      await mutate(KEYS.draft(id), await requestDraft(id, true), { revalidate: false })
      void mutate(KEYS.videos)
    } catch (err) {
      setDraftActionError({ videoId: id, message: errorMessage(err) })
    } finally {
      setRegeneratingId(null)
    }
  }

  async function post() {
    if (!video) return
    setStarting(true)
    setPostError(null)
    try {
      const r = await startPost(video.id, selectedProfile === 'auto' ? undefined : selectedProfile)
      setJobId(r.jobId)
    } catch (err) {
      setPostError(errorMessage(err))
    } finally {
      setStarting(false)
      void mutate(KEYS.log)   // 차단되면 게시 기록에 차단 행이 생긴다
    }
  }

  return (
    <TooltipProvider>
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3">
          <h1 className="text-lg font-semibold">유튜브 댓글 에이전트</h1>
          <Badge variant={capReached ? 'destructive' : 'secondary'} className="tabular-nums">
            오늘 게시 {todayCount}/{config?.dailyMax ?? '–'}
          </Badge>
          <Link href="/settings" className={cn(buttonVariants({ variant: 'ghost' }), 'ml-auto')}>
            <Settings data-icon="inline-start" />
            프로필 설정
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-5">
        {configError && <ErrorAlert message={`설정을 불러오지 못했습니다: ${errorMessage(configError)}`} />}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <section className="flex min-w-0 flex-col gap-3" aria-label="영상 불러오기">
            <StepHeader n={1} title="영상 불러오기" hint="버튼 한 번에 허용 채널 최신 영상" />
            {videosError && <ErrorAlert message={videosError} />}
            <VideoList
              videos={videos}
              selectedId={selectedId}
              postedIds={postedIds}
              loading={fetching || videosLoading}
              onFetch={() => void fetchVideos()}
              onSelect={(id) => {
                setPickedId(id)
                setPostError(null)
              }}
              onAddLink={addLink}
            />
          </section>

          <section className="flex min-w-0 flex-col gap-3" aria-label="영상 선택">
            <StepHeader n={2} title="영상 선택" hint="목록에서 고르면 AI가 초안을 씁니다" />
            {draftMessage && <ErrorAlert message={draftMessage} />}
            <DraftPanel
              video={video}
              draft={draft}
              captionSource={draftData?.captionSource ?? null}
              loading={draftLoading || regenerating}
              onRegenerate={() => void regenerate()}
              maxChars={config?.comment.max}
            />
          </section>

          <section className="flex min-w-0 flex-col gap-3" aria-label="댓글 달기">
            <StepHeader n={3} title="댓글 달기" hint="프로필을 골라 누르면 크롬이 열립니다" />
            {postError && <ErrorAlert message={postError} />}
            <PostPanel
              profiles={profilesData?.profiles ?? []}
              selectedProfile={selectedProfile}
              onProfileChange={setSelectedProfile}
              verdict={verdict}
              draftValid={!!draft?.valid && !draftLoading && !regenerating}
              job={job && video && job.video_id === video.id ? job : null}
              busy={busy}
              onPost={() => void post()}
            />
          </section>
        </div>

        <section className="flex min-w-0 flex-col gap-2" aria-labelledby="post-log-title">
          <h2 id="post-log-title" className="text-base font-semibold">
            게시 기록 <span className="text-sm font-normal text-muted-foreground">최신순</span>
          </h2>
          <Card className="min-w-0">
            <CardContent className="px-0">
              <PostLog rows={log?.posts ?? []} profileLabels={Object.fromEntries((config?.profiles ?? []).map((p) => [p.id, p.label]))} />
            </CardContent>
          </Card>
        </section>
      </main>
    </TooltipProvider>
  )
}
