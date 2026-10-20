'use client'

import { useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProfileView } from '@/lib/api-types'
import { errorMessage } from '@/lib/client/api'

// 프로필 하나의 로그인 상태와 [로그인 창 열기] · [상태 확인]. 상태 확인이 실패하면 그 메시지를 카드 안에 보여준다.
type Props = { profile: ProfileView; onOpenLogin(): void; onCheck(): Promise<void> }

// 프로필의 로그인 상태 배지. 설정 화면(ProfileCard)과 대시보드의 프로필 Select(PostPanel)가 함께 쓴다.
export function LoginBadge({ loggedIn }: { loggedIn: boolean }) {
  return loggedIn ? <Badge className="bg-emerald-100 text-emerald-900">로그인됨</Badge> : <Badge variant="outline">로그인 필요</Badge>
}

export function ProfileCard({ profile, onOpenLogin, onCheck }: Props) {
  const [checking, setChecking] = useState(false)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setChecking(true)
    setError(null)
    try {
      await onCheck()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="truncate">{profile.label}</span>
          <LoginBadge loggedIn={profile.loggedIn} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <p className="truncate text-sm text-muted-foreground" title={profile.channelName ?? undefined}>
          {profile.channelName ?? '확인된 채널 없음'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpened(true)
              onOpenLogin()
            }}
          >
            <ExternalLink data-icon="inline-start" />
            로그인 창 열기
          </Button>
          <Button type="button" onClick={check} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            {checking ? '확인하는 중…' : '상태 확인'}
          </Button>
        </div>
        {opened && !checking && !error && (
          <p className="text-xs text-muted-foreground">크롬 창에서 구글 로그인을 마친 뒤 창을 닫고, [상태 확인]을 누르세요.</p>
        )}
        {error && (
          <p role="alert" className="text-xs break-words text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
