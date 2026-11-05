# Task 7-c — Project Workspace (ProjectDetailView + Kanban/List/Timeline/Milestones)

Agent: 7-c (project workspace). Date: session 2026-11.

## Files written (all under `src/components/rakit/project/`)

| File | Lines | Contents |
|---|---|---|
| `ProjectDetailView.tsx` | 402 | Main shell: parallel data fetch (`GET /api/projects/:id`, `/tasks`, `/milestones`), masthead + progress/people meta row, status Select, Tugas Baru button, ••• menu (Ubah detail / Hapus proyek with requireText ConfirmDialog), `.tab-ed` underline nav, tab switch, error/loading states, docs+activity placeholders |
| `BoardView.tsx` | 306 | Kanban, 5 columns from `TASK_STATUSES`, native HTML5 DnD, vermilion drop indicator (`.drop-above` + end-of-column line), optimistic `PATCH /api/tasks/:id { status, position }`, keyboard "Pindah ke →" menu |
| `ListView.tsx` | 287 | Search / assignee / priority filters, sort Select + direction toggle + clickable mono header cells, hairline rows, complete toggle (Circle→CheckCircle2, optimistic `PATCH { status: 'DONE' | 'IN_PROGRESS' }`) |
| `TimelineView.tsx` | 302 | Window = min(start‖createdAt‖due)…max(due‖target‖today) padded ±3d, clamped ≥14d; 36px day width; sticky month/day header; weekend shading; milestone diamond section on top; priority-colored task bars (done = `bg-foreground/10` line-through, overdue = brand border); dashed vermilion HARI INI marker; rows open task-edit |
| `MilestonesView.tsx` | 335 | Milestone rows (big round toggle, TERLAMBAT tag, `done/total tugas`, mini ProgressBar), create/edit `MilestoneDialog`, ConfirmDialog delete |
| `shared.ts` | 25 | `DAY`, `DAY_WIDTH`, `startOfMs`, `PRIORITY_RANK`, `errMessage` (ApiClientError-aware) |

Split was done because the combined file exceeded ~1100 lines (allowed per task spec).

## Verification done
- `bunx eslint src/components/rakit/project/` → clean.
- `bunx tsc --noEmit` → no errors in `components/rakit/**` (pre-existing errors exist in TaskDialog.tsx, ui-primitives.tsx, api routes, seed — NOT mine, untouched).
- dev.log → `✓ Compiled`, `GET / 200`, no runtime errors.
- Live API smoke test (seeded login): `PATCH /api/tasks/:id {status:'IN_REVIEW',position:0}` → 200, task persisted; reverted to BACKLOG. Project detail/tasks/milestones GET shapes match the component's expectations.

## DnD persistence (how it works)
1. `dragstart` on card (only when canEdit) sets module ref + state `draggingId`, `dataTransfer.setData('text/plain')`, `effectAllowed='move'`, card gets `opacity-50`.
2. Column body `onDragOver` preventDefaults and computes insertion index by comparing `e.clientY` to each card's vertical midpoint (cards with `data-task-id === draggingId` excluded) → `drop = { status, index }`; a 2px vermilion indicator renders via `.drop-above` on the card at that index (or a line div at column end).
3. `onDrop` → `moveTask(id, status, index)`: local `applyMove` reassigns the moved task's status + sequential positions (0..n) in the target column → `setTasks` (optimistic, instant), then `PATCH /api/tasks/:id { status, position }` (position = final index in target column). Success → `bumpDataVersion()` (other views refetch). Failure → toast + `bump()` so the refetch reverts to server state.
4. No-op guard: same status + same index does nothing.
5. Keyboard/a11y fallback: per-card dropdown lists other statuses → same `moveTask` path with index = end of target column.

## API contracts assumed/confirmed beyond CONVENTIONS.md
All confirmed against the live route implementations (none contradicted the doc):
- `GET /api/projects/:id` → `{ project, taskStats: { total, done, overdue, progress, byStatus }, myRole }` — `project.members[].role` may be `'LEAD'` (typed as plain `string`, not used for gating; gating uses `myRole`).
- `GET /api/projects/:id/tasks` → tasks include flat `labels[]`, `_count { comments, checklist, checklistDone }` (also emits unused `checklistTotal`).
- `PATCH /api/tasks/:id` accepts `{ status, position }` (position = int index in target column); only the moved task's position is stored — sibling positions are NOT reindexed server-side (local order derives from `position asc, createdAt asc`, so this is stable in practice). Assumed per CONVENTIONS.
- `PATCH /api/projects/:id { status }` also flips `completedAt`; DELETE is ADMIN+ (so the "Hapus proyek" item is gated `roleAtLeast(myRole,'ADMIN')`, stricter than canEdit).
- Milestones: `POST /api/projects/:id/milestones { name, description, targetDate(ISO) }`, `PATCH /api/milestones/:id { name?, description?, targetDate?, completed? }`, `DELETE` — GET returns `taskStats { total, done }` per milestone.

## Notes for other agents
- Docs/activity tabs are placeholders that `navigate({ name: 'documents' })` / `navigate({ name: 'activity' })`; project-scoped filtering is left to those views.
- Shared files untouched. Pre-existing lint errors in `Shell.tsx` (react-hooks/refs ×2) belong to another agent.
