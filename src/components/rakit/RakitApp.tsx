'use client'

/**
 * RakitApp — root client component: auth gate → onboarding gate → shell.
 */

import * as React from 'react'
import { useRakit } from '@/components/rakit/store'
import { AuthScreen } from '@/components/rakit/AuthScreen'
import { Onboarding } from '@/components/rakit/Onboarding'
import { Shell } from '@/components/rakit/Shell'

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <p className="font-display text-3xl font-bold tracking-tight">
          RAKIT<span className="text-brand">.</span>
        </p>
        <p className="kicker mt-2 animate-pulse">Menyiapkan ruang kerja…</p>
      </div>
    </div>
  )
}

export function RakitApp() {
  const booted = useRakit((s) => s.booted)
  const user = useRakit((s) => s.user)
  const workspaces = useRakit((s) => s.workspaces)
  const boot = useRakit((s) => s.boot)

  React.useEffect(() => {
    void boot()
  }, [boot])

  if (!booted) return <Splash />
  if (!user) return <AuthScreen />
  if (workspaces.length === 0) return <Onboarding />
  return <Shell />
}
