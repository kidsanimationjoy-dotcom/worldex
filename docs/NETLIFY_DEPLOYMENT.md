# WORLDEX deployment on Netlify

WORLDEX uses a Vite/React frontend and an Express/MySQL backend. This repository includes a Netlify Functions adapter so the frontend and API can be deployed as one Netlify site.

## Deploy from GitHub

Use Netlify's repository importer:

https://app.netlify.com/start/deploy?repository=https://github.com/kidsanimationjoy-dotcom/worldex

Choose the Netlify team that owns this project and allow Netlify to connect to the public GitHub repository. The build command, publish directory, API rewrites, and function directory are defined in `netlify.toml`.

## Required runtime configuration

Add these values in the Netlify site's environment-variable settings. Keep all credentials server-side; do not add secrets to GitHub or any `VITE_*` variable.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection URL for persistent WORLDEX data |
| `MANUS_API_URL` | Manus API base URL used by the sign-in and AURIX provider |
| `MANUS_OAUTH_API_URL` | Set to the same API base URL; used by the status endpoint |
| `MANUS_PROJECT_ID` | Manus application/project identifier |
| `MANUS_OAUTH_PORTAL_URL` | Manus authorization portal URL |
| `MANUS_JWT_SECRET` | Server-side session-signing secret |
| `MANUS_API_KEY` | Server-side AURIX model-provider credential |
| `WORLDEX_ALLOWED_ORIGINS` | Exact deployed origin, e.g. `https://your-site.netlify.app`; comma-separate any additional trusted origins |
| `WORLDEX_TOKEN_ENCRYPTION_KEY` | 32-byte key encoded as Base64 or 64 hexadecimal characters |
| `WORLDEX_OAUTH_GOOGLE_CLIENT_ID` / `WORLDEX_OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |
| `WORLDEX_OAUTH_GITHUB_CLIENT_ID` / `WORLDEX_OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `WORLDEX_OAUTH_LINKEDIN_CLIENT_ID` / `WORLDEX_OAUTH_LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth app credentials |

Set function runtime variables with the Functions scope. Environment-variable changes require a new deploy to take effect.

## Database migration — manual and deliberate

Do not set `WORLDEX_AUTO_MIGRATE=1` in production. Back up the target database, review the SQL migrations, and apply the migration set from a trusted environment with the correct `DATABASE_URL` using:

```bash
pnpm db:migrate
```

The application deliberately does not apply schema changes at function startup.

## OAuth callback URLs

After Netlify gives the site its final URL, register these exact callback URLs in each provider's developer settings:

- `https://YOUR-SITE.netlify.app/api/connections/oauth/callback/google`
- `https://YOUR-SITE.netlify.app/api/connections/oauth/callback/github`
- `https://YOUR-SITE.netlify.app/api/connections/oauth/callback/linkedin`

The Manus sign-in callback is:

- `https://YOUR-SITE.netlify.app/auth/callback`

The final site origin must also be included in `WORLDEX_ALLOWED_ORIGINS`.

## Runtime notes

- `/api/*` and `/auth/callback` are routed to the Express function; the Vite build is served from Netlify's static CDN.
- AURIX task-queue processing runs through a scheduled function once per minute on published deploys. This is not the same as the local 1.5-second worker loop; approved tasks may wait up to roughly a minute before a scheduled pass.
- The scheduled worker processes a bounded batch to stay within Netlify's scheduled-function execution window.
- Live database, Manus, and provider OAuth checks must be completed after the correct environment values and migrations are configured.
- The OAuth foundation does not mean every listed social or commerce platform's posting, messaging, advertising, or commerce actions are implemented.
