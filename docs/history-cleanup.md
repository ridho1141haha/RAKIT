# Git history remediation — exposed `.env` and `db/custom.db`

> STATUS: **prepared, NOT executed.** Rewriting the history of a public
> repository is a destructive, coordinated operation (force-push) and requires
> explicit owner approval. Everything below is ready to run.

## What happened

The initial commits of this repository (everything before and including
`bb0e908`, removed in `66a45cc`) contained two runtime artifacts:

| Path          | Commits containing it      | Content category                                                                 |
| ------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `.env`        | `68b44ed`, `bb0e908`       | One key: `DATABASE_URL` → a **local SQLite file path**. No credentials, no API keys. |
| `db/custom.db`| `68b44ed`, `bb0e908`       | 282 KB SQLite database with **real records** (see impact below).                 |

Although both files were deleted from the working tree in `66a45cc`, they
remain **fully retrievable from Git history**:

```bash
git show 68b44ed:db/custom.db > leaked.db   # works on any clone
```

## Impact assessment (verified against the actual historical objects)

- `db/custom.db` (both historical versions are byte-identical in content):
  - 4 `User` rows — emails on the `rakit.id` domain (demo/seed accounts),
    names, and **salted scrypt password hashes** (irreversible; the demo
    passwords were already public in the README).
  - 1 `Session` row — stores a **SHA-256 hash** of the session token; the raw
    token is NOT recoverable from the file. The session's expiry was still in
    the future at audit time → treat the session as exposed-but-unusable and
    invalidate it anyway (see below).
  - Full demo content: 2 workspaces, 5 projects, 28 tasks, 4 documents
    (including document body text), comments, activity events.
  - 2 freelist pages (deleted-row remnants) exist in the file; assume
    anything ever written to that database is exposed.
- `.env`: a local filesystem path only. No rotation needed; low severity.

**Required remediation beyond history rewrite:**

1. Change the demo account passwords (or recreate the demo database) — the
   old hashes are public data now.
2. Invalidate all existing sessions on the affected deployment
   (`DELETE FROM Session;` or equivalent) — cheap and definitive.
3. Treat the user names/emails in that database as disclosed; if this data
   was ever more than seed data, notify the affected people.

## Why files must be purged from history, not just deleted

Deleting in a new commit leaves every historical blob reachable. Forks and
clones made before the rewrite keep the objects forever. Cached commit URLs
(e.g. `github.com/<owner>/<repo>/tree/<old-sha>`) may keep serving the content
until GitHub's cache expires — contact GitHub Support to expedite removal of
dangling data after a force-push.

## Prepared cleanup procedure

### 0. Preconditions

- Announce to all collaborators: history WILL be rewritten; they must
  re-clone afterwards and rebase any local work.
- Take a final mirror backup (keeps a recoverable copy of the OLD history):

  ```bash
  git clone --mirror git@github.com:ridho1141haha/RAKIT.git rakit-backup-pre-rewrite.git
  ```

  (A bundle backup of the pre-rewrite state was also created during the
  audit: `rakit-backup-20261106-142601.bundle`.)

### 1. Install git-filter-repo (safer + faster than filter-branch/BFG)

```bash
pip install git-filter-repo   # or: brew install git-filter-repo
```

### 2. Fresh mirror clone (filter-repo requires one)

```bash
git clone --mirror https://github.com/ridho1141haha/RAKIT.git rakit-clean.git
cd rakit-clean.git
```

### 3. Purge the sensitive paths from ALL refs (branches + tags)

```bash
git filter-repo \
  --invert-paths \
  --path .env \
  --path db/custom.db \
  --force
```

`--invert-paths` removes exactly these paths everywhere while preserving all
other files, commit messages, and tags. `.env.example` is a different path and
remains tracked. Verify no other runtime DBs ever existed (this audit checked:
only `db/custom.db` was ever committed).

### 4. Validate the cleaned history

```bash
# no historical tree may contain the paths anymore
git log --all --oneline -- .env db/custom.db          # → empty output

# every commit still parses and the working tree builds
git fsck --full
git clone ../rakit-clean.git ../test-clone && cd ../test-clone
bun install && bun run typecheck && bun run build      # must succeed
```

### 5. Force-push the rewritten history

```bash
cd ../rakit-clean.git
git push --force --all origin
git push --force --tags origin
```

### 6. Post-rewrite tasks

- [ ] All collaborators: `git clone` fresh; do NOT pull/rebase old clones.
- [ ] Contact GitHub Support to purge cached/dangling views of the old commits.
- [ ] Re-run the secret-audit: `git log --all --diff-filter=A -- .env db/custom.db` → empty.
- [ ] Rotate the demo credentials + invalidate sessions (see impact above).
- [ ] Add a pre-push secret scan to CI (e.g. `gitleaks`) so this class of
      incident cannot recur silently.

## Prevention already shipped with this branch

- `.gitignore` now ignores every plausible runtime database location
  (`db/*.db`, `prisma/db/`, `*.sqlite*`) and journal/WAL sidecars.
- `.env*` was already ignored with only `.env.example` tracked.
- `prisma/seed.ts` refuses to run against `NODE_ENV=production` unless
  `SEED_DEMO=1` is set explicitly, so production data cannot be silently
  replaced with demo data (or vice versa).
