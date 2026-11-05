'use client'

/**
 * Global dialogs shared across views: ProjectDialog, WorkspaceDialog,
 * InviteDialog, IdeaDialog. Rendered once by Shell; views trigger them
 * via openOverlay({ kind: '…' }).
 */

import * as React from 'react'
import { useRakit } from '@/components/rakit/store'
import { apiGet, apiPost, apiPatch, ApiClientError } from '@/components/rakit/api-client'
import type { Idea, Project } from '@/components/rakit/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { PRIORITIES, PRIORITY_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL, IDEA_CATEGORY_OPTIONS } from '@/lib/constants'

// ─── Project create/edit ─────────────────────────────────────────────────────

export function ProjectDialog() {
  const overlay = useRakit((s) => s.overlay)
  const close = useRakit((s) => s.closeOverlay)
  const bump = useRakit((s) => s.bumpDataVersion)
  const navigate = useRakit((s) => s.navigate)
  const workspaceId = useRakit((s) => s.workspaceId)
  const open = overlay.kind === 'project-create' || overlay.kind === 'project-edit'
  const editing = overlay.kind === 'project-edit'

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [status, setStatus] = React.useState('PLANNING')
  const [priority, setPriority] = React.useState('MEDIUM')
  const [startDate, setStartDate] = React.useState('')
  const [targetDate, setTargetDate] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setLoaded(null)
      setError(null)
      return
    }
    if (editing && overlay.projectId !== loaded) {
      const pid = overlay.projectId
      void apiGet<{ project: Project }>(`/api/projects/${pid}`).then(({ project }) => {
        setName(project.name)
        setDescription(project.description ?? '')
        setStatus(project.status)
        setPriority(project.priority)
        setStartDate(project.startDate ? project.startDate.slice(0, 10) : '')
        setTargetDate(project.targetDate ? project.targetDate.slice(0, 10) : '')
        setLoaded(pid)
      })
    }
    if (!editing) {
      setName(''); setDescription(''); setStatus('PLANNING'); setPriority('MEDIUM')
      setStartDate(''); setTargetDate(''); setLoaded('create')
    }
     
  }, [open, editing, (overlay as { projectId?: string }).projectId])

  if (!open) return null

  async function save() {
    setPending(true)
    setError(null)
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      startDate: startDate ? new Date(`${startDate}T09:00:00`).toISOString() : null,
      targetDate: targetDate ? new Date(`${targetDate}T17:00:00`).toISOString() : null,
    }
    try {
      if (editing) {
        await apiPatch(`/api/projects/${overlay.projectId}`, payload)
        toast({ title: 'Proyek diperbarui', description: payload.name })
        bump()
      } else {
        const { project } = await apiPost<{ project: Project }>(`/api/workspaces/${workspaceId}/projects`, payload)
        toast({ title: 'Proyek dibuat', description: payload.name })
        bump()
        navigate({ name: 'project', projectId: project.id, tab: 'board' })
      }
      close()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal menyimpan proyek.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{editing ? 'Ubah Proyek' : 'Proyek Baru'}</DialogTitle>
          <DialogDescription>{editing ? 'Perbarui detail proyek.' : 'Definisikan proyek berikutnya yang akan diselesaikan.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Nama proyek</Label>
            <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Peluncuran Website Kedai" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Deskripsi</Label>
            <Textarea id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Ringkas tujuan proyek" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-start">Tanggal mulai</Label>
              <Input id="proj-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-target">Target selesai</Label>
              <Input id="proj-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Batal</Button>
          <Button onClick={() => void save()} disabled={pending || name.trim().length < 2 || (editing && !loaded)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? 'Simpan' : 'Buat Proyek'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Workspace create ────────────────────────────────────────────────────────

export function WorkspaceDialog() {
  const overlay = useRakit((s) => s.overlay)
  const close = useRakit((s) => s.closeOverlay)
  const refreshMe = useRakit((s) => s.refreshMe)
  const switchWorkspace = useRakit((s) => s.switchWorkspace)
  const open = overlay.kind === 'workspace-create'
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!open) return null

  async function save() {
    setPending(true)
    setError(null)
    try {
      const { workspace } = await apiPost<{ workspace: { id: string } }>('/api/workspaces', {
        name: name.trim(),
        description: description.trim() || undefined,
      })
      await refreshMe()
      switchWorkspace(workspace.id)
      toast({ title: 'Workspace dibuat', description: name.trim() })
      close()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal membuat workspace.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Workspace Baru</DialogTitle>
          <DialogDescription>Pisahkan konteks kerja — misalnya klien dan pribadi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Nama workspace</Label>
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Studio Kagaya" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-desc">Deskripsi</Label>
            <Textarea id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Batal</Button>
          <Button onClick={() => void save()} disabled={pending || name.trim().length < 2}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Buat Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invite member ───────────────────────────────────────────────────────────

export function InviteDialog() {
  const overlay = useRakit((s) => s.overlay)
  const close = useRakit((s) => s.closeOverlay)
  const bump = useRakit((s) => s.bumpDataVersion)
  const workspaceId = useRakit((s) => s.workspaceId)
  const open = overlay.kind === 'invite-member'
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState('MEMBER')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!open) return null

  async function save() {
    if (!workspaceId) return
    setPending(true)
    setError(null)
    try {
      await apiPost(`/api/workspaces/${workspaceId}/members`, { email: email.trim(), role })
      toast({ title: 'Undangan terkirim', description: `${email.trim()} akan bergabung saat menerima undangan.` })
      bump()
      close()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal mengirim undangan.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Undang Anggota</DialogTitle>
          <DialogDescription>
            Masukkan email yang terdaftar (atau akan mendaftar) di RAKIT. Undangan bisa diterima dari menu notifikasi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Email</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Peran</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin — kelola workspace & anggota</SelectItem>
                <SelectItem value="MEMBER">Anggota — buat & ubah konten</SelectItem>
                <SelectItem value="VIEWER">Pengamat — hanya lihat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Batal</Button>
          <Button onClick={() => void save()} disabled={pending || !email.includes('@')}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Kirim Undangan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Idea create/edit ────────────────────────────────────────────────────────

export function IdeaDialog() {
  const overlay = useRakit((s) => s.overlay)
  const close = useRakit((s) => s.closeOverlay)
  const bump = useRakit((s) => s.bumpDataVersion)
  const workspaceId = useRakit((s) => s.workspaceId)
  const open = overlay.kind === 'idea-create' || overlay.kind === 'idea-edit'
  const editing = overlay.kind === 'idea-edit'

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [category, setCategory] = React.useState('Umum')
  const [priority, setPriority] = React.useState('MEDIUM')
  const [tags, setTags] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    if (!open) { setLoaded(false); setError(null); return }
    if (editing) {
      void apiGet<{ idea: Idea }>(`/api/ideas/${overlay.ideaId}`).then(({ idea }) => {
        setTitle(idea.title)
        setDescription(idea.description ?? '')
        setCategory(idea.category)
        setPriority(idea.priority)
        setTags(idea.tags.join(', '))
        setLoaded(true)
      })
    } else {
      setTitle(''); setDescription(''); setCategory('Umum'); setPriority('MEDIUM'); setTags('')
      setLoaded(true)
    }
     
  }, [open, editing])

  if (!open || !loaded) return null

  async function save() {
    if (!workspaceId) return
    setPending(true)
    setError(null)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      priority,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
    }
    try {
      if (editing) {
        await apiPatch(`/api/ideas/${overlay.ideaId}`, payload)
        toast({ title: 'Ide diperbarui' })
      } else {
        await apiPost(`/api/workspaces/${workspaceId}/ideas`, payload)
        toast({ title: 'Ide tersimpan', description: payload.title })
      }
      bump()
      close()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal menyimpan ide.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{editing ? 'Ubah Ide' : 'Ide Baru'}</DialogTitle>
          <DialogDescription>Tangkap dulu, evaluasi nanti. Ide bisa diubah menjadi proyek kapan saja.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="idea-title">Judul ide</Label>
            <Input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Marketplace kerajinan daur ulang" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea-desc">Catatan</Label>
            <Textarea id="idea-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Konteks, potensi, langkah pertama…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IDEA_CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idea-tags">Tag (pisah koma)</Label>
              <Input id="idea-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="riset, cepat" />
            </div>
          </div>
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>Batal</Button>
          <Button onClick={() => void save()} disabled={pending || title.trim().length < 2}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? 'Simpan' : 'Simpan Ide'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Renders every global overlay dialog once. */
export function GlobalDialogs() {
  return (
    <>
      <ProjectDialog />
      <WorkspaceDialog />
      <InviteDialog />
      <IdeaDialog />
    </>
  )
}
