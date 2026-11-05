'use client'

/**
 * InboxView — idea inbox. Signature feature: quick capture bar (type + Enter).
 * Two-pane editorial layout on desktop; on mobile the list only, tapping a
 * row opens a Sheet with the detail. Ideas can convert into projects/tasks,
 * be archived, edited or deleted (VIEWER is read-only).
 */

import * as React from 'react'
import {
  Lightbulb,
  Loader2,
  FolderKanban,
  ListPlus,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react'
import { useRakit, roleAtLeast } from '@/components/rakit/store'
import { apiGet, apiPost, apiPatch, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { Idea, Project, Task } from '@/components/rakit/types'
import {
  Masthead,
  SectionHeading,
  Kicker,
  UserAvatar,
  PriorityMark,
  EmptyState,
  ViewSkeleton,
  ConfirmDialog,
} from '@/components/rakit/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, formatRelative } from '@/components/rakit/format'
import { IDEA_CATEGORY_OPTIONS } from '@/lib/constants'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const STATUS_TABS = [
  { key: 'ACTIVE', label: 'Aktif' },
  { key: 'ARCHIVED', label: 'Arsip' },
  { key: 'ALL', label: 'Semua' },
] as const

type StatusFilter = (typeof STATUS_TABS)[number]['key']

export function InboxView() {
  const workspaceId = useRakit((s) => s.workspaceId)
  const dataVersion = useRakit((s) => s.dataVersion)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)
  const bump = useRakit((s) => s.bumpDataVersion)
  const myRole = useRakit((s) => s.workspaces.find((w) => w.id === s.workspaceId)?.role ?? null)
  const canEdit = roleAtLeast(myRole, 'MEMBER')

  const [ideas, setIdeas] = React.useState<Idea[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // quick capture
  const [quickTitle, setQuickTitle] = React.useState('')
  const [quickPending, setQuickPending] = React.useState(false)

  // filters
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('ACTIVE')
  const [categoryFilter, setCategoryFilter] = React.useState('ALL')
  const [search, setSearch] = React.useState('')

  // selection & detail
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  // conversion state
  const [showTaskPicker, setShowTaskPicker] = React.useState(false)
  const [taskProjects, setTaskProjects] = React.useState<Project[] | null>(null)
  const [taskProjectId, setTaskProjectId] = React.useState('')
  const [convertPending, setConvertPending] = React.useState(false)

  const [archivePending, setArchivePending] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deletePending, setDeletePending] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet<{ ideas: Idea[] }>(`/api/workspaces/${workspaceId}/ideas`)
      setIdeas(res.ideas)
      // keep selection sticky; fall back to the first idea
      setSelectedId((prev) => (prev && res.ideas.some((i) => i.id === prev) ? prev : res.ideas[0]?.id ?? null))
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal memuat ide.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  async function captureIdea() {
    const title = quickTitle.trim()
    if (title.length < 2 || !workspaceId) return
    setQuickPending(true)
    try {
      await apiPost<{ idea: Idea }>(`/api/workspaces/${workspaceId}/ideas`, { title })
      setQuickTitle('')
      toast({ title: 'Ide tertangkap', description: title })
      bump()
    } catch (e) {
      toast({
        title: 'Gagal menyimpan ide',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setQuickPending(false)
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return ideas.filter((i) => {
      if (statusFilter !== 'ALL' && i.status !== statusFilter) return false
      if (categoryFilter !== 'ALL' && i.category !== categoryFilter) return false
      if (q && !`${i.title} ${i.description ?? ''} ${i.tags.join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [ideas, statusFilter, categoryFilter, search])

  const selected = ideas.find((i) => i.id === selectedId) ?? null

  function selectIdea(idea: Idea) {
    setSelectedId(idea.id)
    setShowTaskPicker(false)
    // mobile → open detail in a Sheet; desktop → right pane
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
      setSheetOpen(true)
    }
  }

  async function convertToProject(idea: Idea) {
    setConvertPending(true)
    try {
      const { project } = await apiPost<{ project: Project }>(`/api/ideas/${idea.id}/convert`, { mode: 'project' })
      toast({ title: 'Ide menjadi proyek', description: project.name })
      setSheetOpen(false)
      bump()
      navigate({ name: 'project', projectId: project.id, tab: 'board' })
    } catch (e) {
      toast({
        title: 'Gagal mengonversi ide',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setConvertPending(false)
    }
  }

  async function openTaskPicker() {
    setShowTaskPicker(true)
    if (taskProjects || !workspaceId) return
    try {
      const { projects } = await apiGet<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`)
      setTaskProjects(projects)
      setTaskProjectId((prev) => prev || projects[0]?.id || '')
    } catch (e) {
      toast({
        title: 'Gagal memuat daftar proyek',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
      setShowTaskPicker(false)
    }
  }

  async function convertToTask(idea: Idea) {
    if (!taskProjectId) return
    setConvertPending(true)
    try {
      const { task } = await apiPost<{ task: Task }>(`/api/ideas/${idea.id}/convert`, {
        mode: 'task',
        projectId: taskProjectId,
      })
      toast({ title: 'Ide menjadi tugas', description: task.title })
      setShowTaskPicker(false)
      setSheetOpen(false)
      bump()
    } catch (e) {
      toast({
        title: 'Gagal mengonversi ide',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setConvertPending(false)
    }
  }

  async function toggleArchive(idea: Idea) {
    setArchivePending(true)
    try {
      const next = idea.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED'
      await apiPatch(`/api/ideas/${idea.id}`, { status: next })
      toast({ title: next === 'ARCHIVED' ? 'Ide diarsipkan' : 'Ide dibuka dari arsip' })
      bump()
    } catch (e) {
      toast({
        title: 'Gagal memperbarui ide',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setArchivePending(false)
    }
  }

  async function deleteIdea(idea: Idea) {
    setDeletePending(true)
    try {
      await apiDelete(`/api/ideas/${idea.id}`)
      toast({ title: 'Ide dihapus', description: idea.title })
      setConfirmDelete(false)
      setSelectedId(null)
      setShowTaskPicker(false)
      setSheetOpen(false)
      bump()
    } catch (e) {
      toast({
        title: 'Gagal menghapus ide',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setDeletePending(false)
    }
  }

  function renderDetail(idea: Idea) {
    const isArchived = idea.status === 'ARCHIVED'
    const converted = idea.status === 'CONVERTED'
    return (
      <div className="space-y-5">
        {converted ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <Badge variant="outline" className="gap-1.5 bg-card">
              Menjadi proyek
            </Badge>
            {idea.convertedProjectId ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => navigate({ name: 'project', projectId: idea.convertedProjectId!, tab: 'board' })}
              >
                Lihat proyek →
              </Button>
            ) : null}
          </div>
        ) : null}

        <div>
          <h2 className="font-display text-xl font-semibold leading-snug">{idea.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="font-mono uppercase tracking-wide">{idea.category}</span>
            <span aria-hidden>·</span>
            <PriorityMark priority={idea.priority} />
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1.5">
              <UserAvatar user={idea.creator ?? null} size={18} />
              {idea.creator?.name ?? 'Tanpa pembuat'}
            </span>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{formatDate(idea.createdAt)}</span>
          </div>
        </div>

        {idea.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{idea.description}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Belum ada catatan tambahan.</p>
        )}

        {idea.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        {canEdit ? (
          <div className="space-y-3 border-t border-border pt-4">
            {!converted ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={convertPending} onClick={() => void convertToProject(idea)}>
                  {convertPending ? <Loader2 className="size-3.5 animate-spin" /> : <FolderKanban className="size-3.5" aria-hidden />}
                  Jadikan Proyek
                </Button>
                <Button size="sm" variant="outline" onClick={() => void openTaskPicker()}>
                  <ListPlus className="size-3.5" aria-hidden />
                  Jadikan Tugas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openOverlay({ kind: 'idea-edit', ideaId: idea.id })}>
                  <Pencil className="size-3.5" aria-hidden />
                  Ubah
                </Button>
                <Button size="sm" variant="ghost" disabled={archivePending} onClick={() => void toggleArchive(idea)}>
                  {isArchived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
                  {isArchived ? 'Buka Arsip' : 'Arsip'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Hapus
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Ide ini sudah dikonversi — tidak ada aksi lebih lanjut.</p>
            )}

            {showTaskPicker && !converted ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
                <Kicker>Masuk ke proyek</Kicker>
                <Select value={taskProjectId} onValueChange={setTaskProjectId}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Pilih proyek" />
                  </SelectTrigger>
                  <SelectContent>
                    {(taskProjects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={convertPending || !taskProjectId} onClick={() => void convertToTask(idea)}>
                  {convertPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Ubah Menjadi Tugas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowTaskPicker(false)}>
                  Batal
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Hapus ide ini?"
          description={`"${idea.title}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`}
          confirmLabel="Hapus Ide"
          pending={deletePending}
          onConfirm={() => void deleteIdea(idea)}
        />
      </div>
    )
  }

  if (error && ideas.length === 0 && !loading) {
    return (
      <div>
        <Masthead
          kicker="Kotak Masuk"
          title="Inbox Ide"
          description="Tangkap ide mentah, lalu ubah menjadi proyek atau tugas saat sudah matang."
        />
        <EmptyState
          title="Belum tersedia"
          description={`Layanan ide belum dapat dijangkau. ${error}`}
          icon={<Lightbulb className="size-6" aria-hidden />}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Coba Lagi
            </Button>
          }
        />
      </div>
    )
  }

  if (loading && ideas.length === 0) {
    return (
      <div>
        <Masthead
          kicker="Kotak Masuk"
          title="Inbox Ide"
          description="Tangkap ide mentah, lalu ubah menjadi proyek atau tugas saat sudah matang."
        />
        <ViewSkeleton rows={6} />
      </div>
    )
  }

  return (
    <div>
      <Masthead
        kicker="Kotak Masuk"
        title="Inbox Ide"
        description="Tangkap ide mentah, lalu ubah menjadi proyek atau tugas saat sudah matang."
      />

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        {/* ── Left pane: capture + filters + list ── */}
        <div className="min-w-0">
          {canEdit ? (
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-start gap-2.5">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Kicker className="mb-1">Tangkap Cepat</Kicker>
                  <Input
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        void captureIdea()
                      }
                    }}
                    placeholder="Tangkap ide… tekan Enter"
                    className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                    aria-label="Tangkap ide baru"
                  />
                </div>
                {quickPending ? <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" /> : null}
              </div>
            </div>
          ) : null}

          <div className={cn('border-b border-border', canEdit && 'mt-5')}>
            <div className="flex overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className="tab-ed"
                  data-active={statusFilter === tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Filter kategori">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">
                  Semua Kategori
                </SelectItem>
                {IDEA_CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ide…"
              className="h-8 flex-1 text-xs"
              aria-label="Cari ide"
            />
          </div>

          <div className="mt-5">
            <SectionHeading aside={<span className="font-mono">{filtered.length}</span>}>Daftar Ide</SectionHeading>
            {filtered.length === 0 ? (
              <EmptyState
                compact
                title="Tidak ada ide di sini"
                description={
                  ideas.length === 0
                    ? 'Tangkap ide pertamamu lewat kotak "Tangkap Cepat" di atas.'
                    : 'Coba ubah filter status, kategori, atau kata kunci pencarian.'
                }
              />
            ) : (
              <div className="divide-y divide-border border-y">
                {filtered.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => selectIdea(idea)}
                    aria-current={selectedId === idea.id}
                    className={cn(
                      'w-full px-2 py-3 text-left transition-colors',
                      selectedId === idea.id ? 'bg-muted' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{idea.title}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        {idea.category}
                      </span>
                      <PriorityMark priority={idea.priority} />
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {formatRelative(idea.createdAt)}
                      </span>
                    </span>
                    {idea.tags.length > 0 ? (
                      <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                        {idea.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right pane: detail (desktop) ── */}
        <div className="hidden lg:block">
          {selected ? (
            renderDetail(selected)
          ) : (
            <EmptyState compact title="Pilih sebuah ide" description="Pilih ide di kiri untuk melihat detail dan aksinya." />
          )}
        </div>
      </div>

      {/* ── Mobile detail sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Detail ide</SheetTitle>
            <SheetDescription>Detail lengkap dan aksi untuk ide yang dipilih</SheetDescription>
          </SheetHeader>
          {selected ? renderDetail(selected) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
