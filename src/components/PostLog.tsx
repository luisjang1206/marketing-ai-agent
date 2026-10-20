'use client'

import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FailureReason, LogResponse } from '@/lib/api-types'
import { screenshotUrl, watchUrl } from '@/lib/client/api'
import type { RuleReason } from '@/lib/rules'

// 클라이언트 파일은 repo 모듈을 가져오지 않는다. 같은 타입을 api-types 응답에서 꺼낸다.
type PostLogRow = LogResponse['posts'][number]

// profileLabels 는 이슈의 컴포넌트 계약에 없는 선택 속성이다: 기록에는 프로필 id(p1…)만 있어 설정의 라벨(유튜브1…)로 바꿔 보여준다.
type Props = { rows: PostLogRow[]; profileLabels?: Record<string, string> }

// 차단은 운영 규칙 코드, 실패는 실패 사유 코드가 posts.reason 에 들어간다.
// 실패 사유 라벨은 poster.ts 의 FAILURE_LABELS 와 같은 문구다. 그 모듈은 playwright 를 가져와 클라이언트에서 쓸 수 없어
// 타입만 api-types 를 거쳐 가져오고(번들에 남지 않음), 키가 빠지면 컴파일에서 잡는다.
const REASON_LABELS: Record<RuleReason | FailureReason, string> = {
  not_allowed_channel: '허용 채널의 영상이 아님',
  already_posted: '이미 댓글을 단 영상',
  daily_cap_reached: '하루 상한 도달',
  not_logged_in: '로그인 안 됨',
  comments_disabled: '댓글 비활성 영상',
  element_not_found: '요소 못 찾음',
  timeout: '시간 초과',
  unknown: '알 수 없음',
}
const reasonLabel = (reason: string | null) => (reason ? (REASON_LABELS as Record<string, string>)[reason] ?? reason : '')

const STATUS: Record<PostLogRow['status'], { label: string; badge: string }> = {
  success: { label: '성공', badge: 'bg-emerald-100 text-emerald-900' },
  failed: { label: '실패', badge: 'bg-destructive/10 text-destructive' },
  blocked: { label: '차단', badge: 'bg-amber-100 text-amber-900' },
}

// created_at 은 서버 로컬 시각 "YYYY-MM-DD HH:MM:SS" 다.
const formatTime = (createdAt: string) => createdAt.slice(5, 16)

export function PostLog({ rows, profileLabels }: Props) {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-32">시각</TableHead>
          <TableHead className="w-[24%]">영상</TableHead>
          <TableHead className="w-24">프로필</TableHead>
          <TableHead className="w-[30%]">댓글</TableHead>
          <TableHead className="w-20">결과</TableHead>
          <TableHead>사유</TableHead>
          <TableHead className="w-16">캡처</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
              아직 게시 기록이 없습니다.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => {
            const shot = screenshotUrl(r.screenshot_path)
            const status = STATUS[r.status]
            const title = r.video_title ?? r.video_id
            return (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground tabular-nums">{formatTime(r.created_at)}</TableCell>
                <TableCell className="truncate" title={title}>
                  <a href={watchUrl(r.video_id)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    {title}
                  </a>
                </TableCell>
                <TableCell className="truncate">{profileLabels?.[r.profile_id] ?? (r.profile_id === '-' ? '—' : r.profile_id)}</TableCell>
                <TableCell className="truncate" title={r.text ?? undefined}>
                  {r.text ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Badge className={status.badge}>{status.label}</Badge>
                </TableCell>
                <TableCell className="truncate text-muted-foreground" title={reasonLabel(r.reason)}>
                  {reasonLabel(r.reason)}
                </TableCell>
                <TableCell>
                  {shot ? (
                    <a href={shot} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                      보기
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
