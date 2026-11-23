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

## Provider connections

- `GET /connections/providers` requires a WORLDEX session and returns provider readiness plus the supported permission groups. It never returns client credentials.
- `GET /connections?workspaceId=...` returns account labels, provider names, scope groups and connection status for an owned workspace. Tokens are never included.
- `POST /connections/:provider/start` requires a session, matching Origin, CSRF token and an owned workspace. It accepts `{workspaceId,scopes}`, creates a ten-minute single-use transaction, stores a hash of the random state and encrypts the PKCE verifier. It returns an authorization URL for the official provider page.
- `GET /connections/oauth/callback/:provider` validates state, transaction expiry, session cookie, user and workspace binding before exchanging the authorization code. It uses PKCE S256 and redirects the browser back to WORLDEX without rendering the authorization code.
- `DELETE /connections/:connectionId` requires a session, Origin, CSRF token and workspace ownership. It clears the encrypted local tokens and audits the disconnect. This does not guarantee revocation of the provider's grant; users should also remove WORLDEX from the provider's connected-app settings if they want to revoke the external authorization.
- `GET /auth/callback` is the browser GET callback for the existing Manus sign-in flow. It checks the one-time HttpOnly nonce cookie and state before issuing the WORLDEX session.

The current OAuth adapters are Google, GitHub and LinkedIn. Google supports Profile, Content, Publishing, Analytics and Messages permission groups; GitHub supports Profile only; LinkedIn supports Profile and Publishing. Provider-side app registration, product access and scope approval are still required. Other cards in the marketplace are informational until their adapter is implemented.

Access and refresh tokens, and short-lived PKCE verifiers, are encrypted with AES-256-GCM using the server-only `WORLDEX_TOKEN_ENCRYPTION_KEY`. Provider client IDs and secrets are stored only in server environment variables named `WORLDEX_OAUTH_<PROVIDER>_CLIENT_ID` and `WORLDEX_OAUTH_<PROVIDER>_CLIENT_SECRET`. The key must be 32 bytes (Base64 or 64 hex characters). Never expose these values in Vite/browser variables or commit them to Git.

A trusted backend component may call the internal `connections.getAccessToken({userId,workspaceId,connectionId,requiredScope})` method. It checks the user/workspace owner and granted scope group, and may refresh an expired token only when a refresh token was returned by the provider. There is no public token endpoint. Provider-specific API actions still need their own adapters and explicit approval policy; OAuth consent alone does not mean an action has been implemented or approved.

## Configuration

Required runtime environment: managed `DATABASE_URL`, `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL`, `MANUS_OAUTH_PORTAL_URL`; LLM execution additionally needs server-only `MANUS_API_URL` and `MANUS_API_KEY`. OAuth redirect/callback configuration and provider approval must be completed in the Manus project. Never expose these values in Vite/browser variables.
