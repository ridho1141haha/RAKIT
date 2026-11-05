'use client'

/**
 * Shell — the app backbone: responsive sidebar, topbar, sticky footer,
 * keyboard shortcuts, and the view switch. All views render inside <main>.
 */

import * as React from 'react'
import { useRakit, roleAtLeast, type View } from '@/components/rakit/store'
import { apiGet, apiPost } from '@/components/rakit/api-client'
import type { NotificationItem, WorkspaceSummary } from '@/components/rakit/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { UserAvatar } from '@/components/rakit/ui-primitives'
import {
  LayoutDashboard, CheckSquare, Lightbulb, FolderKanban, Users, Activity,
  FileText, Bell, Settings, Search, Menu, ChevronsUpDown, Plus, Moon, Sun,
  LogOut, UserRound, Keyboard, Check, Building2, PanelLeftOpen,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { formatRelative } from '@/components/rakit/format'
import { CommandPalette } from '@/components/rakit/CommandPalette'
import { ShortcutsDialog } from '@/components/rakit/ShortcutsDialog'
import { GlobalDialogs } from '@/components/rakit/GlobalDialogs'
import { TaskDialog } from '@/components/rakit/tasks/TaskDialog'

import { DashboardView } from '@/components/rakit/views/DashboardView'
import { MyTasksView } from '@/components/rakit/views/MyTasksView'
import { InboxView } from '@/components/rakit/views/InboxView'
import { ProjectsView } from '@/components/rakit/views/ProjectsView'
import { MembersView } from '@/components/rakit/views/MembersView'
import { WorkspaceActivityView } from '@/components/rakit/views/WorkspaceActivityView'
import { DocumentsView } from '@/components/rakit/views/DocumentsView'
import { NotificationsView } from '@/components/rakit/views/NotificationsView'
import { SettingsView } from '@/components/rakit/views/SettingsView'
import { ProjectDetailView } from '@/components/rakit/project/ProjectDetailView'

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

function useShortcuts() {
  const openOverlay = useRakit((s) => s.openOverlay)
  const navigate = useRakit((s) => s.navigate)
  const view = useRakit((s) => s.view)

  const viewRef = React.useRef(view)
  React.useEffect(() => {
    viewRef.current = view
  }, [view])

  React.useEffect(() => {
    let gPending = false
    let gTimer: ReturnType<typeof setTimeout> | undefined

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target && (target.matches('input, textarea, select') || target.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openOverlay({ kind: 'command-palette' })
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape') return

      const k = e.key.toLowerCase()

      // "g then x" navigation
      if (gPending) {
        gPending = false
        clearTimeout(gTimer)
        if (k === 'd') return navigate({ name: 'dashboard' })
        if (k === 't') return navigate({ name: 'my-tasks' })
        if (k === 'i') return navigate({ name: 'inbox' })
        if (k === 'p') return navigate({ name: 'projects' })
        return
      }
      if (k === 'g') {
        gPending = true
        gTimer = setTimeout(() => (gPending = false), 900)
        return
      }

      if (k === '/') {
        e.preventDefault()
        openOverlay({ kind: 'command-palette' })
      } else if (k === 'c') {
        openOverlay({
          kind: 'task-create',
          projectId: viewRef.current.name === 'project' ? viewRef.current.projectId : undefined,
        })
      } else if (k === 'n') {
        openOverlay({ kind: 'idea-create' })
      } else if (k === '?') {
        openOverlay({ kind: 'shortcuts' })
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      clearTimeout(gTimer)
    }
  }, [openOverlay, navigate])
}

// ─── Sidebar navigation ──────────────────────────────────────────────────────

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  view: View
  badge?: 'unread'
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Utama',
    items: [
      { label: 'Ikhtisar', icon: LayoutDashboard, view: { name: 'dashboard' } },
      { label: 'Tugas Saya', icon: CheckSquare, view: { name: 'my-tasks' } },
      { label: 'Inbox Ide', icon: Lightbulb, view: { name: 'inbox' } },
      { label: 'Proyek', icon: FolderKanban, view: { name: 'projects' } },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { label: 'Anggota', icon: Users, view: { name: 'members' } },
      { label: 'Aktivitas', icon: Activity, view: { name: 'activity' } },
    ],
  },
  {
    title: 'Alat',
    items: [{ label: 'Dokumen', icon: FileText, view: { name: 'documents' } }],
  },
  {
    title: 'Pribadi',
    items: [
      { label: 'Notifikasi', icon: Bell, view: { name: 'notifications' }, badge: 'unread' },
      { label: 'Pengaturan', icon: Settings, view: { name: 'settings' } },
    ],
  },
]

function sameView(a: View, b: View): boolean {
  if (a.name !== b.name) return false
  if (a.name === 'project' && b.name === 'project') return a.projectId === b.projectId
  return true
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const view = useRakit((s) => s.view)
  const navigate = useRakit((s) => s.navigate)
  const unreadCount = useRakit((s) => s.unreadCount)

  return (
    <nav aria-label="Navigasi utama" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="kicker px-3 pb-1.5">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = sameView(view, item.view)
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => {
                      navigate(item.view)
                      onNavigate?.()
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-foreground font-semibold text-background'
                        : 'text-foreground/75 hover:bg-sidebar-accent hover:text-foreground',
                    )}
                  >
                    <item.icon className={cn('size-4', active ? '' : 'text-muted-foreground')} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge === 'unread' && unreadCount > 0 ? (
                      <span className="flex size-4 items-center justify-center rounded-full bg-brand font-mono text-[9px] font-bold text-brand-foreground">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function WorkspaceSwitcher({ onAfter }: { onAfter?: () => void }) {
  const workspaces = useRakit((s) => s.workspaces)
  const workspaceId = useRakit((s) => s.workspaceId)
  const switchWorkspace = useRakit((s) => s.switchWorkspace)
  const openOverlay = useRakit((s) => s.openOverlay)
  const invitations = useRakit((s) => s.invitations)
  const current = workspaces.find((w) => w.id === workspaceId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground font-display text-sm font-bold text-background">
            {(current?.name ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">{current?.name ?? 'Pilih workspace'}</span>
            <span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {current ? current.role.toLowerCase() : '—'}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="kicker">Workspace</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onClick={() => {
              switchWorkspace(w.id)
              onAfter?.()
            }}
          >
            <Building2 className="mr-2 size-4 text-muted-foreground" />
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === workspaceId ? <Check className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { openOverlay({ kind: 'workspace-create' }); onAfter?.() }}>
          <Plus className="mr-2 size-4" /> Workspace baru
        </DropdownMenuItem>
        {invitations.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="kicker">
              Undangan menunggu ({invitations.length})
            </DropdownMenuLabel>
            {invitations.map((inv) => (
              <InvitationRow key={inv.id} invitation={inv} />
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InvitationRow({ invitation }: { invitation: WorkspaceSummary extends never ? never : { id: string; workspace: { id: string; name: string }; role: string; invitedBy: { name: string } } }) {
  const refreshMe = useRakit((s) => s.refreshMe)
  const refreshInvitations = useRakit((s) => s.refreshInvitations)
  const switchWorkspace = useRakit((s) => s.switchWorkspace)
  const [pending, setPending] = React.useState(false)

  async function respond(action: 'ACCEPT' | 'DECLINE') {
    setPending(true)
    try {
      const res = await apiPost<{ joined: boolean; workspaceId?: string }>('/api/invitations', {
        invitationId: invitation.id,
        action,
      })
      await refreshInvitations()
      await refreshMe()
      if (res.joined && res.workspaceId) switchWorkspace(res.workspaceId)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="px-2 py-1.5">
      <p className="text-xs font-semibold">{invitation.workspace.name}</p>
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        {invitation.role.toLowerCase()} · oleh {invitation.invitedBy.name}
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" className="h-7 flex-1 text-xs" disabled={pending} onClick={() => void respond('ACCEPT')}>
          Terima
        </Button>
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={pending} onClick={() => void respond('DECLINE')}>
          Tolak
        </Button>
      </div>
    </div>
  )
}

// ─── Topbar ──────────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Ganti tema terang/gelap"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {mounted && resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function NotificationBell() {
  const navigate = useRakit((s) => s.navigate)
  const setUnreadCount = useRakit((s) => s.setUnreadCount)
  const unreadCount = useRakit((s) => s.unreadCount)
  const [items, setItems] = React.useState<NotificationItem[]>([])
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const data = await apiGet<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications?limit=5')
      setItems(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      /* ignore polling errors */
    }
  }, [setUnreadCount])

  React.useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 45_000)
    return () => clearInterval(t)
  }, [load])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function markAll() {
    await apiPost('/api/notifications/read', { all: true })
    await load()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`} className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="kicker">Notifikasi</p>
          {unreadCount > 0 ? (
            <button className="text-[11px] text-brand hover:underline" onClick={() => void markAll()}>
              Tandai semua dibaca
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Belum ada notifikasi.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                className="flex w-full gap-2.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/60"
                onClick={() => {
                  setOpen(false)
                  navigate({ name: 'notifications' })
                }}
              >
                <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{n.title}</span>
                  {n.body ? <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">{n.body}</span> : null}
                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-4 py-2">
          <button
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false)
              navigate({ name: 'notifications' })
            }}
          >
            Lihat semua notifikasi →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserMenu() {
  const user = useRakit((s) => s.user)
  const signOut = useRakit((s) => s.signOut)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Menu pengguna" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserAvatar user={user} size={30} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          <p className="text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-[11px] font-normal text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ name: 'settings' })}>
          <UserRound className="mr-2 size-4" /> Profil & Pengaturan
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openOverlay({ kind: 'shortcuts' })}>
          <Keyboard className="mr-2 size-4" /> Pintasan keyboard
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 size-4" /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Topbar() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const openOverlay = useRakit((s) => s.openOverlay)
  const workspaces = useRakit((s) => s.workspaces)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
        {/* mobile nav */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka navigasi">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
            <SheetTitle className="sr-only">Navigasi RAKIT</SheetTitle>
            <div className="border-b border-border p-4">
              <div className="mb-3 font-display text-xl font-bold">RAKIT<span className="text-brand">.</span></div>
              <WorkspaceSwitcher onAfter={() => setMobileOpen(false)} />
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* search trigger */}
        <button
          type="button"
          onClick={() => openOverlay({ kind: 'command-palette' })}
          className="group flex h-9 max-w-md flex-1 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:bg-muted"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Cari apa saja…</span>
          <kbd className="hidden rounded border border-border bg-background px-1.5 font-mono text-[10px] sm:inline">/</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          {workspaces.length === 0 ? null : null}
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

// ─── Footer (sticky bottom via mt-auto in flex column) ──────────────────────

function Footer() {
  const current = useRakit((s) => s.currentWorkspace())
  const openOverlay = useRakit((s) => s.openOverlay)
  return (
    <footer className="mt-auto border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          RAKIT<span className="text-brand">.</span> · {current?.name ?? '—'}
        </p>
        <button
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => openOverlay({ kind: 'shortcuts' })}
        >
          Tekan ? untuk pintasan
        </button>
      </div>
    </footer>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────────────

function renderView(view: View) {
  switch (view.name) {
    case 'dashboard':
      return <DashboardView />
    case 'my-tasks':
      return <MyTasksView />
    case 'inbox':
      return <InboxView />
    case 'projects':
      return <ProjectsView />
    case 'project':
      return <ProjectDetailView projectId={view.projectId} tab={view.tab} />
    case 'members':
      return <MembersView />
    case 'activity':
      return <WorkspaceActivityView />
    case 'documents':
      return <DocumentsView />
    case 'notifications':
      return <NotificationsView />
    case 'settings':
      return <SettingsView />
  }
}

export function Shell() {
  useShortcuts()
  const view = useRakit((s) => s.view)
  const user = useRakit((s) => s.user)

  return (
    <div className="min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-xl font-bold tracking-tight">
              RAKIT<span className="text-brand">.</span>
            </span>
            <PanelLeftOpen className="size-3.5 text-muted-foreground/50" />
          </div>
          <WorkspaceSwitcher />
        </div>
        <SidebarNav />
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <UserAvatar user={user} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user?.name}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* main column */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        <Topbar />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">{renderView(view)}</div>
        </main>
        <Footer />
      </div>

      {/* overlays */}
      <CommandPalette />
      <ShortcutsDialog />
      <GlobalDialogs />
      <TaskDialog />
    </div>
  )
}
