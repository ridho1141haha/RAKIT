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
| **Auth** | Register, login, logout, scrypt-hashed passwords, httpOnly session cookies (30 d), rate limiting, profile & avatar & password settings. Password change revokes sessions on other devices |
| **Onboarding** | 3-step wizard: workspace → first project → workflow explainer |
| **Workspaces** | Multiple per user, switcher, member management, 4 roles (Owner/Admin/Member/Viewer), email invitations with in-app accept/decline, workspace settings & deletion (typed confirmation) |
| **Dashboard** | Every number derived from real rows: active projects, my open tasks, overdue count, weekly completions, real CSS bar chart (7 days), upcoming deadlines, milestones, recent activity |
| **Idea Inbox** | Sub-5-second quick capture (type + Enter), categories, tags, priority, filters + search, archive, **convert to project or to task** |
| **Projects** | Status (5), priority, dates, color, owner, members, computed progress, milestones, documents, activity |
| **Tasks** | 5 statuses, **Kanban with drag-and-drop — batch persistence for every affected card**, List view (sort/filter/search), Timeline view (day grid + today marker + milestone diamonds), assignee, dates, estimate, labels, subtask checklist, comments, activity |
| **Milestones** | Target dates, linked task stats, overdue indicators, completion flow with notifications |
| **Documents** | Markdown editor, **per-document autosave queues** (a save is always bound to one document ID + one content snapshot — switching documents mid-save can never cross-contaminate content), explicit failure state + retry, project linking, preview mode, full-text search |
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
- **Bun** for scripts, tests (bun:test) and the dev workflow
- **Playwright** for browser-level E2E tests
- Self-hosted variable fonts: **Fraunces** (display), **Space Grotesk** (UI), **JetBrains Mono** (metadata)

### Architecture decisions

- **Single-page app on one route** — navigation is client state (Zustand); all authorization is
  enforced **server-side** in every API route via membership checks (`requireMembership` /
  `requireProject` / `requireTask` / `assertLabelsInWorkspace`), so client state is a convenience,
  never a security boundary.
- **Modular monolith**: `src/lib/{auth,permissions,activity,api-helpers,constants}.ts` hold the
  domain logic; API routes stay thin; views compose shared primitives
  (`src/components/rakit/ui-primitives.tsx`).
- **Activity + notifications** are written in the same transaction as the mutation that caused
  them; notifications deduplicate via `@@unique([userId, dedupeKey])`.
- **Kanban persistence (batch reorder)**: dropping a card optimistically reorders client state,
  then `PATCH /api/projects/:id/tasks/reorder` persists the FULL post-drop ordering of every
  affected column inside one transaction. The server validates that each submitted column matches
  the tasks it currently holds (staleness → `409`, refetch + retry) and that every task belongs to
  the project — partial reorders and cross-project manipulation are impossible. The request uses
  `fetch(keepalive)` so an immediate refresh cannot silently cancel it.
- **Document autosave (per-document queues)**: every edit snapshots (title, content, projectId,
  revision) under its document ID. A save only ever reads its own snapshot; switching documents,
  switching workspaces, or unmounting flushes each document's own queue. A revision guard drops the
  pending snapshot only when the server confirmed exactly that revision.
- **Consistent progress**: `done/total` always from `Task.groupBy`, never manual percentages.
- **Cursor pagination** for activity feeds; `groupBy` to avoid N+1 on task stats.
- SQLite keeps local development dependency-free; the schema is normalized (see
  `prisma/schema.prisma`) and ports to PostgreSQL by changing the datasource + URL.

## Getting started

```bash
# 1. install
bun install            # or: npm install

# 2. configure environment
cp .env.example .env   # default: file:../db/custom.db → <project>/db/custom.db

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

The "Masuk sebagai Demo" button is a development convenience: it is **hidden in production
builds** unless `NEXT_PUBLIC_DEMO_MODE=true` is set explicitly, and the seed script **refuses to
run** when `NODE_ENV=production` unless `SEED_DEMO=1`. Demo credentials are public — never treat
them as private accounts on a real deployment.

### Database path resolution (important)

Prisma resolves relative SQLite URLs against the **schema directory** (`prisma/`):

| `DATABASE_URL` | Actual file location |
| --- | --- |
| `file:../db/custom.db` (recommended default) | `<project>/db/custom.db` |
| `file:./db/custom.db` | `<project>/prisma/db/custom.db` |

All runtime database locations are git-ignored. Verified experimentally with Prisma 6.19.

### Migrations

The schema history is version-controlled under `prisma/migrations/` (baseline: `0_init`).

| Command | Purpose |
| --- | --- |
| `bun run db:migrate` | Create/apply a migration in development (`prisma migrate dev`) |
| `bun run db:migrate:deploy` | Apply pending migrations without dev tooling (`prisma migrate deploy`) — use in production/CI |
| `bun run db:push` | Quick local sync of `schema.prisma` without a migration file |
| `bun run db:generate` | Regenerate the Prisma client |

**Upgrading an existing database that was created with `db push`:**

```bash
bun run db:generate
bunx prisma migrate deploy                      # applies migrations on a fresh DB
# for a DB that already has the baseline schema (created via db push):
bunx prisma migrate resolve --applied 0_init    # mark the baseline as applied
bunx prisma migrate status                      # must say "Database schema is up to date!"
```

**Backup / restore (SQLite):**

```bash
cp db/custom.db "db/custom.db.bak-$(date +%F)"                 # backup (stop the server first)
cp db/custom.db.bak-2026-11-06 db/custom.db                    # restore
# integrity check:
bunx prisma db execute --stdin <<< "PRAGMA integrity_check;"
```

SQLite is single-writer and single-instance: do not scale this app horizontally on SQLite, and do
not put the database file on a network filesystem.

### Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Dev server (port 3000, logs to `dev.log`) |
| `bun run build` | Production build (standalone output; **TypeScript errors fail the build**) |
| `bun run start` | Serve the standalone production build |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` for the app **and** the test suites |
| `bun run test` | API + unit integration tests against an isolated throwaway server/database |
| `bun run test:e2e` | Playwright browser tests (downloads Chromium on first run) |
| `bun run db:push` | Push `prisma/schema.prisma` to the database |
| `bun run db:migrate` | Develop schema migrations |
| `bun run db:migrate:deploy` | Apply migrations (production-safe) |
| `bun prisma/seed.ts` | Reset + reseed demo data (refuses in production without `SEED_DEMO=1`) |

## Environment variables

See `.env.example`. Only one variable is required:

| Var | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:../db/custom.db` | SQLite file path (relative to `prisma/`) |
| `NEXT_PUBLIC_DEMO_MODE` | unset | Set `true` to show the demo-login button in production builds |
| `SEED_DEMO` | unset | Set `1` to allow `prisma/seed.ts` to run with `NODE_ENV=production` |
| `RATE_LIMIT_DISABLED` | unset | Set `1` to disable the in-memory rate limiter (tests / load balancers only — never in production) |

No third-party keys are needed — auth, activity, notifications, and search are all local.
If you later port to PostgreSQL, set a Postgres URL and run `prisma migrate dev`.

## Testing

Three layers, all repeatable, all isolated from production data:

1. **Unit** (`tests/unit`) — password hashing (scrypt), rate limiter behaviour incl. the disable
   switch. `bun test tests/unit`
2. **API integration** (`tests/api`) — a runner (`bun run test`) provisions a throwaway SQLite
   database, applies the real migrations, boots a real Next dev server on port 4311, and runs 41
   tests against live HTTP: registration/login/logout, session semantics, password-change
   revocation, cross-workspace isolation (404 for outsiders), role enforcement (VIEWER read-only),
   guessed-ID manipulation, **label workspace isolation (P1.2)**, the full **kanban batch-reorder
   contract** (same-column, cross-column, stale payload → 409, duplicates → 422, cross-project →
   400), document persistence incl. parallel-save safety, activity-feed noise control, search
   scoping, and notification dedupe.
3. **Browser E2E** (`tests/e2e`, `bun run test:e2e`) — Playwright + Chromium against a seeded
   throwaway server: register → onboarding → session survives reload, demo login + logout, generic
   auth error, kanban move persists across reload, and the **document autosave race regression**
   (type in doc A → switch to doc B mid-debounce → both documents persist their own content after
   reload; offline save keeps the text and retry persists it).

Tests never touch production accounts, always use throwaway databases, and wait for real UI or
network conditions (no arbitrary sleeps).

## CI

`.github/workflows/ci.yml` runs on every push/PR: install → Prisma validate + generate →
typecheck → ESLint → API/unit tests (throwaway DB) → production build. The E2E suite stays local
(browser download is heavyweight) — run `bun run test:e2e` before releases.

## Project structure

```
prisma/schema.prisma        # 15-model normalized schema (workspaces → tasks → activity)
prisma/migrations/          # version-controlled SQL migration history
prisma/seed.ts              # realistic Indonesian demo scenario (production-guarded)
src/lib/                    # domain core: auth, permissions, activity, api-helpers, constants
src/app/api/                # REST routes (auth, workspaces, projects, tasks, ideas, …)
src/components/rakit/       # the app: store, shell, views, project workspace, primitives
src/components/rakit/CONVENTIONS.md   # engineering conventions (single source of truth)
tests/unit/                 # auth primitive unit tests (bun:test)
tests/api/                  # HTTP integration suite + isolated runner
tests/e2e/                  # Playwright browser suite
docs/history-cleanup.md     # prepared (not executed) Git history remediation runbook
PRODUCT.md                  # product brief
DESIGN.md                   # visual system & design tokens
```

## Security notes

- Passwords: salted **scrypt**, verified with `timingSafeEqual`; malformed stored hashes never
  throw — they simply fail verification.
- Sessions: random 256-bit tokens, **stored only as SHA-256 hashes**, httpOnly + SameSite=Lax
  cookies, `secure` in production, 30-day expiry, expired-row cleanup on login. Password change
  revokes all other sessions.
- Authorization: every workspace-scoped API resolves the caller's membership server-side; labels
  are validated against the task's workspace before any task-label write; assignees must be
  workspace members; milestones must belong to the task's project; document→project links must
  stay inside the document's workspace.
- Rate limiting: in-memory, per-IP + bucket (register 8/min, login 10/min). **This is per-instance
  state** — behind multiple instances each instance counts separately, and a restart clears the
  buckets. Acceptable for small deployments; swap in Redis for multi-instance.
- A past incident (`.env` + demo database committed in early history) is documented with a full
  remediation runbook in `docs/history-cleanup.md` — the rewrite itself awaits owner approval.

## Known limitations (documented, not hidden)

- **SQLite concurrency**: single-writer; parallel saves to one document resolve to one of the
  submitted contents (verified by test) — there is no row-level revision merge. Two people editing
  the same document at the same moment is last-write-wins.
- **Autosave + full page close**: edits are flushed 900 ms after typing stops or on blur. A hard
  browser close within that window can lose the last keystrokes (the per-document queue protects
  against switching/leaving the view, not against killing the whole browser mid-debounce).
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

1. Run the Playwright suite in CI (cache the browser download) + gitleaks secret scanning
2. URL-backed navigation (deep links + browser history)
3. PostgreSQL + concurrent-write hardening (document revision column) for team deployments
4. Realtime collaboration (WebSocket presence + live task updates)
5. i18n extraction (`id-ID` → `en`) — strings already centralized
6. File attachments for tasks/documents (object storage adapter)
7. Per-project timeline with dependencies (gantt links)
