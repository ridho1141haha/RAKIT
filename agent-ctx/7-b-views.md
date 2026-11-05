# Task 7-b — Four View Components (Dashboard / MyTasks / Inbox / Projects)

## Files written (placeholders overwritten)

1. `src/components/rakit/views/DashboardView.tsx` — `export function DashboardView()`
2. `src/components/rakit/views/MyTasksView.tsx` — `export function MyTasksView()`
3. `src/components/rakit/views/InboxView.tsx` — `export function InboxView()`
4. `src/components/rakit/views/ProjectsView.tsx` — `export function ProjectsView()`

## What was implemented

**DashboardView**
- `GET /api/dashboard?workspaceId=` on mount + on every `dataVersion` change; `ViewSkeleton` while first loading; error → EmptyState with "Coba Lagi".
- Masthead: kicker `{workspace.name} · Ikhtisar`, title `Selamat datang, {firstName}`, description derived from stats (`N proyek aktif · N tugas menunggumu[ · N terlambat]`); actions "Tugas Baru" (task-create overlay) + "Ide Baru" (idea-create).
- Stats strip: single bordered `grid grid-cols-2 md:grid-cols-4` of buttons (explicit index-based borders so the 2×2 mobile layout has no stray dividers), mono text-2xl numbers + kicker labels; Terlambat number in `text-brand` when >0; cells navigate to projects / my-tasks / my-tasks / nothing.
- Left: "Proyek Aktif" hairline rows (color dot, name→board, ProjectStatusBadge, ProgressBar + mono done/total, AvatarStack max 3) + "Aktivitas Terbaru" rows (20px avatar, `<b>name</b> verb entity` via local `ACTIVITY_VERB` map from `ACTIVITY_TYPES`, project mono + `formatRelative`; entity click → project board when projectId known).
- Right: Tenggat Terdekat (DueText + title→project + project mono + PriorityMark), Tugas Saya (optimistic complete: row removed locally, `PATCH /api/tasks/:id {status:'DONE'}`, `bumpDataVersion()`, toast; error → toast + refetch), Produktivitas 7 Hari (pure-CSS bar chart h-20, `max(6, count/max*100)%` height, today bar `bg-brand`, mono 9px weekday labels, total in aside), Milestone Mendekat (Flag icon, overdue in `text-brand`, click → project milestones tab).

**MyTasksView**
- `GET /api/my-tasks?workspaceId=&includeDone=1` (+ dataVersion refetch). Local type `MyTask = Task & { project: {id,name,color} }`.
- Buckets: Terlambat / Hari Ini / 7 Hari Ke Depan / Nanti / Tanpa Tenggat / Selesai (7 hari terakhir) via `daysUntil`; each rendered section only when non-empty, SectionHeading + mono count.
- Rows: complete-toggle Circle↔CheckCircle2 text-success (optimistic flip; DONE→`PATCH {status:'IN_PROGRESS'}` reopen, else `PATCH {status:'DONE'}`, then bump; error → toast + refetch), title→project board (line-through when done), PriorityMark, DueText, mono project name→project, LabelChips (max 2), mono comment count with MessageSquare when >0.
- Empty overall → EmptyState with "Buat Tugas" (task-create overlay).

**InboxView**
- `GET /api/workspaces/:id/ideas` (all statuses) + dataVersion refetch; 404/error → EmptyState "Belum tersedia" + "Coba Lagi".
- Signature quick capture: bordered box with Lightbulb + kicker "Tangkap Cepat", Input "Tangkap ide… tekan Enter" → `POST /api/workspaces/:id/ideas {title}` (≥2 chars), toast + bump + clear. Hidden for VIEWER.
- Two-pane `lg:grid-cols-[360px_1fr]`; mobile list-only, tap opens Sheet with the detail (matchMedia check). Left: `tab-ed` status tabs Aktif/Arsip/Semua (client filter), category Select (IDEA_CATEGORY_OPTIONS + Semua), search Input; hairline idea rows (title, category kicker tiny, PriorityMark, `#tag` mono line, formatRelative, selected = `bg-muted`).
- Right detail: font-display title, meta row (category · PriorityMark · creator avatar+name · date), description, mono tag chips; actions gated by `roleAtLeast(myRole,'MEMBER')`: Jadikan Proyek (`POST /api/ideas/:id/convert {mode:'project'}` → toast+bump+navigate board), Jadikan Tugas (on-demand fetch of `/api/workspaces/:id/projects` → inline Select + confirm → `{mode:'task', projectId}`), Ubah (idea-edit overlay), Arsip/Buka Arsip (`PATCH status`), Hapus (ConfirmDialog → DELETE). CONVERTED → Badge "Menjadi proyek" + "Lihat proyek →" link. All errors toasted.

**ProjectsView**
- `GET /api/workspaces/:id/projects` (+ dataVersion); skeleton/error(retry)/empty states.
- Masthead: kicker `{workspace.name}`, "Proyek Baru" (project-create), "Undang Anggota" (invite-member, ADMIN+ only).
- Filter bar: `tab-ed` status tabs Semua/Aktif/Perencanaan/Ditunda/Selesai/Diarsipkan + name search (client-side); sort ACTIVE→PLANNING→ON_HOLD→others, updatedAt desc within group.
- Rows: color dot + name + line-clamp-1 description | status badge + PriorityMark | ProgressBar w-24 + mono done/total + AvatarStack max 3 + target DueText; hover bg-muted/40, click → project board. Per-filter empty → compact EmptyState "Tidak ada proyek pada status ini."

## Verification
- `bunx eslint` on the 4 files: clean.
- `bunx tsc --noEmit`: zero errors in the 4 view files (remaining project errors are in files owned by other tasks, see gaps below).
- dev.log: compiles cleanly after writes; no runtime errors from these views.

## Gaps noticed in shared files (NOT fixed — owned by other tasks)
1. `ui-primitives.tsx` line 288: `ViewSkeleton` passes `style` to `SkeletonText`, but `SkeletonText` only accepts `{ className }` → TS2322. Either add optional `style` prop to SkeletonText or replace with a width utility class.
2. `tasks/TaskDialog.tsx` lines 126/157: `t.labels` and `detail.project.members` are optional in the `Task`/`Project` types but used without `?? []` → TS18048.
3. `src/lib/auth.ts` line 97: `NextRequest` used but not imported → TS2304.
4. Minor: `format.dueLabel` returns identical branches for `d <= 7` and beyond (the `soon`/short-format distinction is only applied via overdue/soon flags — fine, but the duplicate branch could be collapsed).

## Copy
All user-facing text is Indonesian (Selamat datang, Tugas Baru, Ide Baru, Tangkap Cepat, Jadikan Proyek, Buka Arsip, Coba Lagi, Tidak ada proyek pada status ini., …); technical terms (Milestone, Backlog, Board) kept per conventions.
