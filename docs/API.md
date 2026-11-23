# WORLDEX API

Base path: `/api`. JSON requests use same-origin cookies; do not put credentials in browser storage.

## Authentication

- `POST /auth/oauth/start` starts Manus OAuth for the browser `Origin`. Returns `{authorizationUrl}` and sets a short-lived, HttpOnly OAuth nonce cookie.
- Manus returns the browser to the configured callback URL. `POST /auth/oauth/callback` exchanges the one-time `code` and `state`, validates nonce/state, establishes a server session and returns `{authenticated,user,csrfToken}`. The callback origin must be allowlisted by the Manus OAuth application.
- `GET /auth/me` returns `{authenticated:false}` or the authenticated user and a session-bound CSRF token.
- `POST /auth/logout` revokes the server session and clears `webdev_app_session`.

The app uses Manus identity rather than a local password database. Registration/login and account recovery are provided by the configured Manus identity experience; WORLDEX does not implement password reset emails. HTTPS Preview cookies use `SameSite=None; Secure`; local HTTP uses `SameSite=Lax`. All state-changing requests require same-origin `Origin` and `X-CSRF-Token`.

## State and workspace data

- `GET /state` returns only the authenticated user's state.
- `PUT /state` validates a bounded state snapshot and transactionally upserts workspaces, conversations, user-authored draft messages, projects, records, sharing intents and audit events. IDs already owned by another user/workspace are rejected. Server-authored assistant messages are ignored on state writes and remain worker-owned.
- `DELETE /state` deletes the authenticated user's workspace data and records an audit event. It cannot affect another account.
- `GET /status` reports configuration flags; `llmVerified` is deliberately false until a real provider call is verified.
- `GET /health` checks database connectivity without authentication.

## AURIX tasks

- `GET /tasks?workspaceId=...` requires ownership of the workspace and returns only that user's tasks in the workspace, plus provider configured/verified flags.
- `POST /tasks` accepts `{workspaceId,conversationId,inputText}` and creates an `awaiting_approval` task. The conversation must belong to the selected workspace and user.
- `POST /tasks/:taskId/approval` accepts `{decision:"approve"|"reject"}`. Only the owner can decide; approval queues execution, rejection cancels it. Execution is available only when the server-side Manus LLM adapter is configured. Provider output is stored as an assistant message only after a successful completion.

Errors use `{error:{code,message}}`. Cross-account workspace/task lookups return not-found rather than disclose ownership. Task inputs are submitted to the configured model provider only after explicit approval; do not submit credentials or highly sensitive information.

## Connection sharing

The current compatibility endpoint stores sharing drafts inside `PUT /state`. Rows are persisted as `status=intent` and `external_enforced=0`. These are database-backed intents/audit history, **not** OAuth connections or external provider permissions. No external connection token is stored or enforced. User revocation is reflected in the persisted intent; provider-side revocation is not available until an actual connector is implemented.

## Configuration

Required runtime environment: managed `DATABASE_URL`, `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL`, `MANUS_OAUTH_PORTAL_URL`; LLM execution additionally needs server-only `MANUS_API_URL` and `MANUS_API_KEY`. OAuth redirect/callback configuration and provider approval must be completed in the Manus project. Never expose these values in Vite/browser variables.
