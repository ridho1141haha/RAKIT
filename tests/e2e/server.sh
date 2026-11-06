#!/usr/bin/env bash
# E2E web server: throwaway database + migrations + deterministic demo seed.
# Playwright starts and kills this process; the temp DB lives in /tmp.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="/tmp/rakit-e2e.db"
export DATABASE_URL="file:${DB}"
export RATE_LIMIT_DISABLED=1
export NEXT_PUBLIC_DEMO_MODE=true

rm -f "$DB" "$DB-journal" "$DB-wal" "$DB-shm"
./node_modules/.bin/prisma migrate deploy
bun prisma/seed.ts

exec ./node_modules/.bin/next dev -p 4310
