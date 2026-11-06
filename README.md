# RAKIT.

**Turn ideas into things that ship.** — *Ubah ide menjadi hal yang selesai.*

RAKIT is a project command center for individuals, students, indie developers, and small
collaborative teams. It carries work through the whole lifecycle: **Idea → Planning →
Execution → Review → Completion** — with a deliberately editorial visual identity
(warm paper surfaces, deep charcoal, one vermilion accent).

---

## Feature overview

| Module | What works |
| --- | --- |
| **Auth** | Register, login, logout, scrypt-hashed passwords, httpOnly session cookies (30 d), rate limiting, profile & avatar & password settings |
| **Onboarding** | 3-step wizard: workspace → first project → workflow explainer |
| **Workspaces** | Multiple per user, switcher, member management, 4 roles (Owner/Admin/Member/Viewer), email invitations with in-app accept/decline, workspace settings & deletion (typed confirmation) |
| **Dashboard** | Every number derived from real rows: active projects, my open tasks, overdue count, weekly completions, real CSS bar chart (7 days), upcoming deadlines, milestones, recent activity |
| **Idea Inbox** | Sub-5-second quick capture (type + Enter), categories, tags, priority, filters + search, archive, **convert to project or to task** |
| **Projects** | Status (5), priority, dates, color, owner, members, computed progress, milestones, documents, activity |
| **Tasks** | 5 statuses, **Kanban with drag-and-drop (persisted)**, List view (sort/filter/search), Timeline view (day grid + today marker + milestone diamonds), assignee, dates, estimate, labels, subtask checklist, comments, activity |
| **Milestones** | Target dates, linked task stats, overdue indicators, completion flow with notifications |
| **Documents** | Markdown editor, debounced autosave (never loses content — explicit failure state + retry), project linking, preview mode, full-text search |
| **Activity & Notifications** | Deduplicated activity events for every meaningful action; notification center with read/unread, mark-all, clear-read, deep links |
| **Search & Palette** | `⌘K` / `/` global search across projects, tasks, ideas, documents, milestones; keyboard shortcuts: `C` new task · `N` new idea · `G then D/T/I/P` navigation · `?` shortcut help |
| **Theming** | Full light ("Kertas") / dark ("Arang") theme, system-aware |

UI language is **Indonesian** (strings are centralized for future i18n), locale `id-ID`,
timezone **Asia/Jakarta**.

## Tech stack

- **Next.js 16** (App Router, React 19, TypeScript strict) — single-page app shell at `/`
- **Tailwind CSS 4** + shadcn/ui (New York) + Lucide icons
- **Prisma ORM + SQLite** (file DB, zero external services)
- **Zustand** client state · REST API routes (no server actions)
- **scrypt** password hashing (node:crypto) · in-memory rate limiting
- Self-hosted variable fonts: **Fraunces** (display), **Space Grotesk** (UI), **JetBrains Mono** (metadata)

### Architecture decisions

- **Single-page app on one route** — navigation is client state (Zustand); all authorization is
  enforced **server-side** in every API route via membership checks (`requireMembership` /
  `requireProject` / `requireTask`), so client state is a convenience, never a security boundary.
- **Modular monolith**: `src/lib/{auth,permissions,activity,api-helpers,constants}.ts` hold the
  domain logic; API routes stay thin; views compose shared primitives
  (`src/components/rakit/ui-primitives.tsx`).
- **Activity + notifications** are written in the same transaction as the mutation that caused
  them; notifications deduplicate via `@@unique([userId, dedupeKey])`.
- **Kanban persistence**: dropping a card optimistically reorders client state, then
  `POST /api/projects/:id/tasks/reorder` persists the **complete ordering of every affected
  column** in one transaction (compact positions, cross-project id rejection, `completedAt`
  maintenance); failures revert via refetch.
- **Consistent progress**: `done/total` always from `Task.groupBy`, never manual percentages.
- **Cursor pagination** for activity feeds; `groupBy` to avoid N+1 on task stats.
- SQLite keeps local development dependency-free; the schema is normalized (see
  `prisma/schema.prisma`) and ports to PostgreSQL by changing the datasource + URL.

## Getting started

```bash
# 1. install
bun install            # or: npm install

# 2. configure environment
cp .env.example .env   # defaults work out of the box (file:./db/custom.db)

# 3. create the database schema
bun run db:push        # prisma db push (generates the Prisma client)

# 4. seed realistic demo data (Indonesian studio scenario)
bun prisma/seed.ts

# 5. run
bun run dev            # http://localhost:3000
```

**Demo login:** `demo@rakit.id` / `demo123`
(also in the seed: `sari@`, `budi@`, `rina@` @rakit.id — same password; use them to test
collaboration/permission flows from another browser profile)

### Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Dev server (port 3000, logs to `dev.log`) |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` (also enforced by `next build`) |
| `bunx playwright test` | E2E suite (18 tests) against a running dev server |
| `bun run db:push` | Push `prisma/schema.prisma` to the database (dev only) |
| `bun run db:generate` | Generate Prisma client |
| `bun prisma/seed.ts` | Reset + reseed demo data |

## Environment variables

See `.env.example`. Only one variable is required:

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:./db/custom.db` | SQLite file path (relative to `prisma/`) |

No third-party keys are needed — auth, activity, notifications, and search are all local.
If you later port to PostgreSQL, set a Postgres URL and run `prisma migrate dev`.

## Project structure

```
prisma/schema.prisma        # 15-model normalized schema (workspaces → tasks → activity)
prisma/seed.ts              # realistic Indonesian demo scenario
src/lib/                    # domain core: auth, permissions, activity, api-helpers, constants
src/app/api/                # REST routes (auth, workspaces, projects, tasks, ideas, …)
src/components/rakit/       # the app: store, shell, views, project workspace, primitives
src/components/rakit/CONVENTIONS.md   # engineering conventions (single source of truth)
e2e/                        # Playwright E2E suite (+ helpers); config: playwright.config.ts
DEPLOYMENT.md               # SQLite persistence, backups, migration strategy, Postgres plan
PRODUCT.md                  # product brief
DESIGN.md                   # visual system & design tokens
```

## QA summary (automated E2E suite — 18 Playwright tests, all passing)

Run with a dev server on port 3000: `bunx playwright test` (config in
`playwright.config.ts`, specs in `e2e/`). The suite covers:

1. Registration → onboarding → logout → login; failed login shows a generic error
2. Workspace creation via the switcher; project creation; opening the board
3. Task creation on the Kanban board
4. **Same-column and cross-column drag-and-drop that persists across reload**
   (real HTML5 drag event simulation + keyboard-accessible move menu)
5. **Cross-workspace isolation at the API level**: foreign label ids → 400 with
   no partial write; foreign task ids → 404/400 on read and reorder
6. Document autosave: persists after reload; **switching documents mid-save never
   bleeds content between docs**; failed save keeps text and retries; refresh
   immediately after typing (keepalive flush); rapid edits across 3 documents
7. Notifications: task assignment notifies the assignee; mark-all-read clears badges
8. Mobile (Pixel 7 viewport): hamburger sheet navigation, sticky footer

`.env` never enters git; production type safety is enforced (`ignoreBuildErrors: false`,
`tsc --noEmit` clean; ESLint clean).

## Known limitations (documented, not hidden)

- **SQLite = single instance** (one writer); horizontal scaling requires the PostgreSQL
  plan in [`DEPLOYMENT.md`](./DEPLOYMENT.md) — which also documents the migration
  strategy, backup procedure, and what silently replaces the database (`db:push`, seed,
  unmounted volumes).
- **Invitations are in-app only** (no email delivery) — the invitee sees and accepts them from
  the workspace switcher / notifications after logging in with the invited email.
- **SPA navigation is state-based** (single route constraint); browser back/forward and
  shareable deep links are future work (would move view state into `history`).
- **Search** uses SQLite `LIKE` (case-insensitive for ASCII) — good enough at demo scale;
  Postgres `tsvector`/trigram would be the next step.
- **Rate limiting** is in-memory (per-instance), fine for local/small deployments.
- Timeline uses task `startDate→dueDate` (or `createdAt→+2d` when absent) as the bar range.
- Completed tasks still show their (historical) due-date label; overdue styling is muted for them.
- Document autosave is last-write-wins across simultaneous editors (no OTM/CRDT merging).

## Suggested next milestones

1. URL-backed navigation (deep links + browser history)
2. PostgreSQL + migrations for team deployments; Docker Compose (plan in `DEPLOYMENT.md`)
3. Realtime collaboration (WebSocket presence + live task updates)
4. i18n extraction (`id-ID` → `en`) — strings already centralized
5. File attachments for tasks/documents (object storage adapter)
6. Per-project timeline with dependencies (gantt links)
