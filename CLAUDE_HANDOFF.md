# WORLDEX developer handoff — current status

Last updated: 2026-11-24. Main branch includes the Universal Connect OAuth foundation (merged PR #1).

## Project architecture

- React 18 + Vite + TypeScript frontend in `src/`.
- Express 5 ESM API in `server/`; MySQL2 repository in `server/repository.mjs`; migration runner in `server/migrate.mjs`; background AURIX task worker in `server/worker.mjs`.
- `db/migrations/0001_server_core.sql`: users, sessions, workspaces, conversations/messages, sharing-intent records, audit events, task approvals/attempts and rate limits.
- `db/migrations/0002_provider_oauth.sql`: one-time OAuth transactions and workspace-owned provider connections with encrypted access/refresh tokens.
- Manus sign-in/session service: `server/auth-service.mjs`, `server/security.mjs`, `server/manus-provider.mjs`.
- External provider OAuth: `server/connector-oauth.mjs`.
- API contract: `docs/API.md`; provider setup checklist: `docs/CONNECTOR_OAUTH_SETUP.md`.
- Development: `pnpm dev`; production server: `pnpm start`; migrations: `pnpm db:migrate`.

## Universal Connect: implemented

The connector marketplace is wired to authenticated backend endpoints. It can show provider readiness, list connected accounts for an owned workspace, let a signed-in user choose permission groups, start official provider authorization, handle provider callbacks and disconnect a connection.

OAuth adapters are implemented for:
- Google: Profile, Content, Publishing, Analytics and Messages permission groups.
- GitHub: Profile.
- LinkedIn: Profile and Publishing.

The flow uses one-time state records tied to the authenticated user and workspace, PKCE S256, encrypted PKCE verifiers, and AES-256-GCM encryption for stored provider tokens. The public API never returns tokens. Internal token retrieval checks the user/workspace and requested permission group. Refresh is attempted only when the provider issued a refresh token.

Disconnect attempts provider-side revocation for Google and GitHub. LinkedIn's documented member OAuth flow has no public token-revocation endpoint; WORLDEX therefore deletes its local tokens and tells the user to revoke the app from LinkedIn's own permitted-services settings. The UI distinguishes confirmed revocation from local token deletion.

Other marketplace cards remain informational. OAuth alone does not implement provider API actions such as publishing, messages, ads, commerce changes or automation. Each action needs a separate adapter, granular scope check, user approval, audit trail and tests.

## Required deployment configuration — NOT YET DONE

Ordinary users do not supply API keys. These are platform-owner deployment secrets and provider application registrations:

- `WORLDEX_TOKEN_ENCRYPTION_KEY`: 32-byte key as Base64 or 64 hex characters.
- `WORLDEX_OAUTH_GOOGLE_CLIENT_ID` and `WORLDEX_OAUTH_GOOGLE_CLIENT_SECRET`.
- `WORLDEX_OAUTH_GITHUB_CLIENT_ID` and `WORLDEX_OAUTH_GITHUB_CLIENT_SECRET`.
- `WORLDEX_OAUTH_LINKEDIN_CLIENT_ID` and `WORLDEX_OAUTH_LINKEDIN_CLIENT_SECRET`.

The provider applications must be created and approved in the relevant official developer consoles by the platform owner or other eligible account holder. Register exact callback URLs for the production domain:

- `https://YOUR-WORLDEX-DOMAIN/api/connections/oauth/callback/google`
- `https://YOUR-WORLDEX-DOMAIN/api/connections/oauth/callback/github`
- `https://YOUR-WORLDEX-DOMAIN/api/connections/oauth/callback/linkedin`
- `https://YOUR-WORLDEX-DOMAIN/auth/callback` for Manus sign-in.

Set provider credentials and the encryption key in the deployment's server-only secret manager. Never commit them, add them to Vite variables, or expose them to the browser. The current GitHub repository integration does not have access to the production deployment secret manager or provider developer consoles, so it cannot create these accounts, accept provider agreements, or install these credentials.

## Database migration: NOT APPLIED

The server deliberately does not auto-apply migrations to the shared database. Review and approve `db/migrations/0002_provider_oauth.sql`, back up the managed database, then run `pnpm db:migrate` in the deployment environment. Do not reset or replace the database. The connected provider routes will fail to read/write connection records until migration 0002 has been applied.

## What is still not production-complete

- The main UI now checks the authenticated session at startup, restores a signed-in user's server workspace state, and automatically writes later workspace changes to `/api/state` with the session CSRF token. The first transfer from a browser-local profile remains an explicit **Save workspace to account** action; it is never silently imported. In account mode the server is authoritative and account data is not copied into browser local storage. Signed-out preview mode remains browser-local.
- Provider credentials, domain callback allowlists, migration 0002 and real provider application approvals are not configured.
- Real provider consent/token exchanges have not been tested against live Google, GitHub or LinkedIn apps.
- No provider API action (publishing, messaging, ads, store management, etc.) should be represented as implemented merely because OAuth works.
- Production deployment/health has not been verified from this repository integration.
- Database-backed integration tests remain skipped unless a separate safe `WORLDEX_TEST_DATABASE_URL` is configured.

## Verification

GitHub Actions passed on the merged main commit `11c1887a36ed42b04ff1bd6d9cf689cca63e686c`:
- Dependency install: passed.
- TypeScript typecheck: passed.
- Unit tests: 49 passed, 0 failed; 20 database-dependent tests skipped without a dedicated test database.
- Database-dependent tests: 20 skipped because no dedicated test DB was configured.
- Vite production build: passed.
- Server syntax checks: passed.

These are code/CI results, not live OAuth, database migration, provider app verification or production deployment results.

## Safety rules for future work

- Never apply migrations automatically to a shared/production database.
- Never log or return access/refresh tokens, provider secrets, encryption keys, or OAuth codes.
- Keep all records scoped to the authenticated user and the specific workspace.
- Use least-privilege scopes and only show scopes the provider actually granted.
- Obtain explicit user approval before any external side effect (publish, send, spend, delete, update).
- Do not claim connected, verified, published or deployed without a real corresponding provider/deployment response.
- Do not claim the whole app is server-backed until the global auth/state integration is completed.
