'use client'

// ─── DocumentsView: two-pane editorial document editor ───────────────────────
//
// Autosave design (P1.3 — race-condition rewrite):
// Every save is bound to ONE document ID and ONE immutable content snapshot
// captured at edit time. Per-document state lives in maps keyed by docId:
//   pending  — latest unsaved snapshot (+monotonic revision)
//   sentRev  — revision currently being persisted (in flight)
//   failed   — docs whose last save failed (surfaced + retryable)
// Switching documents, workspaces, or unmounting can never submit one
// document's content under another document's ID, because a save only ever
// reads the snapshot stored under ITS OWN docId — never shared editor state.

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import { useRakit, roleAtLeast, useMyRole } from '@/components/rakit/store'
import { apiGet, apiPost, apiPatch, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { DocumentInfo, Project } from '@/components/rakit/types'
import { Masthead, SectionHeading, EmptyState, ViewSkeleton, ConfirmDialog } from '@/components/rakit/ui-primitives'
import { formatRelative, formatDate } from '@/components/rakit/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Search, FileText, Loader2, RotateCcw, Trash2 } from 'lucide-react'

/** Immutable per-document payload snapshot. `rev` is monotonic per document. */
type DocSnapshot = {
  title: string
  content: string
  projectId: string | null
  rev: number
}

const AUTOSAVE_DEBOUNCE_MS = 900

const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })

export function DocumentsView() {
  const workspaceId = useRakit((s) => s.workspaceId)
  const view = useRakit((s) => s.view)
  const dataVersion = useRakit((s) => s.dataVersion)
  const bump = useRakit((s) => s.bumpDataVersion)
  const myRole = useMyRole()
  const canEdit = roleAtLeast(myRole, 'MEMBER')

  // list state
  const [docs, setDocs] = React.useState<DocumentInfo[] | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  // filters
  const [q, setQ] = React.useState('')
  const [projectFilter, setProjectFilter] = React.useState('all')

  // selection
  const initialDocId = view.name === 'documents' ? view.documentId : undefined
  const [selectedId, setSelectedId] = React.useState<string | null>(initialDocId ?? null)
  const [pendingDelete, setPendingDelete] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  // editor state — never cleared on save failure (content is never lost)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [projectId, setProjectId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'write' | 'preview'>('write')

  // ── per-document autosave state (refs; saveTick drives status re-renders) ──
  const pendingRef = React.useRef(new Map<string, DocSnapshot>())
  const sentRevRef = React.useRef(new Map<string, number>())
  const failedRef = React.useRef(new Set<string>())
  const timersRef = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const latestRevRef = React.useRef(new Map<string, number>())
  /** What the editor was hydrated with for the current selection — edits are detected against it. */
  const hydratedRef = React.useRef<{ docId: string; title: string; content: string; projectId: string | null } | null>(null)
  const [saveTick, setSaveTick] = React.useState(0)
  const [savedAtFor, setSavedAtFor] = React.useState<{ docId: string; at: Date } | null>(null)
  const selectedIdRef = React.useRef<string | null>(selectedId)
  selectedIdRef.current = selectedId

  const selected = docs?.find((d) => d.id === selectedId) ?? null

  // ── fetch list (documents may 404 during parallel build — surface error UI) ──
  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setError(null)
    try {
      const [docsRes, projRes] = await Promise.allSettled([
        apiGet<{ documents: DocumentInfo[] }>(`/api/workspaces/${workspaceId}/documents`),
        apiGet<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`),
      ])
      if (docsRes.status === 'rejected') {
        const msg = docsRes.reason instanceof ApiClientError ? docsRes.reason.message : 'Gagal memuat dokumen.'
        setError(msg)
        setDocs(null)
        return
      }
      setDocs(docsRes.value.documents)
      if (projRes.status === 'fulfilled') setProjects(projRes.value.projects)
    } catch {
      setError('Gagal memuat dokumen.')
      setDocs(null)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  // pick a sensible selection once the list is known
  React.useEffect(() => {
    if (!docs) return
    if (selectedId && docs.some((d) => d.id === selectedId)) return
    setSelectedId(docs[0]?.id ?? null)
  }, [docs, selectedId])

  // ── hydrate editor when selection changes (content ships with the list) ─────
  React.useEffect(() => {
    if (!selected) return
    setTitle(selected.title)
    setContent(selected.content)
    setProjectId(selected.projectId)
    hydratedRef.current = {
      docId: selected.id,
      title: selected.title,
      content: selected.content,
      projectId: selected.projectId,
    }
  }, [selected?.id])

  // ── the save primitive: persists ONE doc's OWN snapshot ─────────────────────
  const saveDoc = React.useCallback(
    async (docId: string) => {
      const timer = timersRef.current.get(docId)
      if (timer) {
        clearTimeout(timer)
        timersRef.current.delete(docId)
      }
      if (sentRevRef.current.has(docId)) return // in flight; the finally-block re-checks pending
      const snapshot = pendingRef.current.get(docId)
      if (!snapshot) {
        failedRef.current.delete(docId)
        setSaveTick((t) => t + 1)
        return
      }

      sentRevRef.current.set(docId, snapshot.rev)
      setSaveTick((t) => t + 1)
      try {
        // The payload comes ONLY from this document's snapshot — never from
        // shared editor state — so a concurrent document switch cannot
        // cross-contaminate content.
        await apiPatch(`/api/documents/${docId}`, {
          title: snapshot.title,
          content: snapshot.content,
          projectId: snapshot.projectId,
        })
        // Success: drop the pending snapshot ONLY if no newer edit happened
        // while this request was in flight (revision guard).
        const current = pendingRef.current.get(docId)
        if (current && current.rev === snapshot.rev) pendingRef.current.delete(docId)
        failedRef.current.delete(docId)
        if (selectedIdRef.current === docId) setSavedAtFor({ docId, at: new Date() })
        // keep the list in sync locally for snappy UI, then let the bump refetch
        setDocs((prev) =>
          prev
            ? prev.map((d) =>
                d.id === docId ? { ...d, title: snapshot.title, updatedAt: new Date().toISOString() } : d,
              )
            : prev,
        )
        bump()
      } catch {
        // Keep the pending snapshot + editor text intact — user can retry.
        failedRef.current.add(docId)
      } finally {
        sentRevRef.current.delete(docId)
        setSaveTick((t) => t + 1)
        // Newer edits arrived while saving → persist the newer revision now.
        if (pendingRef.current.has(docId) && !failedRef.current.has(docId)) {
          void saveDoc(docId)
        }
      }
    },
    [bump],
  )
  const saveDocRef = React.useRef(saveDoc)
  saveDocRef.current = saveDoc

  function flushDoc(docId: string) {
    void saveDocRef.current(docId)
  }

  /** Persist every document that still has unsaved work (unmount / flush-all). */
  function flushAll() {
    for (const docId of [...pendingRef.current.keys()]) flushDoc(docId)
  }

  // ── edit detection: snapshot the CURRENT doc's editor values per change ─────
  React.useEffect(() => {
    const docId = selectedId
    if (!docId || !canEdit) return
    const h = hydratedRef.current
    if (h && h.docId === docId && h.title === title && h.content === content && h.projectId === projectId) {
      return // hydration render, not an edit
    }
    const rev = (latestRevRef.current.get(docId) ?? 0) + 1
    latestRevRef.current.set(docId, rev)
    pendingRef.current.set(docId, { title, content, projectId, rev })
    failedRef.current.delete(docId) // keep typing → autosave retries
    setSaveTick((t) => t + 1)
    // debounce per document
    const existing = timersRef.current.get(docId)
    if (existing) clearTimeout(existing)
    timersRef.current.set(
      docId,
      setTimeout(() => {
        timersRef.current.delete(docId)
        void saveDocRef.current(docId)
      }, AUTOSAVE_DEBOUNCE_MS),
    )
  }, [title, content, projectId, selectedId, canEdit])

  // ── unmount: flush every document with unsaved work (its OWN snapshot) ──────
  React.useEffect(
    () => () => {
      for (const t of timersRef.current.values()) clearTimeout(t)
      timersRef.current.clear()
      for (const docId of [...pendingRef.current.keys()]) void saveDocRef.current(docId)
    },
    [],
  )

  function edit(fn: () => void) {
    if (!canEdit) return
    fn()
  }

  function selectDoc(id: string) {
    if (id === selectedId) return
    // Flush the CURRENT document's own snapshot immediately — never another
    // document's content (per-document queue makes cross-contamination impossible).
    if (selectedId) flushDoc(selectedId)
    setSelectedId(id)
  }

  async function createDoc() {
    if (!workspaceId) return
    setCreating(true)
    try {
      const { document } = await apiPost<{ document: DocumentInfo }>(`/api/workspaces/${workspaceId}/documents`, {
        title: 'Dokumen Tanpa Judul',
        content: '',
      })
      setDocs((prev) => [document, ...(prev ?? [])])
      setSelectedId(document.id)
      bump()
    } catch (e) {
      toast({
        title: 'Gagal membuat dokumen',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  async function deleteDoc() {
    if (!selected) return
    setPendingDelete(true)
    try {
      await apiDelete(`/api/documents/${selected.id}`)
      // drop any queued work for the deleted document
      pendingRef.current.delete(selected.id)
      failedRef.current.delete(selected.id)
      const t = timersRef.current.get(selected.id)
      if (t) clearTimeout(t)
      timersRef.current.delete(selected.id)
      const nextId = docs?.find((d) => d.id !== selected.id)?.id ?? null
      setSelectedId(nextId)
      setConfirmOpen(false)
      bump()
      toast({ title: 'Dokumen dihapus', description: selected.title })
    } catch (e) {
      toast({
        title: 'Gagal menghapus dokumen',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setPendingDelete(false)
    }
  }

  function changeProjectLink(value: string) {
    const next = value === 'none' ? null : value
    setProjectId(next)
    if (selectedId && canEdit) {
      // update this document's snapshot synchronously, then save immediately
      const rev = (latestRevRef.current.get(selectedId) ?? 0) + 1
      latestRevRef.current.set(selectedId, rev)
      pendingRef.current.set(selectedId, { title, content, projectId: next, rev })
      failedRef.current.delete(selectedId)
      setSaveTick((t) => t + 1)
      flushDoc(selectedId)
    }
  }

  // flush unsaved edits when leaving the view
  const flushAllRef = React.useRef(flushAll)
  flushAllRef.current = flushAll
  React.useEffect(
    () => () => {
      flushAllRef.current()
    },
    [],
  )

  const filtered = React.useMemo(() => {
    if (!docs) return []
    const needle = q.trim().toLowerCase()
    return docs.filter((d) => {
      if (projectFilter !== 'all' && (d.projectId ?? 'none') !== projectFilter) return false
      if (needle && !d.title.toLowerCase().includes(needle)) return false
      return true
    })
  }, [docs, q, projectFilter])

  const projectName = (pid: string | null) => (pid ? projects.find((p) => p.id === pid)?.name ?? null : null)

  // ── save status for the selected document (derived from per-doc maps) ───────
  const derivedSaveState: 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' = React.useMemo(() => {
    if (!selectedId) return 'idle'
    if (failedRef.current.has(selectedId)) return 'error'
    if (sentRevRef.current.has(selectedId)) return 'saving'
    if (pendingRef.current.has(selectedId)) return 'unsaved'
    if (savedAtFor && savedAtFor.docId === selectedId) return 'saved'
    return 'idle'
    // saveTick changes whenever any per-doc map mutates
  }, [selectedId, savedAtFor, saveTick])
  const selectedSavedAt = savedAtFor && savedAtFor.docId === selectedId ? savedAtFor.at : null

  // ── render ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div>
        <Masthead kicker="Arsip" title="Dokumen" description="Tulis catatan panjang, brief, dan dokumentasi di sini." />
        <EmptyState
          icon={<FileText className="size-8" />}
          title="Dokumen belum bisa dimuat"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RotateCcw className="size-4" /> Coba lagi
            </Button>
          }
        />
      </div>
    )
  }

  if (docs === null) {
    return (
      <div>
        <Masthead kicker="Arsip" title="Dokumen" description="Tulis catatan panjang, brief, dan dokumentasi di sini." />
        <ViewSkeleton rows={6} />
      </div>
    )
  }

  return (
    <div>
      <Masthead
        kicker="Arsip"
        title="Dokumen"
        description="Tulis catatan panjang, brief, dan dokumentasi — tersimpan otomatis saat Anda mengetik."
        actions={
          canEdit ? (
            <Button onClick={() => void createDoc()} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              Dokumen Baru
            </Button>
          ) : null
        }
      />

      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title="Belum ada dokumen"
          description="Mulai tulis brief, riset, atau dokumentasi keputusan. Dokumen tersimpan otomatis di workspace ini."
          action={
            canEdit ? (
              <Button onClick={() => void createDoc()} disabled={creating}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                Tulis dokumen pertama
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* ── Left pane: toolbar + list ── */}
          <aside className="min-w-0">
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari judul dokumen…"
                  className="pl-9"
                  aria-label="Cari dokumen"
                />
              </div>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger aria-label="Filter proyek">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua proyek</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Tanpa proyek</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 border-t border-border">
              <div className="divide-y divide-border" role="listbox" aria-label="Daftar dokumen">
                {filtered.map((d) => {
                  const active = d.id === selectedId
                  const pname = projectName(d.projectId)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => selectDoc(d.id)}
                      className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/60 ${active ? 'bg-muted' : ''}`}
                    >
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">{formatRelative(d.updatedAt)}</span>
                        {pname ? (
                          <span className="truncate text-[10px] text-muted-foreground/70">· {pname}</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
                {filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Tidak ada dokumen yang cocok dengan filter.
                  </p>
                ) : null}
              </div>
            </div>
          </aside>

          {/* ── Right pane: editor ── */}
          <section className="min-w-0">
            {selected ? (
              <div className="flex flex-col">
                {/* title */}
                <Input
                  value={title}
                  onChange={(e) => edit(() => setTitle(e.target.value))}
                  onBlur={() => selectedId && flushDoc(selectedId)}
                  readOnly={!canEdit}
                  placeholder="Judul dokumen"
                  aria-label="Judul dokumen"
                  className="h-auto border-0 bg-transparent px-0 text-xl font-display font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-2xl"
                />

                {/* toolbar row */}
                <div className="mt-1 flex flex-wrap items-center gap-3 border-y border-border py-2">
                  {canEdit ? (
                    <Select
                      value={projectId ?? 'none'}
                      onValueChange={changeProjectLink}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Tautkan ke proyek">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tanpa proyek</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {projectName(selected.projectId) ? `Proyek: ${projectName(selected.projectId)}` : 'Tanpa proyek'}
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {derivedSaveState === 'saving' ? (
                      <span className="font-mono text-[10px] text-muted-foreground">Menyimpan…</span>
                    ) : derivedSaveState === 'unsaved' ? (
                      <span className="font-mono text-[10px] text-muted-foreground">Perubahan belum tersimpan…</span>
                    ) : derivedSaveState === 'saved' && selectedSavedAt ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Tersimpan {timeFmt.format(selectedSavedAt)}
                      </span>
                    ) : derivedSaveState === 'error' ? (
                      <>
                        <span className="font-mono text-[10px] font-semibold text-destructive">
                          Gagal menyimpan — coba lagi
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => selectedId && flushDoc(selectedId)}
                        >
                          <RotateCcw className="size-3.5" /> Ulangi
                        </Button>
                      </>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {canEdit ? 'Perubahan tersimpan otomatis' : 'Hanya baca'}
                      </span>
                    )}
                  </div>
                </div>

                {/* mode toggle */}
                <div className="flex items-center border-b border-border" role="tablist" aria-label="Mode editor">
                  <button type="button" role="tab" aria-selected={mode === 'write'} data-active={mode === 'write'} className="tab-ed" onClick={() => setMode('write')}>
                    Tulis
                  </button>
                  <button type="button" role="tab" aria-selected={mode === 'preview'} data-active={mode === 'preview'} className="tab-ed" onClick={() => setMode('preview')}>
                    Pratinjau
                  </button>
                </div>

                {/* editor body */}
                {mode === 'write' ? (
                  <Textarea
                    value={content}
                    onChange={(e) => edit(() => setContent(e.target.value))}
                    onBlur={() => selectedId && flushDoc(selectedId)}
                    readOnly={!canEdit}
                    placeholder={canEdit ? 'Tulis dalam Markdown — ## Judul, - daftar, **tebal**…' : 'Dokumen ini kosong.'}
                    aria-label="Isi dokumen"
                    className="min-h-[420px] resize-y rounded-none border-x border-b-0 border-border px-4 py-4 font-mono text-[13px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                ) : (
                  <div className="doc-preview min-h-[420px] border-x border-b-0 border-border px-4 py-4">
                    {content.trim() ? (
                      <ReactMarkdown>{content}</ReactMarkdown>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">Belum ada isi untuk dipratinjau.</p>
                    )}
                  </div>
                )}

                {/* footer row */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-2.5">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Dibuat oleh <span className="font-medium text-foreground">{selected.creator?.name ?? '—'}</span>
                    </span>
                    <span aria-hidden>·</span>
                    <span className="font-mono text-[11px]">{formatDate(selected.createdAt)}</span>
                  </div>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmOpen(true)}
                    >
                      <Trash2 className="size-3.5" /> Hapus
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="size-8" />}
                title="Pilih dokumen"
                description="Pilih salah satu dokumen di kiri, atau buat dokumen baru untuk mulai menulis."
              />
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hapus dokumen ini?"
        description={`"${selected?.title ?? ''}" akan dihapus permanen beserta isinya. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus Dokumen"
        pending={pendingDelete}
        onConfirm={() => void deleteDoc()}
      />
    </div>
  )
}
