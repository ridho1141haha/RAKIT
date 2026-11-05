'use client'

import { create } from 'zustand'
import { apiGet, apiPost } from '@/components/rakit/api-client'
import type { SessionUser, WorkspaceSummary, IncomingInvitation } from '@/components/rakit/types'

// ─── Navigation model (SPA — single route, client views) ─────────────────────

export type ProjectTab = 'board' | 'list' | 'timeline' | 'milestones' | 'docs' | 'activity'

export type View =
  | { name: 'dashboard' }
  | { name: 'my-tasks' }
  | { name: 'inbox'; ideaId?: string }
  | { name: 'projects' }
  | { name: 'project'; projectId: string; tab: ProjectTab }
  | { name: 'members' }
  | { name: 'activity' }
  | { name: 'documents'; documentId?: string }
  | { name: 'notifications' }
  | { name: 'settings' }

export type OverlayKind =
  | { kind: 'none' }
  | { kind: 'command-palette' }
  | { kind: 'shortcuts' }
  | { kind: 'task-create'; projectId?: string; status?: string }
  | { kind: 'task-edit'; taskId: string }
  | { kind: 'idea-create' }
  | { kind: 'idea-edit'; ideaId: string }
  | { kind: 'project-create' }
  | { kind: 'project-edit'; projectId: string }
  | { kind: 'workspace-create' }
  | { kind: 'invite-member' }

interface RakitState {
  booted: boolean
  user: SessionUser | null
  workspaces: WorkspaceSummary[]
  workspaceId: string | null
  unreadCount: number
  invitations: IncomingInvitation[]
  /** incremented after any successful mutation — views refetch when it changes */
  dataVersion: number

  view: View
  overlay: OverlayKind

  // lifecycle
  boot: () => Promise<void>
  refreshMe: () => Promise<void>

  // auth
  signIn: (user: SessionUser, workspaces: WorkspaceSummary[]) => void
  signOut: () => Promise<void>

  // workspace
  switchWorkspace: (id: string) => void
  currentWorkspace: () => WorkspaceSummary | null

  // navigation
  navigate: (view: View) => void
  openOverlay: (overlay: OverlayKind) => void
  closeOverlay: () => void

  setUnreadCount: (n: number) => void
  refreshInvitations: () => Promise<void>
  bumpDataVersion: () => void
}

export const useRakit = create<RakitState>((set, get) => ({
  booted: false,
  user: null,
  workspaces: [],
  workspaceId: null,
  unreadCount: 0,
  invitations: [],

  view: { name: 'dashboard' },
  overlay: { kind: 'none' },
  dataVersion: 0,

  boot: async () => {
    try {
      await get().refreshMe()
    } finally {
      set({ booted: true })
    }
  },

  refreshMe: async () => {
    try {
      const data = await apiGet<{
        user: SessionUser | null
        workspaces?: WorkspaceSummary[]
        unreadCount?: number
      }>('/api/auth/me')
      if (!data.user) {
        set({ user: null, workspaces: [], workspaceId: null, unreadCount: 0 })
        return
      }
      const workspaces = data.workspaces ?? []
      const prevId = get().workspaceId
      const workspaceId =
        prevId && workspaces.some((w) => w.id === prevId)
          ? prevId
          : workspaces[0]?.id ?? null
      set({ user: data.user, workspaces, workspaceId, unreadCount: data.unreadCount ?? 0 })
      if (data.user && !data.user.onboardedAt && workspaces.length === 0) {
        // new user → onboarding handled by RakitApp based on user/workspaces
      }
      get().refreshInvitations().catch(() => undefined)
    } catch {
      set({ user: null, workspaces: [], workspaceId: null })
    }
  },

  signIn: (user, workspaces) =>
    set({
      user,
      workspaces,
      workspaceId: workspaces[0]?.id ?? null,
      view: { name: 'dashboard' },
    }),

  signOut: async () => {
    try {
      await apiPost('/api/auth/logout')
    } finally {
      set({ user: null, workspaces: [], workspaceId: null, view: { name: 'dashboard' }, overlay: { kind: 'none' } })
    }
  },

  switchWorkspace: (id) => {
    if (get().workspaceId === id) return
    set({ workspaceId: id, view: { name: 'dashboard' } })
  },

  currentWorkspace: () => {
    const { workspaces, workspaceId } = get()
    return workspaces.find((w) => w.id === workspaceId) ?? null
  },

  navigate: (view) => set({ view, overlay: { kind: 'none' } }),
  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: { kind: 'none' } }),

  setUnreadCount: (n) => set({ unreadCount: n }),
  bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  refreshInvitations: async () => {
    try {
      const data = await apiGet<{ invitations: IncomingInvitation[] }>('/api/invitations')
      set({ invitations: data.invitations })
    } catch {
      set({ invitations: [] })
    }
  },
}))

/** Convenience selector hooks */
export const useWorkspaceId = () => useRakit((s) => s.workspaceId)
export const useUser = () => useRakit((s) => s.user)
export const useMyRole = () =>
  useRakit((s) => s.workspaces.find((w) => w.id === s.workspaceId)?.role ?? null)

/** Role helpers mirroring server rules */
export function roleAtLeast(role: string | null | undefined, min: 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER'): boolean {
  const level = { VIEWER: 1, MEMBER: 2, ADMIN: 3, OWNER: 4 } as const
  return (level[role as keyof typeof level] ?? 0) >= level[min]
}
