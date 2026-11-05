# RAKIT — Engineering Conventions (read this first)

You are contributing to RAKIT, a production-minded Indonesian-language project management SPA.
**Everything is a single-page app** rendered at `/` — there are NO other pages. Navigation is
client-side state via the zustand store.

## Non-negotiable rules

1. **Language**: ALL user-facing text in **Indonesian**. Technical terms (Kanban, Backlog, To Do,
   Milestone) stay as-is. No lorem ipsum.
2. **TypeScript strict**. No `any`. No test files.
3. **No server actions** — REST API only (`/api/...`).
4. **Design tokens**: use Tailwind classes mapped in `src/app/globals.css`:
   `bg-background text-foreground bg-card border-border bg-muted text-muted-foreground bg-brand text-brand-foreground text-destructive`.
   The ONE accent is **vermilion (`--brand`)** — use sparingly: active states, urgent, progress fill, unread dot. **NEVER blue/indigo/purple.**
5. **Typography**: page titles use `font-display` (Fraunces serif) via `Masthead` primitive;
   metadata/counts/dates use `font-mono`; the `.kicker` class = mono uppercase section label.
6. Use existing shadcn/ui components in `src/components/ui/*` (Button, Dialog, DropdownMenu,
   Select, Input, Textarea, Checkbox, Tabs, Badge, Popover, AlertDialog, ScrollArea, Sheet…).
7. Cards: `rounded-lg border border-border bg-card`. **Never nest cards inside cards.**
   Prefer hairline-separated rows (`divide-y divide-border`) over card grids when listing data.
8. Interactive targets ≥ 44px on mobile. Icon-only buttons need `aria-label`.
9. Destructive actions → `ConfirmDialog` (from ui-primitives).
10. Loading → skeletons (`ViewSkeleton`, `SkeletonText`), never blank screens. Empty states must
    explain the next step and offer an action.
11. After every successful mutation call `useRakit.getState().bumpDataVersion()` (or use the
    store action via selector) so other views refetch.
12. Dates: use helpers from `@/components/rakit/format` (`formatDate`, `formatRelative`,
    `dueLabel`, `daysUntil`, `formatDateTime`, `formatHours`, `initials`, `hexWithAlpha`).

## Store (`@/components/rakit/store`)

```ts
import { useRakit, roleAtLeast, useMyRole } from '@/components/rakit/store'

const user = useRakit(s => s.user)             // SessionUser | null
const workspaceId = useRakit(s => s.workspaceId)
const workspace = useRakit(s => s.currentWorkspace())   // { id, name, role, ownerId, … }
const myRole = useMyRole()                     // 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | null
const dataVersion = useRakit(s => s.dataVersion) // ++ after any mutation → refetch
const navigate = useRakit(s => s.navigate)     // navigate({ name: 'project', projectId, tab: 'board' })
const openOverlay = useRakit(s => s.openOverlay) // see overlays below
const bump = useRakit(s => s.bumpDataVersion)
roleAtLeast(myRole, 'MEMBER')                  // gate write actions in UI (server re-checks anyway)
```

View names: `dashboard | my-tasks | inbox | projects | project | members | activity | documents |
notifications | settings`. Project view: `{ name:'project', projectId, tab }` where tab ∈
`'board' | 'list' | 'timeline' | 'milestones' | 'docs' | 'activity'`.

Overlays you can trigger (dialogs already exist):

```ts
openOverlay({ kind: 'task-create', projectId?, status? })   // TaskDialog
openOverlay({ kind: 'task-edit', taskId })
openOverlay({ kind: 'idea-create' }) / openOverlay({ kind: 'idea-edit', ideaId })
openOverlay({ kind: 'project-create' }) / openOverlay({ kind: 'project-edit', projectId })
openOverlay({ kind: 'workspace-create' })
openOverlay({ kind: 'invite-member' })
openOverlay({ kind: 'command-palette' }) / openOverlay({ kind: 'shortcuts' })
```

## API client (`@/components/rakit/api-client`)

```ts
import { apiGet, apiPost, apiPatch, apiDelete, ApiClientError } from '@/components/rakit/api-client'
const data = await apiGet<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`)
try { await apiPost('/api/…', body) } catch (e) {
  toast({ title: 'Gagal', description: e instanceof ApiClientError ? e.message : '…', variant: 'destructive' })
}
```
Errors: server returns `{ error: string }` — always show it (toast) on failure.

## Types (`@/components/rakit/types.ts`)

`Task, Project, Milestone, Idea, DocumentInfo, LabelInfo, UserInfo, TaskComment, ChecklistItem,
NotificationItem, ActivityItem, DashboardData, SearchResult, ProjectMemberInfo, IncomingInvitation…`
Read that file — response shapes are already defined there.

## Domain constants (`src/lib/constants.ts`)

`TASK_STATUSES`, `TASK_STATUS_LABEL` (Backlog/To Do/Dikerjakan/Ditinjau/Selesai), `PROJECT_STATUSES`,
`PROJECT_STATUS_LABEL`, `PRIORITIES`, `PRIORITY_LABEL`, `IDEA_CATEGORY_OPTIONS`, `AVATAR_COLORS`.
Status/priority colors: use `PROJECT_STATUS_COLOR` / `PRIORITY_COLOR` hexes via primitives.

## UI primitives (`@/components/rakit/ui-primitives`)

`Masthead({ kicker, title, description, actions })` — page header, USE IT at top of every view.
`SectionHeading`, `Kicker`, `UserAvatar({ user, size })`, `AvatarStack`, `ProjectStatusBadge`,
`TaskStatusBadge`, `PriorityMark`, `DueText({ date })` (auto overdue vermilion), `LabelChip`,
`ProgressBar({ value })`, `EmptyState({ title, description, action, icon, compact })`,
`ViewSkeleton`, `SkeletonText`, `ConfirmDialog({ open, onOpenChange, title, description,
confirmLabel, pending, onConfirm, requireText? })`.

Toasts: `import { toast } from '@/hooks/use-toast'` → `toast({ title, description?, variant? })`.

## API contracts (server side already implemented — match exactly)

- `GET /api/dashboard?workspaceId=` → `DashboardData`
- `GET /api/search?workspaceId=&q=` → `SearchResult` (q ≥ 2 chars)
- `GET /api/workspaces/:id/projects` → `{ projects: Project[] }` (each with `taskStats {total,done}`, `members[]`, `owner`)
- `POST /api/workspaces/:id/projects` body `{ name, description?, status?, priority?, startDate?, targetDate?, memberIds? }`
- `GET /api/projects/:id` → `{ project, taskStats: { total, done, overdue, progress, byStatus }, myRole }`
- `PATCH /api/projects/:id` `{ name?, description?, status?, priority?, startDate?, targetDate? }`
- `DELETE /api/projects/:id`
- `GET /api/projects/:id/tasks` → `{ tasks: Task[] }` (Task has `labels[]`, `_count {comments, checklist, checklistDone}`, `assignee`)
- `POST /api/projects/:id/tasks` `{ title, description?, status?, priority?, assigneeId?, milestoneId?, startDate?, dueDate?, estimate?, labelIds? }`
- `GET /api/tasks/:id` → `{ task }` incl. `checklist[]` + `comments[]` + `milestone`
- `PATCH /api/tasks/:id` — any task field; **kanban move = `{ status, position }`** (position = index in target column); also `labelIds`
- `DELETE /api/tasks/:id`
- `GET/POST /api/tasks/:id/comments` `{ content }`
- `POST /api/tasks/:id/checklist` `{ content }`; `PATCH/DELETE /api/checklist/:id` `{ done?, content? }`
- `GET/POST /api/projects/:id/milestones` `{ name, description?, targetDate? }`
- `PATCH /api/milestones/:id` `{ name?, description?, targetDate?, completed? }`; `DELETE`
- `GET /api/projects/:id/members` → `{ members, eligible }`; `POST` `{ userId, role }`; `PATCH/DELETE /api/projects/:id/members/:userId`
- `GET /api/projects/:id/activity?cursor=&limit=` → `{ events: ActivityItem[], nextCursor }`
- `GET /api/workspaces/:id/labels` → `{ labels }`; `POST` `{ name, color }`
- `GET /api/notifications?limit=` → `{ notifications, unreadCount }`; `POST /api/notifications/read` `{ id? } | { all: true }`
- `GET /api/workspaces/:id` → `{ workspace: WorkspaceDetail, myRole }` (members incl. user, invitations, counts)
- `PATCH /api/workspaces/:id` `{ name?, description? }` (ADMIN+); `DELETE` (OWNER)
- `PATCH /api/workspaces/:id/members/:memberId` `{ role }`; `DELETE` …
- `GET/POST /api/invitations`; `POST /api/invitations` `{ invitationId, action: 'ACCEPT'|'DECLINE' }`
- Ideas & documents endpoints are being built in parallel — code against:
  - `GET /api/workspaces/:id/ideas?status=&category=&priority=&q=` → `{ ideas: Idea[] }`
  - `POST /api/workspaces/:id/ideas` `{ title, description?, category?, priority?, tags?: string[] }`
  - `GET/PATCH/DELETE /api/ideas/:id` (PATCH partial; PATCH `{ status: 'ARCHIVED'|'ACTIVE' }` to archive)
  - `POST /api/ideas/:id/convert` `{ mode: 'project' | 'task', projectId? }` → for `project` returns `{ project }`; for `task` returns `{ task }` (adds into an existing project)
  - `GET /api/workspaces/:id/documents?projectId=&q=` → `{ documents: DocumentInfo[] }`
  - `POST /api/workspaces/:id/documents` `{ title, content?, projectId? }`
  - `GET/PATCH/DELETE /api/documents/:id` (PATCH `{ title?, content?, projectId? }`)
  - `GET /api/workspaces/:id/activity?cursor=&limit=` → `{ events: ActivityItem[], nextCursor }`

If an endpoint 404s at runtime (parallel build), surface the error state gracefully — do not fake data.

## Views you may touch

ONLY the files assigned to you. Do not edit shared files (store, primitives, constants, Shell,
api-client) — report needed changes back instead. Do not create new route pages.
