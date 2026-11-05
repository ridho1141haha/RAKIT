'use client'

/**
 * Onboarding — 3 langkah singkat untuk pengguna baru:
 * 1. Buat workspace  2. Buat proyek pertama  3. Panduan alur kerja singkat.
 */

import * as React from 'react'
import { apiPost, ApiClientError } from '@/components/rakit/api-client'
import { useRakit } from '@/components/rakit/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowRight, ArrowLeft, Check, Lightbulb, LayoutList, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Onboarding() {
  const refreshMe = useRakit((s) => s.refreshMe)
  const user = useRakit((s) => s.user)
  const [step, setStep] = React.useState(0)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [wsName, setWsName] = React.useState('')
  const [wsDesc, setWsDesc] = React.useState('')
  const [projName, setProjName] = React.useState('')
  const [projDesc, setProjDesc] = React.useState('')
  const [createdWorkspaceId, setCreatedWorkspaceId] = React.useState<string | null>(null)

  async function createWorkspace() {
    setPending(true)
    setError(null)
    try {
      const data = await apiPost<{ workspace: { id: string } }>('/api/workspaces', {
        name: wsName.trim(),
        description: wsDesc.trim() || undefined,
      })
      setCreatedWorkspaceId(data.workspace.id)
      setStep(1)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal membuat workspace.')
    } finally {
      setPending(false)
    }
  }

  async function createProject() {
    if (!createdWorkspaceId) return
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/workspaces/${createdWorkspaceId}/projects`, {
        name: projName.trim(),
        description: projDesc.trim() || undefined,
        status: 'ACTIVE',
      })
      await refreshMe()
      setStep(2)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal membuat proyek.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        {/* progress */}
        <div className="mb-8 flex items-center gap-2">
          {['Workspace', 'Proyek pertama', 'Siap'].map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border font-mono text-[11px]',
                  i < step
                    ? 'border-brand bg-brand text-brand-foreground'
                    : i === step
                      ? 'border-foreground text-foreground'
                      : 'border-border text-muted-foreground',
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn('hidden text-xs sm:inline', i === step ? 'font-semibold' : 'text-muted-foreground')}>
                {label}
              </span>
              {i < 2 ? <div className="h-px flex-1 bg-border" /> : null}
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div>
            <p className="kicker mb-2">Selamat datang, {user?.name.split(' ')[0]}</p>
            <h1 className="font-display text-3xl font-semibold leading-tight">Buat workspace pertamamu</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Workspace adalah rumah bagi tim dan proyekmu. Kamu bisa membuat beberapa workspace — misalnya satu untuk kerja, satu untuk pribadi.
            </p>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">Nama workspace</Label>
                <Input
                  id="ws-name" value={wsName} onChange={(e) => setWsName(e.target.value)}
                  placeholder="mis. Studio Kagaya" autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ws-desc">Deskripsi <span className="text-muted-foreground">(opsional)</span></Label>
                <Textarea id="ws-desc" value={wsDesc} onChange={(e) => setWsDesc(e.target.value)} rows={2} placeholder="Untuk apa workspace ini?" />
              </div>
              {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
              <Button className="w-full" onClick={() => void createWorkspace()} disabled={pending || wsName.trim().length < 2}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Lanjut buat proyek <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <p className="kicker mb-2">Langkah 2 dari 3</p>
            <h1 className="font-display text-3xl font-semibold leading-tight">Apa proyek pertamamu?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Proyek bisa berupa produk, tugas kuliah, rebranding — apa pun yang punya titik selesai.
            </p>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="proj-name">Nama proyek</Label>
                <Input
                  id="proj-name" value={projName} onChange={(e) => setProjName(e.target.value)}
                  placeholder="mis. Peluncuran Website Kedai" autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-desc">Deskripsi <span className="text-muted-foreground">(opsional)</span></Label>
                <Textarea id="proj-desc" value={projDesc} onChange={(e) => setProjDesc(e.target.value)} rows={2} placeholder="Ringkas tujuan dan targetnya" />
              </div>
              {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(0)} disabled={pending}>
                  <ArrowLeft className="size-4" /> Kembali
                </Button>
                <Button className="flex-1" onClick={() => void createProject()} disabled={pending || projName.trim().length < 2}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Buat proyek <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="kicker mb-2">Semua siap</p>
            <h1 className="font-display text-3xl font-semibold leading-tight">Begini cara kerja RAKIT</h1>
            <div className="mt-6 space-y-4">
              {[
                { icon: Lightbulb, title: 'Tangkap di Inbox Ide', body: 'Setiap gagasan liar dicatat dulu di Inbox. Saat sudah matang, satu klik mengubahnya menjadi proyek.' },
                { icon: LayoutList, title: 'Pecah menjadi tugas', body: 'Di dalam proyek, gunakan papan Kanban, daftar, atau timeline. Geser kartu antar kolom — status tersimpan otomatis.' },
                { icon: Flag, title: 'Rayakan milestone', body: 'Tandai titik penting, pantau progres yang selalu dihitung dari tugas nyata, bukan angka manual.' },
              ].map((f, i) => (
                <div key={i} className="flex gap-4 rounded-lg border border-border bg-card p-4">
                  <f.icon className="mt-0.5 size-5 shrink-0 text-brand" />
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                  </div>
                </div>
              ))}
              <Button className="w-full" onClick={() => refreshMe()}>
                Mulai menggunakan RAKIT <ArrowRight className="size-4" />
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Tips: tekan <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">?</kbd> kapan pun untuk melihat semua pintasan keyboard.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
