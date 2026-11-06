# RAKIT — Deployment & Database Operations

This document covers what you must know to run RAKIT outside the development
sandbox: how data persists, what the limits are, and how to change the schema
safely. Read it before your first production deploy.

---

## 1. Database: SQLite, one file

RAKIT ships with **SQLite** via Prisma (`prisma/schema.prisma`,
`datasource db { provider = "sqlite" }`). The whole database is a single file
pointed to by `DATABASE_URL`:

```bash
# .env — path is resolved RELATIVE TO THE prisma/ FOLDER
DATABASE_URL="file:./db/custom.db"   # → <project>/db/custom.db
```

### Persistence across restarts — VERIFIED

The database lives entirely on disk; nothing is kept in memory that must be
flushed. Verified in this codebase by killing the dev server process
(`SIGTERM`), restarting it, and logging in again: the workspace, all projects,
tasks and documents were intact. Application restarts are safe at any time —
there is no shutdown hook to worry about.

### What WILL silently replace your database

- **`bun run db:push`** (`prisma db push --accept-data-loss`) — applies the
  schema *and may drop columns/tables that don't match*. This is a development
  tool. **Never run it against production data.**
- **`bun prisma/seed.ts`** — deletes *all* workspace data and re-creates demo
  content. Development/demo only.
- **Container/VM redeploy that mounts a fresh volume** — if `db/custom.db`
  lives inside the container filesystem (not a mounted volume), every deploy
  wipes your data. Mount a persistent volume and point `DATABASE_URL` at it,
  e.g.:

```bash
DATABASE_URL="file:/data/rakit/app.db"   # absolute path → mounted volume
```

> Note the path semantics: `file:./db/custom.db` resolves relative to
> `prisma/`, not to the process CWD. In containerized deployments prefer an
> absolute path to avoid ambiguity between `next dev`, `next build`, and the
> standalone `server.js`.

### Backups

SQLite is a single file — backup is a file copy, but do it safely:

```bash
# Online (safe while the app runs): use the backup command of sqlite3,
# or VACUUM INTO. Copying the raw file while a write is in flight can
# produce a torn copy.
sqlite3 /data/rakit/app.db ".backup '/backups/rakit-$(date +%F).db'"
```

For the dev default (`db/custom.db`) the same applies. Schedule daily backups
and test restores; a backup you never restored is a rumor.

---

## 2. Single-instance limitation (be honest about scale)

SQLite allows **one writer at a time**. RAKIT therefore runs correctly as a
**single application instance**:

- ✅ One instance + restarts + many concurrent readers/writers through that
  instance (writes are serialized per request; Prisma transactions keep
  reorder/label operations atomic).
- ❌ Two app instances pointed at the same SQLite file (last-writer conflicts
  outside transactions; `SQLITE_BUSY` under load).
- ❌ Horizontal scaling / multi-AZ deployments without migrating the database.

Other practical limits:

- The auth **rate limiter is in-memory** — counters reset on restart and are
  per-instance. Fine for one instance; behind a load balancer each instance
  counts separately (use a shared store if you migrate to multiple instances).
- Sessions are DB rows (`Session` table) — they survive restarts and are not
  affected by the single-instance limit.

---

## 3. Safe schema migration strategy

**Development (schema experiments):**

```bash
bun run db:push        # fast sync, may lose data — dev only
```

**Production (data must survive):**

```bash
# 1. From your schema change, create a migration locally:
bunx prisma migrate dev --name describe_the_change
#    → creates prisma/migrations/<timestamp>_describe_the_change/migration.sql
#    → commit the migration file to git

# 2. In production, apply pending migrations WITHOUT dev semantics:
bunx prisma migrate deploy
#    → applies only committed migrations, in order, inside a transaction,
#      never invents schema changes, never drops data to force-fit the schema
```

Rules of thumb:

- Additive changes (new nullable column, new table, new index) are always safe.
- Destructive changes (drop column, tighten `NOT NULL`, change types) need a
  staged plan: add the new column → backfill → switch reads/writes → drop the
  old column in a later migration.
- Always `SELECT` a fresh backup before `migrate deploy` on production.
- `prisma migrate deploy` requires a **migrations folder**. If your project
  has only ever used `db push`, generate a baseline first:
  `bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`
  then `bunx prisma migrate resolve --applied 0_init`.

---

## 4. PostgreSQL migration path (NOT executed — explicit plan only)

RAKIT is intentionally on SQLite. **Do not migrate to Postgres without the
deployment plan below being approved and executed deliberately.** The schema
contains no SQLite-only constructs (enums are plain strings), so the move is
mechanical:

1. **Provision Postgres** (managed or self-hosted), create a role + database,
   enable TLS.
2. **Switch the datasource** in `prisma/schema.prisma`:
   `provider = "postgresql"`, point `DATABASE_URL` at the new URL
   (`postgresql://user:pass@host:5432/rakit`).
3. **Copy the data** with a one-shot migration (downtime window, small data):
   - Dump SQLite → transform → load via a script using Prisma on both ends
     (`findMany` from SQLite, `createMany` to Postgres, preserving ids).
   - Or use `pgloader` with a SQLite source.
4. **Verify** row counts per table + a golden-path smoke test (login →
   workspace → board → document).
5. **Cut over**: stop the app, run step 3 final sync, start the app against
   Postgres. Keep the SQLite file as an archive for 30 days.
6. Only after step 5, consider multiple app instances behind a load balancer
   (Postgres removes the single-writer limit; the in-memory rate limiter then
   also needs a shared store — Redis or the `Session`-style DB table).

---

## 5. Production build & run

```bash
bun install
bun run typecheck     # tsc --noEmit — CI gate, also enforced by next build
bun run lint          # eslint
bun run build         # next build — FAILS on type errors (ignoreBuildErrors=false)
DATABASE_URL="file:/data/rakit/app.db" NODE_ENV=production bun .next/standalone/server.js
```

Build config notes:

- `next.config.ts` sets `output: "standalone"` (self-contained server bundle)
  and `typescript.ignoreBuildErrors: false` — type errors fail the build.
- Playwright E2E (`bunx playwright test`) runs against a dev server on port
  3000; keep it out of the production runtime image.
