# RAKIT — Product Brief

**Tagline:** Turn ideas into things that ship. (*Ubah ide menjadi hal yang benar-benar selesai.*)

## What RAKIT is

RAKIT is a project command center for individuals, students, indie developers, and small
collaborative teams. It guides work through the full lifecycle:

**Idea → Planning → Execution → Review → Completion**

It is a single, coherent product — not a bundle of dashboards. Every surface answers one of
three questions: *what should I do next?*, *where is this thing?*, *how is it going?*

## Users

| Persona | Primary needs |
| --- | --- |
| Individu / freelancer | Capture ideas fast, keep personal projects moving, see what's due |
| Mahasiswa | Plan tugas/UKM projects with milestones and deadlines |
| Tim kecil (2–10) | Share a workspace, divide tasks, know who does what |

## Core loops (must all be real, end-to-end)

1. **Capture** — an idea lands in the Idea Inbox in < 5 seconds (type title, Enter).
2. **Commit** — an idea converts into a project (or task) with one action, keeping its content.
3. **Plan** — a project gets status, priority, dates, owner, milestones, and tasks.
4. **Execute** — a Kanban board (drag-and-drop, persisted), list view, and timeline view all
   read the same task records. Subtasks, comments, labels, effort estimates.
5. **Review** — activity feed + notifications record every meaningful event, exactly once.
6. **Reflect** — dashboard derives all numbers from real rows: active projects, upcoming
   deadlines, my tasks, weekly completion chart, milestones.

## Module map

- **Auth & Onboarding** — register/login/logout, hashed passwords, server sessions (httpOnly
  cookie), onboarding wizard (workspace → first project → workflow hint).
- **Workspaces** — multiple per user, member management, 4 roles (Owner/Admin/Member/Viewer),
  invitations, server-enforced permission checks on every operation.
- **Dashboard** — real aggregates only; every tile navigates somewhere useful.
- **Idea Inbox** — quick capture, categories/tags/priority, search/filter, archive, convert.
- **Projects** — status, priority, dates, owner, members, progress (computed from tasks),
  milestones, documents, activity history.
- **Tasks** — 5 statuses (Backlog/To Do/In Progress/In Review/Done), Kanban + List + Timeline,
  checklist, comments, labels, estimates, assignee, due dates, activity.
- **Milestones** — target dates, linked tasks, roadmap strip, overdue indicators.
- **Documents** — Markdown editor with autosave (never silently loses content), project linking,
  search.
- **Activity & Notifications** — deduplicated events, read/unread notification center.
- **Search & Command Palette** — `/` or `⌘K` global search across projects/tasks/ideas/documents/
  milestones; `C` new task, `N` new idea, `G D` dashboard, `?` shortcut help.

## Language & locale

- UI language: **Indonesian**; strings centralized in one dictionary module so i18n can be added
  without touching views.
- Locale formatting: `id-ID` (dates via `Intl`), timezone: **Asia/Jakarta**.

## Non-goals (v1)

- No file/image uploads (documents are text-based Markdown).
- No realtime multi-user sync (polling + optimistic UI is enough at this scale).
- No email delivery for invitations — invites are redeemable in-app by email match.
- No external OAuth — email/password auth keeps local development dependency-free.

## Acceptance snapshot

Registration → workspace → project → idea → convert → tasks on Kanban (drag persists after
reload) → milestones → documents autosave → activity + notifications → search. All enforced
server-side; unauthorized users can never read another workspace's data, even by direct API call.
