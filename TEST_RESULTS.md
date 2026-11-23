# WORLDEX — verification log

## Session 4 — Universal Connect OAuth foundation (2026-11-24)

Merged to `main` via PR #1. Main merge commit: `11c1887a36ed42b04ff1bd6d9cf689cca63e686c`.

Verification ran in GitHub Actions on the final feature-branch head immediately before merge (same source content as the merge):
- Dependency install: PASS (`pnpm install --frozen-lockfile`).
- TypeScript: PASS (`pnpm typecheck`).
- Unit tests: PASS — 69 total, 49 passed, 0 failed, 20 skipped.
- Vite production build: PASS.
- Server syntax checks: PASS (`node --check server/index.mjs`, `node --check server/app.mjs`).
- Database integration tests: SKIPPED because a dedicated `WORLDEX_TEST_DATABASE_URL` was not available.
- Live provider OAuth consent/token exchange: NOT RUN (provider app credentials and approval not configured).
- Migration `0002_provider_oauth.sql`: NOT APPLIED (no production database connection/approval was available).
- Production deployment/health: NOT VERIFIED.

The 20 skipped tests are database-dependent tests. Their skip is not a database pass. The automated OAuth tests use mocked provider HTTP responses and test PKCE, state replay protection, token encryption, scope enforcement, internal workspace checks and Google/GitHub revocation behavior. They do not prove that provider developer apps are approved or that live external OAuth works.

Relevant files:
- `server/connector-oauth.mjs` and `server/connector-oauth.test.mjs`
- `db/migrations/0002_provider_oauth.sql`
- `docs/CONNECTOR_OAUTH_SETUP.md`
- `docs/API.md`

Remaining launch requirements: register Google/GitHub/LinkedIn provider apps, configure the server-only OAuth client credentials and 32-byte encryption key in the actual deployment secret manager, review and apply migration 0002, then run staging OAuth tests. No user-facing API key entry is required.

---

# WORLDEX — verification log

## Session 3 (Claude) — patch verification and isolated-database test harness

Environment: still a sandbox with **no network (DNS fails), no Docker/MySQL, no browser**. The requested network-enabled
environment was not available to this session, so the install/typecheck/build/MySQL/browser steps were NOT RUN.

| Check | Result | Evidence |
| --- | --- | --- |
| Session-2 patch applies cleanly to the pristine original ZIP | PASS | `patch -p1` dry-run and real apply; result byte-identical to the working tree and to the delivered zip. |
| Patch scope | PASS | Only `server/{app,auth-service,security,index,repository}.mjs`, `TEST_RESULTS.md` and two new test files changed. `src/`, `db/`, `package.json`, lockfile, `docs/` were untouched by the patch. Every source hunk was reviewed. |
| `node --test` | PASS | 19 pass, 0 fail, 10 skipped (the MySQL suite skips without `WORLDEX_TEST_DATABASE_URL`). |
| MySQL suite isolation guard | PASS | Refuses: database name `prod`, remote host, equality with `DATABASE_URL`, and a name like `latest`. Verified by running it. |
| `pnpm install` / `typecheck` / `build` | NOT RUN | No network. |
| MySQL prepared-statement behaviour (`IN (?)` + array) | NOT RUN | Suite `server/repository.mysql.test.mjs` is written (10 tests incl. a DIAGNOSTIC that prints how mysql2 binds arrays under `execute()` vs `query()`). It has **never been executed**; expect it to need fixes on first real run. |
| Concurrency / isolation / task-lifecycle against real MySQL | NOT RUN | Same suite. |
| Auth gate, `/api/state` wiring, legacy import, workspace/chat/sharing/task UI | NOT BUILT | Blocked on the ability to compile and test; not written blind. |
| 3D globe (R3F), 2D fallback, reduced motion, mobile | NOT BUILT | Needs a browser for verification. |

To run everything: `pnpm verify` (install, typecheck, build, test). For the database suite: `scripts/test-db.sh`, export the printed
`WORLDEX_TEST_DATABASE_URL`, then `pnpm test:mysql`. Requires Docker and MySQL 8 (the migration uses `utf8mb4_0900_ai_ci`, so MariaDB will not work).

---

## Session 2 (Claude) — inspection and server-correctness fixes

Environment: sandbox with **no network access, no browser, no MySQL**. Dependencies could not be installed, so only
checks that need Node built-ins were runnable. Everything else is explicitly NOT RUN below.

| Check | Result | Evidence |
| --- | --- | --- |
| `node --test` (baseline, before any change) | PASS | 5/5 original tests. |
| `node --test` (after changes) | PASS | 19/19: 5 original + 9 in `server/auth-service.test.mjs` + 5 in `server/repository.test.mjs`. |
| `node --check` on `server/app.mjs`, `auth-service.mjs`, `repository.mjs`, `index.mjs` | PASS | Syntax only; `app.mjs` and `index.mjs` import Express/mysql2 and were **not executed**. |
| `pnpm install` / `pnpm typecheck` / `pnpm build` | NOT RUN | No network; `tsc`, `vite`, `@types/react`, `lucide-react` unavailable. The frontend was not modified this session. |
| Express route tests / HTTP API tests | NOT RUN | Express not installed. |
| MySQL migration and integration tests | NOT RUN | No database; shared database untouched. |
| Manus OAuth round-trip, live LLM | NOT VERIFIED | Needs real Manus credentials and a browser. |
| 3D globe, responsive, reduced-motion, performance | NOT BUILT / NOT RUN | No browser available to render or test WebGL. |

### Defects found by reading the code, each reproduced with a failing test before being fixed

1. **Signed-in users appeared signed out on same-origin GETs.** Browsers omit `Origin` on same-origin GET/HEAD, but
   `resolveSession` required an exact Origin match, so `GET /api/auth/me` and `GET /api/state` would return
   unauthenticated. Reproduced against the original code (1 failing test; the other 7 session/CSRF/nonce/expiry tests passed
   on the original). Fix: a missing Origin is tolerated only for GET/HEAD whose `Sec-Fetch-Site` is not cross-/same-site
   (`isTrustedSafeRead`); mutations still require matching Origin and CSRF.
2. **Arrays bound to `IN (?)` through prepared statements** in `loadState`/`saveState` (13 sites). mysql2 `execute()` is
   believed not to expand arrays; if so, chats/messages/projects would load empty and the cross-account `assertNoForeign`
   ownership checks would match nothing. The tests model prepared-statement semantics (original: 5/5 failing). Fix: explicit
   `IN (?,?,?)` with scalar bindings, correct under either driver behaviour. **Still to confirm against real MySQL in a rollback-only test.**
3. **`server/index.mjs` ran migrations on every start**, which would have applied the schema to the shared managed database
   merely by launching the dev server. Now opt-in (`WORLDEX_AUTO_MIGRATE=1`); the explicit path is `pnpm db:migrate`.

### Known issues found, not yet fixed

- `PUT /api/state` is upsert-only: deleting a workspace/chat/project in the UI would not propagate. Needs an explicit
  `DELETE /api/workspaces/:id` (with name confirmation) before workspace deletion can be offered.
- `PUT /api/state` is last-write-wins with no version check; a stale second tab can overwrite newer workspace fields.
- The SPA has no `/auth/callback` route; the OAuth redirect returns there with `code`/`state` and the SPA must POST them to
  `/api/auth/oauth/callback`.
- Rate limiting keys on `request.ip` and Express `trust proxy` is not set; behind a proxy all users may share one bucket.
- `resolveSession` creates sessions from a platform-signed JWT lacking `sid` (preview path). This needs an Origin to bind,
  so it cannot work on a first-contact GET. Unverified against Manus; do not treat as a login path.

---

## Session 1 (Manus) — original snapshot

Environment: Manus Sandbox, project directory `/home/ubuntu/worldex`. This report is for the current uncommitted source state.

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm test` | PASS | 5 Node tests passed; JWT signing/verification, origin policy, CSRF binding/cookie flags, validation of assistant messages and bounded task input. |
| `pnpm typecheck` | PASS | `tsc --noEmit` exited 0. |
| `pnpm build` | PASS | TypeScript build and Vite production bundle succeeded; server entrypoint syntax checks succeeded. |
| MySQL migration | NOT RUN | Shared development/production managed database was not modified. |
| MySQL integration/security tests | NOT RUN | No rollback-only integration suite has yet been implemented. |
| Manus OAuth callback | NOT VERIFIED | Provider round-trip has not been exercised in browser. |
| Live LLM provider | NOT VERIFIED | No model completion was executed. API correctly reports `llmVerified:false`. |
| Preview health | NOT CHECKED | Application server has not been restarted with the new supervisor and database migration is unapplied. |

Important: this is not a completed server-side product yet. The existing React shell still relies on browser `localStorage` and has not been wired to authentication, API-loaded persistent state, server-side chat sync, database grant intents or task approval/status polling. Therefore authentication/security/persistence acceptance is not claimed complete. Do not apply the migration or publish until the frontend integration and transactional integration tests are finished and reviewed.
