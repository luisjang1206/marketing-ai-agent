'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, CircleAlert } from 'lucide-react'
import { ProfileCard } from '@/components/ProfileCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants } from '@/components/ui/button'
import type { ProfilesResponse } from '@/lib/api-types'
import { KEYS, checkProfileLogin, errorMessage, fetcher, openProfileLogin } from '@/lib/client/api'

export default function SettingsPage() {
  const { data, error, mutate } = useSWR<ProfilesResponse>(KEYS.profiles, fetcher, { refreshInterval: 5000 })
  const [loginError, setLoginError] = useState<string | null>(null)

  async function openLogin(profileId: string) {
    setLoginError(null)
    try {
      await openProfileLogin(profileId)
    } catch (err) {
      setLoginError(errorMessage(err))
    }
  }

  // 실패하면 오류를 그대로 올려 보내, 카드가 자기 안에 메시지를 보여준다.
  async function check(profileId: string) {
    await checkProfileLogin(profileId)
    await mutate()
  }

  const message = loginError ?? (error ? errorMessage(error) : null)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/" className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft data-icon="inline-start" />
          대시보드
        </Link>
        <h1 className="text-lg font-semibold">프로필 설정</h1>
      </div>

      <section className="flex flex-col gap-1 rounded-xl bg-muted/50 p-4 text-sm">
        <p className="font-medium">로그인 창 열기 → 구글 로그인 → 창 닫기 → 상태 확인</p>
        <p className="text-muted-foreground">
          프로필마다 서로 다른 구글 계정으로 한 번만 로그인해 두면 됩니다. 로그인 창을 닫기 전에는 상태를 확인할 수 없습니다.
        </p>
      </section>

      {message && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription className="break-words">{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        {data
          ? data.profiles.map((p) => (
              <ProfileCard key={p.id} profile={p} onOpenLogin={() => void openLogin(p.id)} onCheck={() => check(p.id)} />
            ))
          : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    </main>
  )
}
