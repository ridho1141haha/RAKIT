# Task 7-a — Backend API routes (ideas, documents, workspace activity)

**Status:** ✅ Complete. All endpoints implemented, curl-verified against the running dev server, lint-clean.

## Files created (and ONLY these)

1. `src/app/api/workspaces/[id]/ideas/route.ts` — GET (VIEWER+, filters `status/category/priority/q`, `updatedAt desc`, tags parsed to `string[]`, creator included) / POST (MEMBER+, 201 `{ idea }`, IDEA_CREATED activity)
2. `src/app/api/ideas/[id]/route.ts` — GET / PATCH (MEMBER+, IDEA_ARCHIVED logged on ACTIVE→ARCHIVED) / DELETE (MEMBER+, creator-or-ADMIN+ rule with exact spec message)
3. `src/app/api/ideas/[id]/convert/route.ts` — POST (MEMBER+): mode `project` → Project (name truncated 80, color `#B9541B`, status `projectStatus ?? 'PLANNING'`, priority inherited, owner = caller) + ProjectMember LEAD + idea CONVERTED, all in `db.$transaction`; mode `task` → Task in BACKLOG at `max(position)+1`, idea CONVERTED with `convertedProjectId = projectId`; IDEA_CONVERTED logged in both; 201 `{ project }` / `{ task }`
4. `src/app/api/workspaces/[id]/documents/route.ts` — GET (VIEWER+, `projectId`/`q` filters — q matches title OR content, `updatedAt desc`, creator id/name/avatarColor) / POST (MEMBER+, 201 `{ document }`, projectId ownership verified, DOCUMENT_CREATED)
5. `src/app/api/documents/[id]/route.ts` — GET (creator + `project {id,name}`) / PATCH (MEMBER+, projectId verified incl. clearing via `null`) / DELETE (creator-or-ADMIN+ rule)
6. `src/app/api/workspaces/[id]/activity/route.ts` — GET (VIEWER+, cursor pagination identical to project activity route: `cursor`, `limit` default 20 max 50, includes user + project; optional `filter=project|task|idea|document|member` → entityType)

## Response shapes (field names)

- Ideas list/POST/PATCH/GET: `{ ideas: Idea[] }` / `{ idea }` where Idea = `{ id, workspaceId, title, description, category, tags: string[], priority, status, convertedProjectId, createdById, creator: {id,name,email,avatarColor}, createdAt, updatedAt }`
- Convert: `{ project }` (201) or `{ task }` (201) — plain Prisma objects
- Documents: `{ documents: Document[] }` / `{ document }` where Document = `{ id, workspaceId, projectId, title, content, createdById, creator: {id,name,avatarColor}, createdAt, updatedAt }`; single GET adds `project: {id,name} | null`
- Activity: `{ events: ActivityEvent[] (incl. user {id,name,avatarColor}, project {id,name}|null, metadata raw string|null), nextCursor: string|null }`
- Errors: `{ error: string, details?: ZodIssue[] }` via `route()` wrapper; deletes return `{ ok: true }`

## Deviations / notes for next agents

- **Guard added:** converting an already-CONVERTED idea returns 400 `Ide ini sudah dikonversi sebelumnya.` (prevents duplicate project/task creation).
- **Extra activity logs (not in spec but constants exist):** `DOCUMENT_UPDATED` on doc PATCH, `DOCUMENT_DELETED` on doc DELETE — needed so the `filter=document` activity option isn't empty. Idea DELETE logs nothing (no `IDEA_DELETED` exists in `ACTIVITY_TYPES`).
- **IDEA_CONVERTED event** carries `projectId` of the created/target project, so it also shows in that project's feed; `metadata` = `{ mode, projectId, projectName, taskId? }`.
- Idea PATCH allows only `ACTIVE|ARCHIVED` (CONVERTED is set exclusively by the convert endpoint). Unarchive (→ACTIVE) logs nothing.
- Idea/document `category` accepted as free string (1–40 chars), not restricted to `IDEA_CATEGORY_OPTIONS` — spec didn't require enum; frontend sends its options.
- Ideas/document list query enums validated with Indonesian messages (`Status ide tidak valid.`, `Prioritas tidak valid.`, `Filter aktivitas tidak valid.` → 422).
- Creator select for ideas includes `email` (matches `UserInfo` type); for documents only `id,name,avatarColor` (per spec).
- Document creator on DELETE/GET uses `createdById !== user.id && !roleAtLeast(role,'ADMIN')` — VIEWER already blocked at MEMBER+ gate.
- Test data created during verification (workspace Studio Nusantara): project "Dashboard analitik penjualan" (converted), task "Otomatisasi invoice bulanan" in PasarKu backlog, doc "PRD Aplikasi Kasir v2" — left in DB, harmless demo data.
- Login cookies for curl tests: `/tmp/c.txt` (demo OWNER), `/tmp/b.txt` (budi MEMBER), `/tmp/s.txt` (sari ADMIN).
