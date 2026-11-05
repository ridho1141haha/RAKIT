'use client'

import * as React from 'react'
import { apiGet, apiPost, ApiClientError } from '@/components/rakit/api-client'
import { useRakit } from '@/components/rakit/store'
import type { SessionUser, WorkspaceSummary } from '@/components/rakit/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowRight, Lightbulb, KanbanSquare, Users } from 'lucide-react'

type Mode = 'login' | 'register'

export function AuthScreen() {
  const signIn = useRakit((s) => s.signIn)
  const [mode, setMode] = React.useState<Mode>('login')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (mode === 'login') {
        const data = await apiPost<{ user: SessionUser }>('/api/auth/login', { email, password })
        const me = await apiGet<{ workspaces?: WorkspaceSummary[] }>('/api/auth/me')
        signIn(data.user, me.workspaces ?? [])
      } else {
        const data = await apiPost<{ user: SessionUser }>('/api/auth/register', { name, email, password })
        signIn(data.user, [])
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setPending(false)
    }
  }

  async function loginDemo() {
    setPending(true)
    setError(null)
    try {
      const data = await apiPost<{ user: SessionUser }>('/api/auth/login', { email: 'demo@rakit.id', password: 'demo123' })
      const me = await apiGet<{ workspaces?: WorkspaceSummary[] }>('/api/auth/me')
      signIn(data.user, me.workspaces ?? [])
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gagal masuk sebagai demo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#211D19] p-10 text-[#FAF8F4] lg:flex">
        <div>
          <div className="font-display text-3xl font-bold tracking-tight">
            RAKIT<span className="text-[#FF6A3D]">.</span>
          </div>
          <p className="mt-2 max-w-xs font-mono text-[11px] uppercase tracking-[0.22em] text-[#FAF8F4]/50">
            Ubah ide menjadi hal yang selesai
          </p>
        </div>
        <div className="max-w-md space-y-8">
          <h2 className="font-display text-4xl font-semibold leading-[1.15]">
            Satu ruang kerja untuk melipatgandakan hal-hal yang benar-benar selesai.
          </h2>
          <ul className="space-y-5 text-sm text-[#FAF8F4]/75">
            <li className="flex gap-3">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#FF6A3D]" />
              <span><strong className="text-[#FAF8F4]">Inbox Ide</strong> — tangkap gagasan dalam hitungan detik, ubah menjadi proyek saat siap.</span>
            </li>
            <li className="flex gap-3">
              <KanbanSquare className="mt-0.5 size-4 shrink-0 text-[#FF6A3D]" />
              <span><strong className="text-[#FAF8F4]">Papan Kanban</strong> — geser tugas antar kolom; posisi tersimpan permanen.</span>
            </li>
            <li className="flex gap-3">
              <Users className="mt-0.5 size-4 shrink-0 text-[#FF6A3D]" />
              <span><strong className="text-[#FAF8F4]">Tim kecil</strong> — undang anggota, atur peran, ikuti aktivitas bersama.</span>
            </li>
          </ul>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FAF8F4]/35">
          RAKIT · Indonesia · Asia/Jakarta
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center bg-background px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="font-display text-2xl font-bold">RAKIT<span className="text-brand">.</span></div>
            <p className="kicker mt-1">Ubah ide menjadi hal yang selesai</p>
          </div>

          {/* editorial underline tabs */}
          <div className="mb-6 border-b border-border">
            <div className="flex gap-6">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null) }}
                  className="tab-ed data-[active=true]:after:bg-brand"
                  data-active={mode === m}
                >
                  {m === 'login' ? 'Masuk' : 'Daftar'}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' ? (
              <div className="space-y-1.5">
                <Label htmlFor="auth-name">Nama lengkap</Label>
                <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Raka Wijaya" required minLength={2} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">Email</Label>
              <Input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-password">Kata sandi</Label>
              <Input
                id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minimal 8 karakter' : 'Kata sandi kamu'}
                required minLength={mode === 'register' ? 8 : 1}
              />
            </div>

            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === 'login' ? 'Masuk' : 'Buat Akun'}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-3.5">
            <p className="kicker mb-1.5">Coba tanpa daftar</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Workspace berisi proyek, tugas, dan tim contoh sudah menunggu.
            </p>
            <Button variant="outline" size="sm" className="mt-2.5 w-full" onClick={() => void loginDemo()} disabled={pending}>
              Masuk sebagai Demo
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
