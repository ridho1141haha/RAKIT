'use client'

// ─── MembersView: workspace membership, roles & danger zone ──────────────────

import * as React from 'react'
import { useRakit, roleAtLeast } from '@/components/rakit/store'
import { apiGet, apiPatch, apiDelete, ApiClientError } from '@/components/rakit/api-client'
import type { WorkspaceDetail, WorkspaceMemberInfo } from '@/components/rakit/types'
import {
  Masthead,
  SectionHeading,
  EmptyState,
  ViewSkeleton,
  ConfirmDialog,
  UserAvatar,
} from '@/components/rakit/ui-primitives'
import { formatRelative } from '@/components/rakit/format'
import { ROLE_LABEL, ROLE_LEVEL } from '@/lib/constants'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, Loader2, LogOut, ShieldAlert, TriangleAlert, UserMinus, UserPlus } from 'lucide-react'

const ROLE_OPTIONS = ['ADMIN', 'MEMBER', 'VIEWER'] as const

const ROLE_LEGEND: Array<{ role: keyof typeof ROLE_LABEL; description: string }> = [
  { role: 'OWNER', description: 'Kontrol penuh — mengelola workspace, anggota, dan dapat menghapus workspace.' },
  { role: 'ADMIN', description: 'Mengelola proyek, mengundang anggota, dan mengatur peran.' },
  { role: 'MEMBER', description: 'Membuat dan mengubah proyek, tugas, ide, serta dokumen.' },
  { role: 'VIEWER', description: 'Hanya melihat konten — tidak bisa mengubah apa pun.' },
]

type ConfirmKind = 'remove' | 'leave' | 'delete-workspace'

export function MembersView() {
  const me = useRakit((s) => s.user)
  const workspaceId = useRakit((s) => s.workspaceId)
  const workspaceName = useRakit((s) => s.currentWorkspace()?.name)
  const dataVersion = useRakit((s) => s.dataVersion)
  const bump = useRakit((s) => s.bumpDataVersion)
  const refreshMe = useRakit((s) => s.refreshMe)
  const navigate = useRakit((s) => s.navigate)
  const openOverlay = useRakit((s) => s.openOverlay)

  const [workspace, setWorkspace] = React.useState<WorkspaceDetail | null>(null)
  const [myRole, setMyRole] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [confirm, setConfirm] = React.useState<{ kind: ConfirmKind; member: WorkspaceMemberInfo | null } | null>(null)
  const [pending, setPending] = React.useState(false)
  const [roleBusyId, setRoleBusyId] = React.useState<string | null>(null)

  const canManage = roleAtLeast(myRole, 'ADMIN')
  const isOwner = myRole === 'OWNER'

  const load = React.useCallback(async () => {
    if (!workspaceId) return
    setError(null)
    setLoading(true)
    try {
      const data = await apiGet<{ workspace: WorkspaceDetail; myRole: string }>(`/api/workspaces/${workspaceId}`)
      setWorkspace(data.workspace)
      setMyRole(data.myRole)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Gagal memuat anggota workspace.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void load()
  }, [load, dataVersion])

  async function changeRole(member: WorkspaceMemberInfo, role: string) {
    if (!workspaceId || role === member.role) return
    setRoleBusyId(member.id)
    try {
      await apiPatch(`/api/workspaces/${workspaceId}/members/${member.id}`, { role })
      toast({ title: 'Peran diperbarui', description: `${member.user.name} kini ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}.` })
      bump()
    } catch (e) {
      toast({
        title: 'Gagal mengubah peran',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setRoleBusyId(null)
    }
  }

  async function removeMember(member: WorkspaceMemberInfo) {
    if (!workspaceId) return
    setPending(true)
    try {
      await apiDelete(`/api/workspaces/${workspaceId}/members/${member.id}`)
      toast({ title: 'Anggota dikeluarkan', description: member.user.name })
      setConfirm(null)
      bump()
    } catch (e) {
      toast({
        title: 'Gagal mengeluarkan anggota',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  async function leaveWorkspace() {
    if (!workspaceId || !me || !workspace) return
    const mine = workspace.members.find((m) => m.user.id === me.id)
    if (!mine) return
    setPending(true)
    try {
      await apiDelete(`/api/workspaces/${workspaceId}/members/${mine.id}`)
      setConfirm(null)
      toast({ title: 'Anda keluar dari workspace', description: workspace.name })
      await refreshMe()
      navigate({ name: 'dashboard' })
    } catch (e) {
      toast({
        title: 'Gagal keluar dari workspace',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  async function deleteWorkspace() {
    if (!workspaceId) return
    setPending(true)
    try {
      await apiDelete(`/api/workspaces/${workspaceId}`)
      setConfirm(null)
      toast({ title: 'Workspace dihapus', description: workspace?.name })
      await refreshMe()
      navigate({ name: 'dashboard' })
    } catch (e) {
      toast({
        title: 'Gagal menghapus workspace',
        description: e instanceof ApiClientError ? e.message : 'Coba lagi sebentar.',
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  function canKick(target: WorkspaceMemberInfo): boolean {
    if (!myRole || !me) return false
    if (target.user.id === me.id) return false // gunakan "keluar dari workspace"
    if (target.role === 'OWNER') return false
    if (myRole === 'OWNER') return true
    if (myRole === 'ADMIN') return ROLE_LEVEL[target.role as keyof typeof ROLE_LEVEL] < ROLE_LEVEL.ADMIN
    return false
  }

  function canEditRole(target: WorkspaceMemberInfo): boolean {
    if (!canManage || !me) return false
    if (target.role === 'OWNER') return false
    if (target.user.id === me.id) return false
    return true
  }

  if (error) {
    return (
      <div>
        <Masthead kicker={workspaceName ?? 'Workspace'} title="Anggota" />
        <EmptyState
          icon={<ShieldAlert className="size-8" />}
          title="Data anggota belum bisa dimuat"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Coba lagi
            </Button>
          }
        />
      </div>
    )
  }

  if (loading || !workspace) {
    return (
      <div>
        <Masthead kicker={workspaceName ?? 'Workspace'} title="Anggota" />
        <ViewSkeleton rows={5} />
      </div>
    )
  }

  const invitations = workspace.invitations

  return (
    <div>
      <Masthead
        kicker={workspace.name}
        title="Anggota"
        description="Kelola siapa yang bisa masuk dan apa yang boleh mereka lakukan."
        actions={
          canManage ? (
            <Button onClick={() => openOverlay({ kind: 'invite-member' })}>
              <UserPlus className="size-4" /> Undang Anggota
            </Button>
          ) : null
        }
      />

      {/* ── Pending invitations ── */}
      {invitations.length > 0 ? (
        <section className="mb-8">
          <SectionHeading aside={`${invitations.length} menunggu`}>UNDAHAN MENUNGGU</SectionHeading>
          <div className="divide-y divide-border border-y border-border">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
                  aria-hidden
                >
                  <Clock className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{inv.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ROLE_LABEL[inv.role as keyof typeof ROLE_LABEL] ?? inv.role} · diundang oleh{' '}
                    {inv.invitedBy} · {formatRelative(inv.createdAt)}
                  </p>
                </div>
                <span className="kicker shrink-0 text-[10px] text-warning">Menunggu</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Members list ── */}
      <section className="mb-8">
        <SectionHeading aside={`${workspace.members.length} orang`}>
          {`ANGGOTA (${workspace.members.length})`}
        </SectionHeading>
        <div className="divide-y divide-border border-y border-border">
          {workspace.members.map((m) => {
            const isSelf = m.user.id === me?.id
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <UserAvatar user={m.user} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.user.name}
                    {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(Anda)</span> : null}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{m.user.email}</p>
                </div>

                {canEditRole(m) ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => void changeRole(m, v)}
                    disabled={roleBusyId === m.id}
                  >
                    <SelectTrigger
                      className="h-8 w-[130px] shrink-0 text-xs"
                      aria-label={`Peran ${m.user.name}`}
                    >
                      {roleBusyId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <SelectValue />}
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="kicker shrink-0 text-[10px]">{ROLE_LABEL[m.role]}</span>
                )}

                {canKick(m) ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Keluarkan ${m.user.name}`}
                    onClick={() => setConfirm({ kind: 'remove', member: m })}
                  >
                    <UserMinus className="size-4" />
                  </Button>
                ) : (
                  <span className="w-8 shrink-0" aria-hidden />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Role legend ── */}
      <section className="mb-8">
        <SectionHeading>PANDUAN PERAN</SectionHeading>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_LEGEND.map((r) => (
            <div key={r.role} className="bg-card p-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide">{ROLE_LABEL[r.role]}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Leave workspace ── */}
      {!isOwner && myRole ? (
        <section className="border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setConfirm({ kind: 'leave', member: null })}
          >
            <LogOut className="size-4" /> Keluar dari workspace ini
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Anda akan kehilangan akses ke semua proyek di workspace ini.
          </p>
        </section>
      ) : null}

      {/* ── Danger zone (OWNER only) ── */}
      {isOwner ? (
        <section className="mt-8 rounded-lg border border-destructive/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-destructive">Hapus Workspace</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Semua proyek, tugas, ide, dan dokumen di “{workspace.name}” akan hilang permanen.
                </p>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setConfirm({ kind: 'delete-workspace', member: null })}>
              Hapus Workspace
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── Confirmations ── */}
      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Keluarkan ${confirm?.member?.user.name ?? 'anggota'}?`}
        description="Mereka akan kehilangan akses ke workspace ini sampai diundang kembali."
        confirmLabel="Keluarkan"
        pending={pending}
        onConfirm={() => confirm?.member && void removeMember(confirm.member)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'leave'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Keluar dari workspace ini?"
        description={`Anda akan kehilangan akses ke “${workspace.name}”. Untuk kembali, seseorang harus mengundang Anda lagi.`}
        confirmLabel="Ya, Keluar"
        pending={pending}
        onConfirm={() => void leaveWorkspace()}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete-workspace'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Hapus workspace secara permanen?"
        description="Semua proyek, tugas, ide, dokumen, dan anggota akan terhapus. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus Workspace"
        pending={pending}
        requireText={workspace.name}
        onConfirm={() => void deleteWorkspace()}
      />
    </div>
  )
}
