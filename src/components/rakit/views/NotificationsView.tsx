'use client'

// ─── NotificationsView: personal notification inbox ──────────────────────────

import * as React from 'react'
import { useRakit, type View } from '@/components/rakit/store'
import { apiGet, apiPost, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { NotificationItem } from '@/components/rakit/types'
import { Masthead, EmptyState, ViewSkeleton } from '@/components/rakit/ui-primitives'
import { formatRelative } from '@/components/rakit/format'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, CheckCheck, Eraser, Loader2 } from 'lucide-react'

/** Parse the notification `link` field into a SPA view. */
function parseLink(link: string | null): View | null {
  if (!link) return null
  if (link.startsWith('project:')) {
    return { name: 'project', projectId: link.slice('project:'.length), tab: 'board' }
  }
  switch (link) {
    case 'inbox':
      return { name: 'inbox' }
    case 'members':
      return { name: 'members' }
    case 'workspaces':
    case 'projects':
      return { name: 'projects' }
    case 'notifications':
      return { name: 'notifications' }
    default:
      return null
  }
}

export function NotificationsView() {
  const dataVersion = useRakit((s) => s.dataVersion)
  const navigate = useRakit((s) => s.navigate)
  const setUnreadCount = useRakit((s) => s.setUnreadCount)

  const [items, setItems] = React.useState<NotificationItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [markingAll, setMarkingAll] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications?limit=50')
      setItems(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal memuat notifikasi.')
    }
  }, [setUnreadCount])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  async function openNotification(n: NotificationItem) {
    // optimistic local read
    if (!n.read) {
      setItems((prev) => (prev ? prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)) : prev))
      setUnreadCount(Math.max(0, useRakit.getState().unreadCount - 1))
      try {
        await apiPost('/api/notifications/read', { id: n.id })
      } catch {
        // biarkan tetap terbaca di UI; server akan sinkron saat refetch berikutnya
      }
    }
    const target = parseLink(n.link)
    if (target) navigate(target)
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await apiPost('/api/notifications/read', { all: true })
      setItems((prev) => (prev ? prev.map((it) => ({ ...it, read: true })) : prev))
      setUnreadCount(0)
    } catch (e) {
      toast({
        title: 'Gagal menandai notifikasi',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setMarkingAll(false)
    }
  }

  async function clearRead() {
    setClearing(true)
    try {
      await apiDelete('/api/notifications')
      const remaining = (items ?? []).filter((it) => !it.read).length
      setUnreadCount(remaining)
      await load()
      toast({ title: 'Notifikasi terbaca dibersihkan' })
    } catch (e) {
      toast({
        title: 'Gagal membersihkan notifikasi',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setClearing(false)
    }
  }

  const hasRead = (items ?? []).some((it) => it.read)

  return (
    <div>
      <Masthead
        kicker="Pribadi"
        title="Notifikasi"
        description="Kabar terbaru yang menyebut Anda — tugas, komentar, milestone, dan undangan."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={markingAll || !items?.some((it) => !it.read)}>
              {markingAll ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
              Tandai semua dibaca
            </Button>
            <Button variant="outline" size="sm" onClick={() => void clearRead()} disabled={clearing || !hasRead}>
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
              Bersihkan yang terbaca
            </Button>
          </>
        }
      />

      {error ? (
        <EmptyState
          icon={<BellOff className="size-8" />}
          title="Notifikasi belum bisa dimuat"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Coba lagi
            </Button>
          }
        />
      ) : items === null ? (
        <ViewSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-8" />}
          title="Tidak ada notifikasi"
          description="Anda akan mendapat notifikasi saat ditugaskan tugas, dikomentari, ada tenggat yang dekat, milestone selesai, atau diundang ke workspace."
        />
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void openNotification(n)}
              className={`relative block w-full px-3 py-3 text-left transition-colors hover:bg-accent/50 sm:px-4 ${
                n.read ? '' : 'bg-brand/[0.04]'
              }`}
            >
              {!n.read ? (
                <>
                  <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand" />
                  <span
                    aria-label="Belum dibaca"
                    className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand"
                  />
                </>
              ) : null}
              <span className="block pl-4">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`min-w-0 truncate text-sm ${n.read ? 'text-foreground' : 'font-semibold'}`}>
                    {n.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatRelative(n.createdAt)}
                  </span>
                </span>
                {n.body ? (
                  <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {n.body}
                  </span>
                ) : null}
                <span className="kicker mt-1.5 block text-[9px] opacity-80">{n.type}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
