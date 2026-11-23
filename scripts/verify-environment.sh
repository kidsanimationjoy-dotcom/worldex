#!/usr/bin/env bash
# Runs the baseline verification in a network-enabled environment and records raw output in verification-output/.
# Safe by default: touches no database unless WORLDEX_TEST_DATABASE_URL points at a disposable *_test database.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=verification-output; mkdir -p "$OUT"
status=0
step() { local name="$1"; shift; echo "== $name"; if "$@" >"$OUT/$name.log" 2>&1; then echo "   PASS ($name)"; else echo "   FAIL ($name) — see $OUT/$name.log"; status=1; fi; }
node -v | tee "$OUT/node-version.txt"
corepack enable >/dev/null 2>&1 || true
step install     pnpm install --frozen-lockfile
step typecheck   pnpm typecheck
step build       pnpm build
step test        pnpm test
if [ -n "${WORLDEX_TEST_DATABASE_URL:-}" ]; then step test-mysql pnpm test:mysql; else echo "== test-mysql  SKIPPED (run scripts/test-db.sh and export WORLDEX_TEST_DATABASE_URL)"; fi
echo "Raw logs in $OUT/. Paste the summary lines into TEST_RESULTS.md; do not mark anything verified that did not PASS."
exit $status
