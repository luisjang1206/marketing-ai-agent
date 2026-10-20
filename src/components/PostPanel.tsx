'use client'

import Link from 'next/link'
import { Check, CircleAlert, ExternalLink, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { JobResponse, ProfileView } from '@/lib/api-types'
import { screenshotUrl, watchUrl } from '@/lib/client/api'
import type { RuleVerdict } from '@/lib/rules'
import { cn } from '@/lib/utils'

// 클라이언트 파일은 repo 모듈을 가져오지 않는다. 같은 타입을 api-types 응답에서 꺼낸다.
type JobRow = JobResponse['job']
type JobState = JobRow['state']

// verdict 는 클라이언트의 checkPostAllowed 결과(영상을 아직 안 골랐으면 null)다.
type Props = {
  profiles: ProfileView[]
  selectedProfile: string | 'auto'
  onProfileChange(v: string | 'auto'): void
  verdict: RuleVerdict | null
  draftValid: boolean
  job: JobRow | null
  busy: boolean
  onPost(): void
}

const AUTO = 'auto'

// 진행 상태: 프로필 여는 중 → 입력 중 → 게시 완료 → 댓글 보기. job.state 가 queued 이면 첫 단계가 대기 중이다.
const STEPS: { label: string; state: JobState }[] = [
  { label: '프로필 여는 중', state: 'opening_profile' },
  { label: '입력 중', state: 'typing' },
  { label: '게시 완료', state: 'posted' },
  { label: '댓글 보기', state: 'verified' },
]
const CURRENT_STEP: Record<JobState, number> = { queued: 0, opening_profile: 0, typing: 1, posted: 2, verified: 3, failed: -1 }

type StepStatus = 'done' | 'active' | 'idle'
function stepStatus(job: JobRow | null, i: number): StepStatus {
  if (!job || job.state === 'failed') return 'idle'
  if (job.state === 'verified') return 'done'
  const cur = CURRENT_STEP[job.state]
  return i < cur ? 'done' : i === cur ? 'active' : 'idle'
}

function Stepper({ job }: { job: JobRow | null }) {
  return (
    <ol className="grid grid-cols-4" aria-label="진행 상태">
      {STEPS.map((s, i) => {
        const status = stepStatus(job, i)
        return (
          <li
            key={s.state}
            aria-current={status === 'active' ? 'step' : undefined}
            className={cn(
              'relative flex min-w-0 flex-col items-center gap-1.5 text-center',
              // 앞 단계와 이어지는 선. 지나온 구간은 진하게 칠한다.
              i > 0 && "before:absolute before:top-3.5 before:right-1/2 before:left-[-50%] before:h-px before:bg-border before:content-['']",
              i > 0 && status !== 'idle' && 'before:bg-primary',
            )}
          >
            <span
              className={cn(
                'relative z-10 flex size-7 items-center justify-center rounded-full text-xs font-medium ring-1',
                status === 'done' && 'bg-primary text-primary-foreground ring-primary',
                status === 'active' && 'bg-background text-primary ring-2 ring-primary',
                status === 'idle' && 'bg-muted text-muted-foreground ring-border',
              )}
            >
              {status === 'done' ? <Check className="size-3.5" /> : status === 'active' ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
            </span>
            <span className={cn('text-xs break-keep', status === 'idle' ? 'text-muted-foreground' : 'font-medium')}>{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Capture({ screenshotPath }: { screenshotPath: string | null }) {
  const src = screenshotUrl(screenshotPath)
  if (!src) return null
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-foreground/10" title="캡처를 새 탭에서 열기">
      {/* 같은 출처의 캡처 파일이라 next/image 최적화는 쓰지 않는다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="게시 결과 화면 캡처" className="max-h-72 w-full bg-muted object-contain object-top" />
    </a>
  )
}

function LoginBadge({ loggedIn }: { loggedIn: boolean }) {
  return loggedIn ? <Badge className="bg-emerald-100 text-emerald-900">로그인됨</Badge> : <Badge variant="outline">로그인 필요</Badge>
}

// 댓글 달기 버튼을 못 누르는 이유. 위에서부터 먼저 걸리는 것 하나만 말한다.
function disabledReason(p: Pick<Props, 'verdict' | 'draftValid' | 'busy'>): string | null {
  if (!p.verdict) return '영상을 고르면 댓글을 달 수 있습니다'
  if (!p.verdict.allowed) return p.verdict.message
  if (p.busy) return '게시가 진행 중입니다'
  if (!p.draftValid) return '검증을 통과한 댓글 초안이 필요합니다'
  return null
}

export function PostPanel({ profiles, selectedProfile, onProfileChange, verdict, draftValid, job, busy, onPost }: Props) {
  const options = [
    { value: AUTO, label: '자동(돌아가며)', loggedIn: null as boolean | null },
    ...profiles.map((p) => ({ value: p.id, label: p.label, loggedIn: p.loggedIn as boolean | null })),
  ]
  const optionOf = (value: string | null) => options.find((o) => o.value === value) ?? options[0]
  const selected = optionOf(selectedProfile)
  const anyLoggedIn = profiles.some((p) => p.loggedIn)

  const disabled = !draftValid || !verdict?.allowed || busy
  const reason = disabled ? disabledReason({ verdict, draftValid, busy }) : null

  const profileHint =
    selected.value === AUTO ? (
      anyLoggedIn ? (
        '마지막으로 쓴 프로필의 다음 순서로, 로그인된 프로필을 고릅니다.'
      ) : (
        <>
          로그인된 프로필 없음 —{' '}
          <Link href="/settings" className="underline underline-offset-2">
            프로필 설정
          </Link>
          에서 로그인하세요.
        </>
      )
    ) : selected.loggedIn ? null : (
      '로그인이 확인되지 않은 프로필입니다. 게시에 실패할 수 있습니다.'
    )

  return (
    <Card className="min-w-0">
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-select" className="text-xs font-medium text-muted-foreground">
            프로필
          </label>
          <Select
            items={options}
            value={selectedProfile}
            onValueChange={(v) => onProfileChange(typeof v === 'string' && v ? v : AUTO)}
          >
            <SelectTrigger id="profile-select" className="w-full">
              <SelectValue>
                {(v: string | null) => {
                  const o = optionOf(v)
                  return (
                    <>
                      <span>{o.label}</span>
                      {o.loggedIn !== null && <LoginBadge loggedIn={o.loggedIn} />}
                    </>
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <span>{o.label}</span>
                  {o.loggedIn !== null && <LoginBadge loggedIn={o.loggedIn} />}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {profileHint && <p className="text-xs break-words text-muted-foreground">{profileHint}</p>}
        </div>

        {/* 비활성 버튼은 포인터 이벤트를 받지 않으므로, 툴팁은 버튼을 감싼 span 에 건다. */}
        <Tooltip>
          <TooltipTrigger render={<span className="block w-full" tabIndex={disabled ? 0 : undefined} />}>
            <Button type="button" size="lg" className="w-full" disabled={disabled} onClick={onPost}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              댓글 달기
            </Button>
          </TooltipTrigger>
          {reason && <TooltipContent>{reason}</TooltipContent>}
        </Tooltip>
        {reason && (
          <p className="-mt-2 text-xs break-words text-muted-foreground" aria-live="polite">
            {reason}
          </p>
        )}

        <Stepper job={job} />

        {job?.state === 'failed' && (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>게시하지 못했습니다</AlertTitle>
              <AlertDescription className="break-words">{job.message ?? '알 수 없는 이유로 게시하지 못했습니다'}</AlertDescription>
            </Alert>
            <Capture screenshotPath={job.screenshot_path} />
          </div>
        )}

        {job?.state === 'verified' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">댓글을 달았고, 내 댓글이 보이는 것을 확인했습니다.</p>
            <Capture screenshotPath={job.screenshot_path} />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              nativeButton={false}
              render={<a href={watchUrl(job.video_id)} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink data-icon="inline-start" />
              영상에서 보기
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
