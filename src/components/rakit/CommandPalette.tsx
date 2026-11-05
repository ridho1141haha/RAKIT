'use client'

/**
 * CommandPalette — global search (projects/tasks/ideas/documents/milestones)
 * + navigation & creation commands. Opened with `/` or ⌘K via the store overlay.
 */

import * as React from 'react'
import { useRakit } from '@/components/rakit/store'
import { apiGet } from '@/components/rakit/api-client'
import type { SearchResult } from '@/components/rakit/types'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import {
  LayoutDashboard, CheckSquare, Lightbulb, FolderKanban, FileText, Users,
  Activity, Bell, Settings, Plus, Search, Flag, Building2, UserPlus, CornerDownLeft,
} from 'lucide-react'

export function CommandPalette() {
  const overlay = useRakit((s) => s.overlay)
  const closeOverlay = useRakit((s) => s.closeOverlay)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)
  const workspaceId = useRakit((s) => s.workspaceId)
  const workspaces = useRakit((s) => s.workspaces)
  const switchWorkspace = useRakit((s) => s.switchWorkspace)

  const open = overlay.kind === 'command-palette'
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult | null>(null)
  const [searching, setSearching] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setResults(null)
    }
  }, [open])

  // debounced search
  React.useEffect(() => {
    if (!open || !workspaceId) return
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const data = await apiGet<SearchResult>(
          `/api/search?workspaceId=${workspaceId}&q=${encodeURIComponent(q)}`,
          ctrl.signal,
        )
        setResults(data)
      } catch {
        /* aborted */
      } finally {
        setSearching(false)
      }
    }, 220)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, open, workspaceId])

  const go = (fn: () => void) => () => {
    fn()
    closeOverlay()
  }

  const nav = [
    { icon: LayoutDashboard, label: 'Ikhtisar', run: () => navigate({ name: 'dashboard' }) },
    { icon: CheckSquare, label: 'Tugas Saya', run: () => navigate({ name: 'my-tasks' }) },
    { icon: Lightbulb, label: 'Inbox Ide', run: () => navigate({ name: 'inbox' }) },
    { icon: FolderKanban, label: 'Proyek', run: () => navigate({ name: 'projects' }) },
    { icon: FileText, label: 'Dokumen', run: () => navigate({ name: 'documents' }) },
    { icon: Users, label: 'Anggota', run: () => navigate({ name: 'members' }) },
    { icon: Activity, label: 'Aktivitas', run: () => navigate({ name: 'activity' }) },
    { icon: Bell, label: 'Notifikasi', run: () => navigate({ name: 'notifications' }) },
    { icon: Settings, label: 'Pengaturan', run: () => navigate({ name: 'settings' }) },
  ]

  const actions = [
    { icon: Plus, label: 'Tugas baru', hint: 'C', run: () => openOverlay({ kind: 'task-create' }) },
    { icon: Lightbulb, label: 'Ide baru', hint: 'N', run: () => openOverlay({ kind: 'idea-create' }) },
    { icon: FolderKanban, label: 'Proyek baru', run: () => openOverlay({ kind: 'project-create' }) },
    { icon: Building2, label: 'Workspace baru', run: () => openOverlay({ kind: 'workspace-create' }) },
    { icon: UserPlus, label: 'Undang anggota', run: () => openOverlay({ kind: 'invite-member' }) },
  ]

  const hasResults =
    results &&
    (results.projects.length || results.tasks.length || results.ideas.length || results.documents.length || results.milestones.length)

  return (
    <CommandDialog open={open} onOpenChange={(o) => !o && closeOverlay()}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Cari proyek, tugas, ide, dokumen…" />
      <CommandList className="min-h-72">
        {searching && !hasResults ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Mencari…</div>
        ) : null}

        {!query && (
          <>
            <CommandGroup heading="Navigasi">
              {nav.map((n) => (
                <CommandItem key={n.label} onSelect={go(n.run)}>
                  <n.icon className="mr-2 size-4 text-muted-foreground" />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Aksi cepat">
              {actions.map((a) => (
                <CommandItem key={a.label} onSelect={go(a.run)}>
                  <a.icon className="mr-2 size-4 text-muted-foreground" />
                  <span>{a.label}</span>
                  {a.hint ? (
                    <kbd className="ml-auto rounded border border-border bg-muted px-1.5 font-mono text-[10px]">{a.hint}</kbd>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {workspaces.length > 1 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Pindah workspace">
                  {workspaces.map((w) => (
                    <CommandItem key={w.id} onSelect={go(() => switchWorkspace(w.id))}>
                      <Building2 className="mr-2 size-4 text-muted-foreground" />
                      {w.name}
                      <span className="ml-auto font-mono text-[10px] uppercase text-muted-foreground">{w.role}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </>
        )}

        {query && !searching && !hasResults ? (
          <CommandEmpty>Tidak ada hasil untuk “{query}”.</CommandEmpty>
        ) : null}

        {results?.projects.length ? (
          <CommandGroup heading="Proyek">
            {results.projects.map((p) => (
              <CommandItem key={p.id} onSelect={go(() => navigate({ name: 'project', projectId: p.id, tab: 'board' }))}>
                <span className="mr-2 size-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
                <CornerDownLeft className="ml-auto size-3 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.tasks.length ? (
          <CommandGroup heading="Tugas">
            {results.tasks.map((t) => (
              <CommandItem
                key={t.id}
                onSelect={go(() => {
                  navigate({ name: 'project', projectId: t.projectId, tab: 'board' })
                  setTimeout(() => openOverlay({ kind: 'task-edit', taskId: t.id }), 80)
                })}
              >
                <CheckSquare className="mr-2 size-4 text-muted-foreground" />
                <span className="truncate">{t.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{t.projectName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.ideas.length ? (
          <CommandGroup heading="Ide">
            {results.ideas.map((i) => (
              <CommandItem key={i.id} onSelect={go(() => navigate({ name: 'inbox', ideaId: i.id }))}>
                <Lightbulb className="mr-2 size-4 text-muted-foreground" />
                {i.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.documents.length ? (
          <CommandGroup heading="Dokumen">
            {results.documents.map((d) => (
              <CommandItem key={d.id} onSelect={go(() => navigate({ name: 'documents', documentId: d.id }))}>
                <FileText className="mr-2 size-4 text-muted-foreground" />
                {d.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.milestones.length ? (
          <CommandGroup heading="Milestone">
            {results.milestones.map((m) => (
              <CommandItem key={m.id} onSelect={go(() => navigate({ name: 'project', projectId: m.projectId, tab: 'milestones' }))}>
                <Flag className="mr-2 size-4 text-muted-foreground" />
                <span className="truncate">{m.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{m.projectName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1 font-mono">↑↓</kbd> navigasi</span>
        <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1 font-mono">↵</kbd> buka</span>
        <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1 font-mono">esc</kbd> tutup</span>
        <span className="ml-auto flex items-center gap-1"><Search className="size-3" /> RAKIT pencarian global</span>
      </div>
    </CommandDialog>
  )
}
