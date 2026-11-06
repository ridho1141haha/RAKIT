'use client'

// ─── DocumentsView: two-pane editorial document editor ───────────────────────

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import { useRakit, roleAtLeast, useMyRole } from '@/components/rakit/store'
import { apiGet, apiPost, apiPatch, apiPatchKeepalive, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { DocumentInfo, Project } from '@/components/rakit/types'
import { Masthead, SectionHeading, EmptyState, ViewSkeleton, ConfirmDialog } from '@/components/rakit/ui-primitives'
import { formatRelative, formatDate } from '@/components/rakit/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Search, FileText, Loader2, RotateCcw, Trash2 } from 'lucide-react'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

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

  // ── per-document save controller ────────────────────────────────────────────
  // Each document gets its own queue (timer + in-flight promise + payloads), so
  // switching documents can never bleed content of doc B into a save of doc A,
  // and multiple documents can save independently without racing each other.
  type DocPayload = { title: string; content: string; projectId: string | null }
  type DocSaver = {
    id: string
    timer: ReturnType<typeof setTimeout> | null
    inFlight: Promise<void> | null
    latest: DocPayload // newest editor content seen for this doc
    lastSaved: DocPayload | null // newest payload the server acknowledged
  }
  const saversRef = React.useRef(new Map<string, DocSaver>())
  const [saveStates, setSaveStates] = React.useState<Record<string, SaveState>>({})
  const [savedAtMap, setSavedAtMap] = React.useState<Record<string, Date>>({})

  const selected = docs?.find((d) => d.id === selectedId) ?? null
  const samePayload = (a: DocPayload, b: DocPayload) =>
    a.title === b.title && a.content === b.content && a.projectId === b.projectId

  function setSaveState(id: string, state: SaveState) {
    setSaveStates((prev) => (prev[id] === state ? prev : { ...prev, [id]: state }))
    if (state === 'saved') setSavedAtMap((prev) => ({ ...prev, [id]: new Date() }))
  }

  function getSaver(id: string, seed: DocPayload): DocSaver {
    let s = saversRef.current.get(id)
    if (!s) {
      s = { id, timer: null, inFlight: null, latest: seed, lastSaved: seed }
      saversRef.current.set(id, s)
    }
    return s
  }

  /** Persist one document's latest payload; drains again ONLY after success. */
  const runSave = React.useCallback(async (docId: string) => {
    const s = saversRef.current.get(docId)
    if (!s || s.inFlight) return
    const payload = s.latest
    if (s.lastSaved && samePayload(payload, s.lastSaved)) {
      if (s.timer) clearTimeout(s.timer)
      s.timer = null
      return
    }
    setSaveState(docId, 'saving')
    let succeeded = false
    s.inFlight = (async () => {
      try {
        await apiPatch(`/api/documents/${docId}`, payload)
        succeeded = true
        s.lastSaved = payload
        setSaveState(docId, 'saved')
        // keep the list in sync locally for snappy UI, then let the bump refetch
        setDocs((prev) =>
          prev
            ? prev.map((d) =>
                d.id === docId
                  ? { ...d, title: payload.title, projectId: payload.projectId, updatedAt: new Date().toISOString() }
                  : d,
              )
            : prev,
        )
        bump()
      } catch {
        // keep editor text + queued payload intact — retry keeps the same content
        setSaveState(docId, 'error')
      } finally {
        s.inFlight = null
      }
    })()
    await s.inFlight
    // drain edits that raced a SUCCESSFUL save. After a failure we deliberately
    // stop: retries happen via the "Ulangi" button or the next keystroke's
    // debounce — never an automatic loop hammering the server.
    if (
      succeeded &&
      saversRef.current.get(docId) === s &&
      s.lastSaved &&
      !samePayload(s.latest, s.lastSaved)
    ) {
      await runSave(docId)
    }
  }, [bump])

  /** Debounced autosave entry point; delay 0 flushes immediately. */
  const scheduleSave = React.useCallback(
    (docId: string, payload: DocPayload, delay = 900) => {
      const s = getSaver(docId, payload)
      s.latest = payload
      if (s.lastSaved && samePayload(payload, s.lastSaved)) {
        if (s.timer) {
          clearTimeout(s.timer)
          s.timer = null
        }
        return
      }
      if (s.timer) clearTimeout(s.timer)
      s.timer = setTimeout(() => {
        s.timer = null
        void runSave(docId)
      }, delay)
    },
    [runSave],
  )

  /** Immediate flush of one document (switching docs, leaving the view). */
  const flushDoc = React.useCallback(
    (docId: string) => {
      const s = saversRef.current.get(docId)
      if (!s) return
      if (s.timer) {
        clearTimeout(s.timer)
        s.timer = null
      }
      if (s.inFlight) return // in-flight request already carries the payload
      if (s.lastSaved && samePayload(s.latest, s.lastSaved)) return
      void runSave(docId)
    },
    [runSave],
  )

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
  // Done DURING RENDER (React's "adjust state on prop change" pattern), NOT in
  // an effect: effect-based hydration runs on a deferred lane, so fast typing
  // right after switching documents could commit BEFORE the hydration state,
  // which then clobbered the user's input with the previous document's data.
  // The guard MUST be state (not a ref): under StrictMode's double render a
  // ref would make pass 2 skip re-queuing the updates, losing the hydration.
  // If THIS document has locally-known unsaved/failed content (e.g. a failed
  // save before switching away), restore it — never lose the user's edits.
  const [hydratedId, setHydratedId] = React.useState<string | null>(null)
  if (selected && hydratedId !== selected.id) {
    const seed: DocPayload = { title: selected.title, content: selected.content, projectId: selected.projectId }
    const s = saversRef.current.get(selected.id)
    const local = s && s.lastSaved && !samePayload(s.latest, s.lastSaved) ? s.latest : null
    getSaver(selected.id, seed)
    const next = local ?? seed
    setHydratedId(selected.id)
    setTitle(next.title)
    setContent(next.content)
    setProjectId(next.projectId)
    setMode('write')
  }
  // list can replace docs (refetch) without changing the selection — nothing to do

  // ── autosave: per-doc debounced 900ms after any editor change ────────────────
  React.useEffect(() => {
    if (!selectedId || !canEdit) return
    scheduleSave(selectedId, { title, content, projectId })
  }, [selectedId, title, content, projectId, canEdit, scheduleSave])

  function edit(fn: () => void) {
    if (!canEdit) return
    fn()
    // persistence is scheduled by the editor-change effect above
  }

  function selectDoc(id: string) {
    if (id === selectedId) return
    if (selectedId) flushDoc(selectedId) // persist the previous doc's pending edits first
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
      const old = saversRef.current.get(selected.id)
      if (old?.timer) clearTimeout(old.timer)
      saversRef.current.delete(selected.id) // no further saves for a deleted doc
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
    if (!selectedId) return
    const next = value === 'none' ? null : value
    setProjectId(next)
    // flush immediately with the explicit new payload (state update is async)
    scheduleSave(selectedId, { title, content, projectId: next }, 0)
  }

  // ── flush unsaved edits when leaving the view / hiding the page ─────────────
  // Best-effort: keepalive requests survive page unload; docs with a save already
  // in flight are skipped (that request already carries their payload).
  const flushAllRef = React.useRef<() => void>(() => {})
  flushAllRef.current = () => {
    for (const [id, s] of saversRef.current) {
      if (s.timer) {
        clearTimeout(s.timer)
        s.timer = null
      }
      if (s.inFlight) continue
      if (s.lastSaved && samePayload(s.latest, s.lastSaved)) continue
      void apiPatchKeepalive(`/api/documents/${id}`, s.latest)
        .then(() => {
          s.lastSaved = s.latest
          setSaveState(id, 'saved')
        })
        .catch(() => setSaveState(id, 'error'))
    }
  }
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAllRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushAllRef.current)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushAllRef.current)
      flushAllRef.current() // component unmount (view switch): final best-effort flush
    }
  }, [])

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

  // ── render ───────────────────────────────────────────────────────────────────
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
                  onBlur={() => {
                    if (selectedId) flushDoc(selectedId)
                  }}
                  readOnly={!canEdit || creating}
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
                    {(() => {
                      const st = selected ? saveStates[selected.id] ?? 'idle' : 'idle'
                      const at = selected ? savedAtMap[selected.id] ?? null : null
                      if (st === 'saving') {
                        return <span className="font-mono text-[10px] text-muted-foreground">Menyimpan…</span>
                      }
                      if (st === 'error') {
                        return (
                          <>
                            <span className="font-mono text-[10px] font-semibold text-destructive">
                              Gagal menyimpan — teks aman
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => selectedId && void runSave(selectedId)}
                            >
                              <RotateCcw className="size-3.5" /> Ulangi
                            </Button>
                          </>
                        )
                      }
                      if (st === 'saved' && at) {
                        return (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            Tersimpan {timeFmt.format(at)}
                          </span>
                        )
                      }
                      return (
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {canEdit ? 'Perubahan tersimpan otomatis' : 'Hanya baca'}
                        </span>
                      )
                    })()}
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
                    onBlur={() => {
                      if (selectedId) flushDoc(selectedId)
                    }}
                    readOnly={!canEdit || creating}
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
