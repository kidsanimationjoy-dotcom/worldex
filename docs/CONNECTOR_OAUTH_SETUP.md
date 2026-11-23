# WORLDEX connector OAuth setup

This document is for the WORLDEX platform operator. Ordinary WORLDEX users do **not** enter provider client IDs, client secrets, API keys, or provider passwords.

## Supported OAuth adapters

The current server-side adapters use OAuth 2.0 Authorization Code with PKCE (S256), a single-use random state value, a ten-minute transaction, and a server-side token exchange.

| Provider | Provider id | Supported permission groups |
| --- | --- | --- |
| Google | `google` | Profile, Content, Publishing, Analytics, Messages |
| GitHub | `github` | Profile |
| LinkedIn | `linkedin` | Profile, Publishing |

The UI may list other platforms, but those are not OAuth-enabled until a provider adapter and API capabilities are implemented. A configured OAuth client does not guarantee that the provider has approved every requested scope. For example, LinkedIn publishing requires the relevant product permission in the LinkedIn developer application.

## Required server-only environment variables

Create the provider apps under the WORLDEX platform's developer accounts and put their credentials in the deployment's encrypted/server environment settings:

- `WORLDEX_TOKEN_ENCRYPTION_KEY`: a 32-byte key encoded as Base64 (or exactly 64 hexadecimal characters). Generate a new key for each environment. Never place it in frontend/Vite variables or commit it to Git.
- `WORLDEX_OAUTH_GOOGLE_CLIENT_ID`
- `WORLDEX_OAUTH_GOOGLE_CLIENT_SECRET`
- `WORLDEX_OAUTH_GITHUB_CLIENT_ID`
- `WORLDEX_OAUTH_GITHUB_CLIENT_SECRET`
- `WORLDEX_OAUTH_LINKEDIN_CLIENT_ID`
- `WORLDEX_OAUTH_LINKEDIN_CLIENT_SECRET`

Only configure providers for which WORLDEX has completed the provider's application registration, policy/branding details, and required product review. A provider is reported as ready only when its client ID, client secret, and token encryption key exist.

The token encryption key is essential. WORLDEX encrypts access tokens, refresh tokens, and short-lived PKCE verifiers using AES-256-GCM before persistence. Losing or rotating the key without a planned re-encryption migration makes existing tokens unusable. Back it up in the deployment secret manager; never store it in the repository.

## Exact callback URLs to register

Register the exact HTTPS callback URLs for the production WORLDEX domain (and separate exact URLs for staging if required):

- `https://YOUR-WORLDEX-DOMAIN/api/connections/oauth/callback/google`
- `https://YOUR-WORLDEX-DOMAIN/api/connections/oauth/callback/github`
- `https://YOUR-WORLDEX-DOMAIN/api/connections/oauth/callback/linkedin`
- `https://YOUR-WORLDEX-DOMAIN/auth/callback` (WORLDEX sign-in through Manus)

Do not use a wildcard callback. The connector callback origin comes from the authenticated WORLDEX session and is stored in the one-time OAuth transaction. The app's allowed browser origins must also be included in `WORLDEX_ALLOWED_ORIGINS` as a comma-separated list when they are not covered by the platform's trusted preview origin policy.

## Database migration

The OAuth storage migration is `db/migrations/0002_provider_oauth.sql`. It adds:

- `oauth_transactions`: one-time state hashes, workspace/user binding, encrypted PKCE verifier, redirect URI and expiry.
- `provider_connections`: workspace-owned account metadata, granted scope groups, provider scopes, encrypted access/refresh tokens, expiry and disconnect status.

Migrations are deliberately not automatic in the production server. Review the SQL, take a managed database backup, approve the schema change, then run `pnpm db:migrate` in the deployment environment. Do not reset the existing database.

## API flow

1. Sign in to WORLDEX. The browser returns to `GET /auth/callback`; the server validates the state and HttpOnly nonce cookie before creating the signed-in session.
2. Save/import the browser-local workspace to the signed-in account once. Connector records are owned by a server-side user and workspace.
3. Load configured adapters with `GET /api/connections/providers` and the workspace's connections with `GET /api/connections?workspaceId=...`.
4. Start a connection with `POST /api/connections/:provider/start`, passing `{ "workspaceId": "...", "scopes": ["Profile"] }` plus the session CSRF header.
5. The browser is redirected to the provider's official consent screen. The provider returns to `GET /api/connections/oauth/callback/:provider`.
6. The server checks the state transaction and session owner, exchanges the code with PKCE, reads a stable provider account identity, encrypts tokens, and redirects back to WORLDEX without leaving the authorization code in the page URL.
7. Disconnect with `DELETE /api/connections/:connectionId` and a CSRF header. WORLDEX deletes its stored tokens. This local disconnect does **not** necessarily revoke the app grant at the provider; users should also review the provider's connected-app settings when they want to remove that grant.

The HTTP API never returns access tokens or refresh tokens. A trusted backend worker can use the internal `connections.getAccessToken({ userId, workspaceId, connectionId, requiredScope })` method. It enforces workspace ownership and the recorded permission group, then decrypts the token only inside server code. It refreshes tokens only when a provider returned a refresh token; otherwise an expired connection must be reauthorized.

## Current limitations

- Only the three adapters in the table are implemented. Other marketplace cards remain informational and cannot initiate OAuth.
- OAuth authentication is not the same as feature implementation. The platform still needs provider-specific API adapters and policy/approval checks before AURIX can publish, send messages, manage ads, or change external data.
- Disconnect attempts provider-side revocation where supported: Google uses Google's OAuth revocation endpoint; GitHub removes the OAuth application's grant through GitHub's OAuth authorization API. LinkedIn's documented 3-legged OAuth guide does not expose a public member-token revocation endpoint, so WORLDEX deletes its local tokens and reports that the member may need to remove the app from LinkedIn's permitted-services settings.
- LinkedIn's current 3-legged token response can include refresh tokens only where the application is eligible for that feature. Do not assume every LinkedIn application receives a programmatic refresh token; when absent, the connection must follow LinkedIn's reauthorization experience.
- The implementation does not claim provider app review, live OAuth consent, live API reads/writes, or deployment success. Verify each provider in a controlled staging environment before enabling it for users.
- Some scopes are restricted, review-gated, or unavailable to a provider application. Never request a scope unless the WORLDEX provider app has been approved for it and the user has a clear reason to grant it.
