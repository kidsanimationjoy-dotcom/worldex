# Kickoff prompt for Claude Code (network + Docker + Chromium required)

Paste everything inside the fenced block into Claude Code, started in this project folder.

```
You are continuing the WORLDEX project in the current directory (extracted from worldex-project.zip, which is the source of truth). Read CLAUDE_HANDOFF.md, HANDOFF.md, TODO.md (top section), TEST_RESULTS.md and docs/API.md before doing anything.

HARD RULES
- Never use the shared/production database. Only a disposable local MySQL 8 in Docker, named like worldex_test, on 127.0.0.1.
- Never apply production migrations. Never set WORLDEX_AUTO_MIGRATE=1 except against the disposable test DB. New SQL migrations may be drafted but not applied outside the test DB, and must be shown to me for review.
- Do not commit, push or deploy.
- Preserve the existing Manus backend, workspace architecture, product scope and existing work. Do not rewrite the app.
- Never mark anything done/verified unless a real command or browser test passed. Report failures as failures, with raw output.
- No fake connected accounts, no invented statistics, no fake auth bypass. Provider secrets stay server-side.

PHASE 0 - ENVIRONMENT AND BASELINE (stop and report before Phase 1)
1. Report: node -v, pnpm -v (use corepack prepare pnpm@10.10.0 --activate), network/npm registry access, docker info, and Chromium availability (npx playwright install chromium).
2. Run pnpm verify, then pnpm typecheck, pnpm build, pnpm test. Fix any failures in the existing code, minimally, and explain each fix.
3. Run scripts/test-db.sh, export the printed WORLDEX_TEST_DATABASE_URL, run pnpm test:mysql. The suite has never been executed: fix test or repository issues as needed. Report the DIAGNOSTIC output on how mysql2 binds arrays under execute() vs query(), and whether the original IN (?) pattern really failed.
4. Update TEST_RESULTS.md with exact results. Then wait for my go-ahead.

PHASE 1 - SERVER (each item with tests, run against the disposable DB)
- DELETE /api/workspaces/:id with name confirmation, scoped strictly to the owner.
- Optimistic concurrency on PUT /api/state (draft migration 0002 for review; apply only to the test DB). Stale snapshots must be rejected with a clear 409, never silently overwrite.
- Explicit connection-sharing endpoints (create/revoke) with backend ownership enforcement. These remain database intents (external_enforced=0); do not claim real provider access.
- Fix known issues listed in TEST_RESULTS.md (trust proxy / rate-limit keying, /auth/callback handling).
- Keep tests: isolation between users and between workspaces, concurrency, task lifecycle.

PHASE 2 - FRONTEND INTEGRATION
- /auth/callback route that POSTs code and state to /api/auth/oauth/callback; authenticated gate via GET /api/auth/me; logout; session-expiry handling. No preview bypass.
- Load and save through /api/state as the sole authority; CSRF header on mutations; visible save/error/conflict states.
- Explicit, user-approved one-time import of legacy localStorage key worldex.mvp.state.v1: show counts, require confirmation, never overwrite non-empty server data.
- Persistent workspace create/switch/edit/delete (with safeguards) and chats: new, search, rename, archive, reopen, message-save errors.
- Connection sharing UI wired to the new endpoints, labelled as database intent only.
- AURIX: task create, approve/reject, status polling, results, failures, retries. Show provider configured vs verified honestly; never fabricate AI responses.

PHASE 3 - 3D GLOBE (React Three Fiber / Three.js, integrated into the real app, e.g. on Home and Workspaces)
- Smooth auto-rotation, mouse drag and touch rotation, zoom controls, hover labels, smooth camera transitions between workspaces, orbiting elements and animated particles along lines.
- Nodes come ONLY from real data: workspace nodes from the user's workspaces; integration nodes only from real connection records; lines only for explicitly authorised sharing; disconnected integrations must not appear connected. With no connections, show an attractive intro state with no fake data.
- Selecting a workspace node opens that workspace; selecting an integration node opens its details.
- 2D fallback (canvas/SVG) when WebGL is unavailable or the user prefers reduced motion; honour prefers-reduced-motion; mobile layout; DPR and frame-rate limits; dispose of GPU resources on unmount.
- Design: bg #090B12, secondary #11182A, blue #477BFF, violet #8B72FF, text #F5F7FF, muted #8C96AA.

PHASE 4 - BROWSER VERIFICATION (Playwright + Chromium)
- Test: auth gate, workspace/chat persistence after reload, cross-workspace isolation in the UI, globe renders, drag changes rotation, zoom works, node click opens the right panel, no-connections state, reduced-motion and WebGL-disabled fallbacks, mobile viewport. Save screenshots to verification-output/.

FINISH
- Update HANDOFF.md, TODO.md, TEST_RESULTS.md and docs/API.md with real results.
- Give me: typecheck/build/test/mysql/playwright results, a list of completed vs incomplete features, and the provider/credential setup still required (Manus OAuth, LLM key, real integrations). Do not claim completion for anything untested.

Work phase by phase. After Phase 0 stop and report. After each later phase, summarise real results before continuing.
```
