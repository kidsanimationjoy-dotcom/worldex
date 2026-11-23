# Claude handoff — WORLDEX server MVP

Continue the existing project at `/home/ubuntu/worldex`; preserve the browser-local MVP and existing canonical checkpoint. Do not rebuild the app or add website-building/publishing functionality.

## Current architecture

- React 18 + Vite + TypeScript frontend in `src/`.
- Express 5 ESM API in `server/`; MySQL2 repository in `server/repository.mjs`; migration runner in `server/migrate.mjs`; worker in `server/worker.mjs`.
- Additive migration: `db/migrations/0001_server_core.sql` (users/sessions, tenant-owned workspaces and conversations/messages, intent-only sharing grants, audit, approval/task attempts, rate-limit buckets).
- Manus OAuth/JWT/session code in `server/auth-service.mjs`, `server/security.mjs`, `server/manus-provider.mjs`.
- API contract: `docs/API.md`.
- Development entrypoint is `node server/dev.mjs`; production entrypoint is `node server/index.mjs`; scripts are in `package.json`.

## Safety and status

Managed MySQL is shared by Preview/development/publication. Do not reset it. Migration is additive but has not been approved/applied in this handoff snapshot. Any DB integration tests must use one connection and rollback the outer transaction; never seed committed test users/data. Auto-publish is off. Do not claim OAuth callback or live LLM success without a real successful test. Provider identity is Manus; local password/reset email is not implemented. Connection grants remain explicit database intents (`external_enforced=0`), not actual provider permissions.

## Known integration gaps at handoff

The frontend still imports/saves authoritative state with `localStorage` (`src/App.tsx`, `src/lib/store.ts`) and still advertises browser-local/no-login behavior. It has not yet been wired to `/api/auth/*`, `/api/state`, connection intent persistence, or AURIX task approval/polling. The OAuth callback endpoint is POST-based; verify provider redirect behavior and implement a browser-safe callback handoff if necessary. Review repository transaction and concurrency semantics, and build full auth/ownership/chat/grant/task tests. Ensure client state round-trips assistant messages without allowing client-authored assistant records (validation drops assistant copies on PUT).

Repository additions include `health()` and `ownsWorkspace()` and the grant/task data paths. Inspect SQL and run `pnpm typecheck`, `pnpm build`, `pnpm test` before enabling migrations or Preview. `pnpm-lock.yaml` is updated for Express/mysql2. No code commit/push has been made for this unfinished change set.

## Next implementation sequence

1. Finish authenticated React gate using Manus OAuth and `/api/auth/me`; no Preview bypass. Load state from API, with explicit user-confirmed one-time import of legacy localStorage, and use server persistence as the sole authority.
2. Wire chat title/archive/message operations and workspace selection to server state. Add optimistic save/error handling and guard against stale multi-device snapshots.
3. Wire sharing draft create/revoke to persistence; label clearly as database intents only; verify target ownership on every mutation.
4. Add approval/reject/status polling to ChatView and show actual worker result/failure. Keep provider configured and provider verified as distinct flags.
5. Add security/API/integration tests; migration only after SQL review. Complete typecheck/build/test and verify health in Preview.
6. Update `HANDOFF.md`, `TODO.md`, exact test results and unconfigured credential/provider steps. Commit/push only after all checks and reconciling `origin/main`; do not publish.
