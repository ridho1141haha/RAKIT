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
  `PATCH /api/tasks/:id { status, position }` persists it; failures revert via refetch.
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
| `bun run db:push` | Push `prisma/schema.prisma` to the database |
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
PRODUCT.md                  # product brief
DESIGN.md                   # visual system & design tokens
```

## QA summary (what was verified in a real browser)

- Register → onboarding → empty states render with real data; demo login works
- Kanban drag-and-drop **persists after reload** (verified in DB: `status`, `position`)
- Task create via `C` shortcut; checklist + comments persist; activity + notifications generated
- Idea quick-capture → convert to project (navigates to the new board, idea marked CONVERTED)
- Documents autosave writes to DB (status shows "Tersimpan HH.mm"); failure state never clears text
- List + Timeline + Milestones reflect the same underlying task data as the board
- Global search (`/`) returns grouped results across all five entity types
- Notifications: unread badges, mark-all-read clears everywhere
- Cross-workspace isolation: user B gets 404-style errors on user A's project/dashboard APIs
- Unauthenticated API access → 401; wrong password → generic error; rate limiting on auth routes
- Responsive: 390 px (mobile drawer nav, scrollable board) → 1440 px; light & dark themes
- `eslint` clean · `tsc --noEmit` clean (project code)

## Known limitations (documented, not hidden)

- **No automated test suite** — QA was performed as scripted end-to-end browser verification
  (see above) rather than a Playwright suite; the sandbox disallows extra test infrastructure.
- **Invitations are in-app only** (no email delivery) — the invitee sees and accepts them from
  the workspace switcher / notifications after logging in with the invited email.
- **SPA navigation is state-based** (single route constraint); browser back/forward and
  shareable deep links are future work (would move view state into `history`).
- **Search** uses SQLite `LIKE` (case-insensitive for ASCII) — good enough at demo scale;
  Postgres `tsvector`/trigram would be the next step.
- **Rate limiting** is in-memory (per-instance), fine for local/small deployments.
- Timeline uses task `startDate→dueDate` (or `createdAt→+2d` when absent) as the bar range.
- Completed tasks still show their (historical) due-date label; overdue styling is muted for them.

## Suggested next milestones

1. Playwright E2E suite covering the ten acceptance flows
2. URL-backed navigation (deep links + browser history)
3. PostgreSQL + migrations for team deployments; Docker Compose
4. Realtime collaboration (WebSocket presence + live task updates)
5. i18n extraction (`id-ID` → `en`) — strings already centralized
6. File attachments for tasks/documents (object storage adapter)
7. Per-project timeline with dependencies (gantt links)
