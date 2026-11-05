'use client'

/**
 * MilestonesView — editorial milestone rows with completion toggle (optimistic),
 * create/edit dialog (POST /api/projects/:id/milestones, PATCH /api/milestones/:id)
 * and ConfirmDialog-backed deletion.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useRakit } from '@/components/rakit/store'
import { apiPost, apiPatch, apiDelete } from '@/components/rakit/api-client'
import type { Milestone } from '@/components/rakit/types'
import {
  ConfirmDialog,
  DueText,
  EmptyState,
  Kicker,
  ProgressBar,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import { CheckCircle2, Circle, Loader2, Milestone as MilestoneIcon, MoreHorizontal, Plus } from 'lucide-react'
import { errMessage, startOfMs } from './shared'

export function MilestonesView({
  projectId,
  milestones,
  setMilestones,
  canEdit,
}: {
  projectId: string
  milestones: Milestone[]
  setMilestones: (updater: (prev: Milestone[]) => Milestone[]) => void
  canEdit: boolean
}) {
  const bump = useRakit((s) => s.bumpDataVersion)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Milestone | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Milestone | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(m: Milestone) {
    setEditing(m)
    setDialogOpen(true)
  }

  async function toggle(m: Milestone) {
    if (!canEdit) return
    setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, completed: !x.completed } : x)))
    try {
      await apiPatch(`/api/milestones/${m.id}`, { completed: !m.completed })
      toast({
        title: !m.completed ? 'Milestone tercapai' : 'Milestone dibuka kembali',
        description: m.name,
      })
      bump()
    } catch (e) {
      toast({ title: 'Gagal memperbarui milestone', description: errMessage(e), variant: 'destructive' })
      bump() // refetch reverts optimistic state
    }
  }

  async function remove(m: Milestone) {
    setDeleting(true)
    try {
      await apiDelete(`/api/milestones/${m.id}`)
      toast({ title: 'Milestone dihapus', description: m.name })
      setDeleteTarget(null)
      bump()
    } catch (e) {
      toast({ title: 'Gagal menghapus milestone', description: errMessage(e), variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Kicker>Milestone</Kicker>
          <span className="font-mono text-[11px] text-muted-foreground">{milestones.length}</span>
        </div>
        {canEdit ? (
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="size-3.5" />
            Milestone Baru
          </Button>
        ) : null}
      </div>

      {milestones.length === 0 ? (
        <EmptyState
          icon={<MilestoneIcon className="size-8" />}
          title="Belum ada milestone"
          description="Tandai titik-titik penting proyek agar kemajuan mudah dipantau."
          action={
            canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-3.5" />
                Milestone Baru
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {milestones.map((m) => {
            const overdue =
              !m.completed && m.targetDate != null && startOfMs(m.targetDate) < startOfMs(new Date())
            const total = m.taskStats?.total ?? 0
            const done = m.taskStats?.done ?? 0
            const pct = total === 0 ? 0 : (done / total) * 100
            return (
              <div key={m.id} className="flex items-start gap-3 py-4">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => void toggle(m)}
                  aria-label={m.completed ? 'Tandai belum tercapai' : 'Tandai milestone tercapai'}
                  className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {m.completed ? (
                    <CheckCircle2 className="size-6 text-success" />
                  ) : (
                    <Circle className="size-6 text-muted-foreground/40" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className={cn('text-sm font-semibold', m.completed && 'text-muted-foreground line-through')}>
                      {m.name}
                    </h3>
                    {overdue ? (
                      <span className="font-mono text-[10px] font-semibold tracking-wider text-brand">
                        TERLAMBAT
                      </span>
                    ) : null}
                    {m.completed ? (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        SELESAI
                      </span>
                    ) : null}
                  </div>
                  {m.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      Target <DueText date={m.targetDate} />
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {done}/{total} tugas
                    </span>
                    <ProgressBar value={pct} className="w-32" />
                  </div>
                </div>
                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Menu milestone ${m.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(m)}>Ubah</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(m)}>
                        Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <MilestoneDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projectId={projectId}
        initial={editing}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus milestone?"
        description={
          deleteTarget
            ? `Milestone "${deleteTarget.name}" akan dihapus. Tugas terkait tetap ada tanpa milestone.`
            : undefined
        }
        pending={deleting}
        onConfirm={() => deleteTarget && void remove(deleteTarget)}
      />
    </div>
  )
}

function MilestoneDialog({
  open,
  onClose,
  projectId,
  initial,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  initial: Milestone | null
}) {
  const bump = useRakit((s) => s.bumpDataVersion)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [targetDate, setTargetDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setTargetDate(initial?.targetDate ? initial.targetDate.slice(0, 10) : '')
    setError(null)
  }, [open, initial])

  async function submit() {
    if (name.trim().length < 2 || saving) return
    setSaving(true)
    setError(null)
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      targetDate: targetDate ? new Date(`${targetDate}T17:00:00`).toISOString() : null,
    }
    try {
      if (initial) {
        await apiPatch(`/api/milestones/${initial.id}`, payload)
        toast({ title: 'Milestone diperbarui', description: payload.name })
      } else {
        await apiPost(`/api/projects/${projectId}/milestones`, payload)
        toast({ title: 'Milestone dibuat', description: payload.name })
      }
      bump()
      onClose()
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            {initial ? 'Ubah Milestone' : 'Milestone Baru'}
          </DialogTitle>
          <DialogDescription>
            {initial ? 'Perbarui detail milestone ini.' : 'Tandai titik penting yang ingin dirayakan tim.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ms-name">Nama</Label>
            <Input
              id="ms-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Rilis beta"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-desc">Deskripsi</Label>
            <Textarea
              id="ms-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opsional — apa yang menandai milestone ini selesai?"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-date">Tanggal target</Label>
            <Input id="ms-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={saving || name.trim().length < 2}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {initial ? 'Simpan Perubahan' : 'Buat Milestone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
