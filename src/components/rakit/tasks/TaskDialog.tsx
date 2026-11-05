'use client'

/**
 * TaskDialog — create & edit tasks. Edit mode includes checklist + comments.
 * Views call: openOverlay({ kind: 'task-create', projectId?, status? }) or
 * openOverlay({ kind: 'task-edit', taskId }) — the dialog resolves context itself.
 */

import * as React from 'react'
import { useRakit } from '@/components/rakit/store'
import { apiGet, apiPost, apiPatch, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { ChecklistItem, LabelInfo, Milestone, Project, Task, TaskComment, TaskStatus, UserInfo } from '@/components/rakit/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Loader2, Plus, Trash2, Send, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { TASK_STATUSES, TASK_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL } from '@/lib/constants'
import { formatDateTime, formatRelative } from '@/components/rakit/format'
import { UserAvatar } from '@/components/rakit/ui-primitives'

type ProjectSummary = { id: string; name: string; members?: { user: UserInfo }[] }

export function TaskDialog() {
  const overlay = useRakit((s) => s.overlay)
  const closeOverlay = useRakit((s) => s.closeOverlay)
  const workspaceId = useRakit((s) => s.workspaceId)
  const bump = useRakit((s) => s.bumpDataVersion)
  const open = overlay.kind === 'task-create' || overlay.kind === 'task-edit'
  if (!open) return null

  return (
    <TaskDialogInner
      key={overlay.kind === 'task-edit' ? overlay.taskId : `create-${overlay.projectId ?? 'any'}-${overlay.status ?? ''}`}
      taskId={overlay.kind === 'task-edit' ? overlay.taskId : null}
      presetProjectId={overlay.kind === 'task-create' ? overlay.projectId : undefined}
      presetStatus={overlay.kind === 'task-create' ? overlay.status : undefined}
      onClose={closeOverlay}
      onSaved={() => {
        bump()
        closeOverlay()
      }}
    />
  )
}

function TaskDialogInner({
  taskId,
  presetProjectId,
  presetStatus,
  onClose,
  onSaved,
}: {
  taskId: string | null
  presetProjectId?: string
  presetStatus?: string
  onClose: () => void
  onSaved: () => void
}) {
  const workspaceId = useRakit((s) => s.workspaceId)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [projects, setProjects] = React.useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = React.useState<string>(presetProjectId ?? '')

  // form fields
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [status, setStatus] = React.useState<TaskStatus>((presetStatus as TaskStatus) ?? 'BACKLOG')
  const [priority, setPriority] = React.useState('MEDIUM')
  const [assigneeId, setAssigneeId] = React.useState<string>('none')
  const [milestoneId, setMilestoneId] = React.useState<string>('none')
  const [startDate, setStartDate] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [estimate, setEstimate] = React.useState('')
  const [labelIds, setLabelIds] = React.useState<string[]>([])
  const [labels, setLabels] = React.useState<LabelInfo[]>([])
  const [milestones, setMilestones] = React.useState<Milestone[]>([])
  const [members, setMembers] = React.useState<UserInfo[]>([])

  // edit-mode extras
  const [checklist, setChecklist] = React.useState<ChecklistItem[]>([])
  const [checklistInput, setChecklistInput] = React.useState('')
  const [comments, setComments] = React.useState<TaskComment[]>([])
  const [commentInput, setCommentInput] = React.useState('')
  const [meta, setMeta] = React.useState<{ task?: Task; creator?: UserInfo | null; canEdit?: boolean }>({})

  // load reference data + (edit) task
  React.useEffect(() => {
    if (!workspaceId) return
    let alive = true
    ;(async () => {
      try {
        const [projData, labelData] = await Promise.all([
          apiGet<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`),
          apiGet<{ labels: LabelInfo[] }>(`/api/workspaces/${workspaceId}/labels`),
        ])
        if (!alive) return
        setProjects(projData.projects)
        setLabels(labelData.labels)

        if (taskId) {
          const data = await apiGet<{ task: Task & { checklist: ChecklistItem[]; comments: TaskComment[]; milestone?: Milestone | null; creator?: UserInfo } }>(`/api/tasks/${taskId}`)
          if (!alive) return
          const t = data.task
          setProjectId(t.projectId)
          setTitle(t.title)
          setDescription(t.description ?? '')
          setStatus(t.status)
          setPriority(t.priority)
          setAssigneeId(t.assigneeId ?? 'none')
          setMilestoneId(t.milestoneId ?? 'none')
          setStartDate(t.startDate ? t.startDate.slice(0, 10) : '')
          setDueDate(t.dueDate ? t.dueDate.slice(0, 10) : '')
          setEstimate(t.estimate != null ? String(t.estimate) : '')
          setLabelIds((t.labels ?? []).map((l) => l.id))
          setChecklist(t.checklist)
          setComments(t.comments)
          setMeta({ task: t, creator: t.creator, canEdit: true })
          void loadProjectContext(t.projectId, t.assigneeId ?? undefined)
        } else if (presetProjectId) {
          setProjectId(presetProjectId)
          void loadProjectContext(presetProjectId)
        } else if (projData.projects[0]) {
          setProjectId(projData.projects[0].id)
          void loadProjectContext(projData.projects[0].id)
        }
      } catch (e) {
        if (alive) setError(e instanceof ApiClientError ? e.message : 'Gagal memuat data.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
     
  }, [workspaceId, taskId])

  async function loadProjectContext(pid: string, keepAssignee?: string) {
    if (!pid) return
    try {
      const [detail, msData] = await Promise.all([
        apiGet<{ project: Project; myRole: string }>(`/api/projects/${pid}`),
        apiGet<{ milestones: Milestone[] }>(`/api/projects/${pid}/milestones`),
      ])
      setMembers((detail.project.members ?? []).map((m) => m.user))
      setMilestones(msData.milestones)
      if (!keepAssignee) setAssigneeId('none')
    } catch {
      // project list fallback
      setMembers([])
    }
  }

  const canSubmit = title.trim().length >= 2 && projectId && !saving

  async function handleSave() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      assigneeId: assigneeId === 'none' ? null : assigneeId,
      milestoneId: milestoneId === 'none' ? null : milestoneId,
      startDate: startDate ? new Date(`${startDate}T09:00:00`).toISOString() : null,
      dueDate: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null,
      estimate: estimate ? Number(estimate) : null,
      labelIds,
    }
    try {
      if (taskId) {
        await apiPatch(`/api/tasks/${taskId}`, payload)
        toast({ title: 'Tugas diperbarui', description: title.trim() })
      } else {
        await apiPost(`/api/projects/${projectId}/tasks`, payload)
        toast({ title: 'Tugas dibuat', description: title.trim() })
      }
      onSaved()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal menyimpan tugas.')
    } finally {
      setSaving(false)
    }
  }

  async function addChecklistItem() {
    const content = checklistInput.trim()
    if (!content || !taskId) return
    try {
      const { item } = await apiPost<{ item: ChecklistItem }>(`/api/tasks/${taskId}/checklist`, { content })
      setChecklist((c) => [...c, item])
      setChecklistInput('')
    } catch {
      toast({ title: 'Gagal menambah butir', variant: 'destructive' })
    }
  }

  async function toggleChecklist(item: ChecklistItem) {
    try {
      const { item: updated } = await apiPatch<{ item: ChecklistItem }>(`/api/checklist/${item.id}`, { done: !item.done })
      setChecklist((c) => c.map((i) => (i.id === item.id ? updated : i)))
    } catch {
      toast({ title: 'Gagal memperbarui butir', variant: 'destructive' })
    }
  }

  async function removeChecklist(item: ChecklistItem) {
    try {
      await apiDelete(`/api/checklist/${item.id}`)
      setChecklist((c) => c.filter((i) => i.id !== item.id))
    } catch {
      toast({ title: 'Gagal menghapus butir', variant: 'destructive' })
    }
  }

  async function addComment() {
    const content = commentInput.trim()
    if (!content || !taskId) return
    try {
      const { comment } = await apiPost<{ comment: TaskComment }>(`/api/tasks/${taskId}/comments`, { content })
      setComments((c) => [...c, comment])
      setCommentInput('')
    } catch {
      toast({ title: 'Gagal mengirim komentar', variant: 'destructive' })
    }
  }

  const doneCount = checklist.filter((c) => c.done).length

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-lg">
            {taskId ? 'Ubah Tugas' : 'Tugas Baru'}
          </DialogTitle>
          <DialogDescription>
            {taskId ? 'Perbarui detail, checklist, atau diskusi tugas ini.' : 'Catat pekerjaan yang perlu diselesaikan.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Judul</Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="mis. Desain halaman menu"
                  autoFocus
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Proyek</Label>
                  <Select
                    value={projectId}
                    onValueChange={(v) => {
                      setProjectId(v)
                      setMilestoneId('none')
                      setAssigneeId('none')
                      void loadProjectContext(v)
                    }}
                    disabled={Boolean(taskId)}
                  >
                    <SelectTrigger><SelectValue placeholder="Pilih proyek" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{TASK_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Deskripsi</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detail, konteks, atau definisi selesai…"
                  rows={3}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Prioritas</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Penanggung jawab</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger><SelectValue placeholder="Belum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Belum ditugaskan</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Milestone</Label>
                  <Select value={milestoneId} onValueChange={setMilestoneId}>
                    <SelectTrigger><SelectValue placeholder="Tanpa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa milestone</SelectItem>
                      {milestones.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-start">Mulai</Label>
                  <Input id="task-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-due">Tenggat</Label>
                  <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-est">Estimasi (jam)</Label>
                  <Input id="task-est" type="number" min={0} step={0.5} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="mis. 4" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Label</Label>
                <div className="flex flex-wrap gap-1.5">
                  {labels.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Belum ada label di workspace ini.</span>
                  ) : (
                    labels.map((l) => {
                      const active = labelIds.includes(l.id)
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setLabelIds((ids) => (active ? ids.filter((i) => i !== l.id) : [...ids, l.id]))}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                          style={{
                            borderColor: active ? l.color : 'var(--border)',
                            backgroundColor: active ? `${l.color}22` : 'transparent',
                            color: active ? l.color : 'var(--muted-foreground)',
                          }}
                        >
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                          {l.name}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {taskId ? (
                <>
                  <Separator className="my-2" />
                  {/* Checklist */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Checklist {checklist.length > 0 ? `(${doneCount}/${checklist.length})` : ''}</Label>
                    </div>
                    {checklist.map((item) => (
                      <div key={item.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted/60">
                        <Checkbox checked={item.done} onCheckedChange={() => void toggleChecklist(item)} />
                        <span className={`flex-1 text-sm ${item.done ? 'text-muted-foreground line-through' : ''}`}>
                          {item.content}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeChecklist(item)}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Hapus butir"
                        >
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input
                        value={checklistInput}
                        onChange={(e) => setChecklistInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addChecklistItem())}
                        placeholder="Tambah butir checklist…"
                        className="h-8 text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={() => void addChecklistItem()} disabled={!checklistInput.trim()}>
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-2" />
                  {/* Comments */}
                  <div className="space-y-2">
                    <Label>Diskusi ({comments.length})</Label>
                    {comments.length > 0 ? (
                      <div className="max-h-48 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                        {comments.map((c) => (
                          <div key={c.id} className="flex gap-2.5">
                            <UserAvatar user={c.user} size={24} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-semibold">{c.user.name}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">{formatRelative(c.createdAt)}</span>
                              </div>
                              <p className="text-sm leading-relaxed">{c.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Belum ada komentar. Mulai diskusi di bawah.</p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void addComment())}
                        placeholder="Tulis komentar…"
                        className="h-9 text-sm"
                      />
                      <Button size="sm" onClick={() => void addComment()} disabled={!commentInput.trim()}>
                        <Send className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
          <div className="text-[11px] text-muted-foreground">
            {meta.task ? <>Dibuat {formatDateTime(meta.task.createdAt)}</> : <span className="font-mono">ESC untuk menutup</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Batal</Button>
            <Button onClick={() => void handleSave()} disabled={!canSubmit}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {taskId ? 'Simpan Perubahan' : 'Buat Tugas'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
