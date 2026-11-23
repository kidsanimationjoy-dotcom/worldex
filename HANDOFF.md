> **Current release note (2026-11-24):** the project now includes an Express/MySQL server foundation, Manus sign-in/session API, workspace/task APIs and the Universal Connect OAuth foundation for Google, GitHub and LinkedIn. The connector marketplace has permission selection and account management. Provider developer-app registration, deployment secrets, migration `0002_provider_oauth.sql`, live provider tests and production deployment are still pending. The rest of the main app still has browser-local state; see `CLAUDE_HANDOFF.md` and `docs/CONNECTOR_OAUTH_SETUP.md`.
> GitHub Actions on merged main passed install, typecheck, unit tests, production build and server syntax checks. See `TEST_RESULTS.md`.
> Migrations are never applied automatically (`WORLDEX_AUTO_MIGRATE=1` is for disposable local databases only).

# WORLDEX MVP — Setup and Developer Handoff

## What is delivered

This release is a browser-local interactive MVP, not a production multi-user service. It includes onboarding for five operator intents; multiple browser-persisted workspaces with independent descriptions, goals, themes, conversations, projects, tasks, file placeholders, activity and empty assistant-memory arrays; workspace switching; local chat draft creation/search/rename/archive/reopen; structured opportunity examples labelled DEMO DATA; a user-entered dropshipping unit-estimate formula; local Game Studio concept briefs; a connector readiness catalogue; policy-draft creation/revocation with selected or all-workspace targets and proposed resource scopes; settings, optional restricted workspace inventory overview, truthful capability/status pages and responsive navigation.

A server-side authentication/API/database foundation is present: Manus OAuth sessions, ownership-aware workspace state and task routes, audit/rate-limit storage, and the Universal Connect provider OAuth foundation. The connector code supports Google, GitHub and LinkedIn authorization with PKCE and encrypted server-side token storage, but no provider is live until the operator registers the apps, configures server-only credentials and the token-encryption key, and applies migration `0002_provider_oauth.sql`. The marketplace will accurately show provider setup as unavailable until then. Real provider consent and live API actions have not been verified. The wider React application still uses browser `localStorage` for much of its workspace/chat data; it is not yet a fully server-authoritative multi-user application. Live AI response, real job listings, customer records, commerce, ad execution, messages, payments and automation are not verified or generally available. There is no user-facing website creation, generation, redesign, hosting or publication function. The “sharing policy drafts” remain local references and are not equivalent to provider permissions.

## Local development

1. Use Node.js 20+ and the pinned pnpm version from `package.json` (pnpm 10.10.0).
2. Run `pnpm install` from the project root.
3. Run `pnpm typecheck` and `pnpm build` before preview or checkpoint.
4. Run `pnpm dev` locally, or use the declared Manus-managed development command in the bound project to launch the app on port 3000.
5. The application state key is `worldex.mvp.state.v1` in browser localStorage. Use browser settings → “Clear browser data” to remove these locally stored MVP records. It is not a secure database or a supported backup format.

The dev server is declared with the Webdev runtime command; the route manifest is `public/manus-routes.json` and currently describes the only served page (`/`). Internal app navigation is state-based, not a collection of public website routes.

## Workspace data model and boundaries

`src/types.ts` defines the typed record shapes. A `Workspace` owns its chats, projects, tasks, files, empty-by-default assistant memory, appearance, activity and account references. `AppState` is a versioned local collection with one active workspace and a cross-workspace inventory toggle that defaults to false. New workspaces get empty arrays and do not inherit records. This is application-level organization inside one browser profile only. It is **not** access control, tenant isolation or an authorization boundary. Before multiple people can use WORLDEX, replace it with server-enforced identity and ownership checks on every read/write.

`AccessPolicy` represents explicit local sharing intent only. It identifies an owner workspace, target workspace(s), a descriptive provider/account label and proposed resource scopes. It carries no token. “All current and future workspaces” is a broad explicit option. Revocation marks the local policy inactive; it cannot revoke an external provider grant until a genuine OAuth integration exists. Chats, files, customers, business memory and finance records are never copied by this policy flow.

## Production setup sequence (not configured in this MVP)

### 1. Authentication and database

Enable a server capability and managed database only after defining production user/workspace ownership, migrations, retention and backup requirements. Add real authentication, session lifecycle, role checks, server-side validation and immutable owner IDs. Enforce workspace ownership in server-side queries and mutations, never only in hidden UI. Add database migrations for users, memberships, workspaces, conversations, messages, projects, local knowledge/memory references, connector installations, account grants, OAuth state, audit events and approvals. Add audit history for account-scope changes, revocation and data deletion. Revoke/rotate secrets server-side. Test cross-tenant access rejection before storing real user data.

Do not expose database DSNs, OAuth client secrets, provider access/refresh tokens, model API keys or webhook signing keys to browser code. Store sensitive credentials in server-only secret/runtime configuration; use a backend token broker with encrypted credential storage and least-privilege scopes. Add CSRF/state/PKCE/redirect validation and provider-specific disconnection/revocation support as appropriate.

### 2. AURIX AI provider

Select a live AI provider and documented completion API. Implement server-side calls only; keep all provider credentials server-side. Send only the active workspace’s approved context with explicit user consent and narrow query access. Add provider configuration, secret storage, timeout/rate-limit/error states, data-retention disclosure, prompt-injection safeguards, grounded source display and conversation persistence. Do not return synthetic assistant answers during outages. Implement task records with real transitions (`draft`, `awaiting approval`, `running`, `completed`, `failed`) and provider execution IDs, error details and audit events. Any task that sends, publishes, spends, changes a store or alters an account must pause for explicit approval and have a reliable cancellation/status path.

### 3. Universal Connect

Implement each provider independently with current official OAuth/API documentation. Display only “Available to connect” after its genuine authorization path is deployed and tested. Request minimal scopes, explain scope purpose and affected workspace/account, bind every authorization to the owner workspace and server-side user, persist provider metadata and connection timestamps, and never display secrets. Provide verified API test results before displaying “Verified and connected”. Display last sync, provider errors, supported actions and read/write limitations. Add selected-workspace sharing that issues scoped grants against real provider resources, with server-side authorization, audit events and effective revocation. Sharing a connector must never share workspace chats, customer information, files, AI memory or finance data by implication. Do not offer “all workspaces” unless every target is explicit and reviewable, including future-workspace behavior.

Universal Connect now has a server-side OAuth foundation for Google, GitHub and LinkedIn. It uses workspace-owned connection records, one-time state, PKCE, encrypted tokens, server-only secrets and provider-specific disconnect behavior (Google and GitHub revocation are attempted; LinkedIn local tokens are deleted and the user is directed to provider settings). Only these three providers have OAuth adapters. All other catalogue entries remain informational. OAuth authorization does not itself implement publishing, messaging, ads or other external API actions. Current readiness still depends on provider app registration, approved scopes, deployment secrets and applying migration 0002; no live provider connection is claimed until tested.

### 4. Opportunity Finder and business workflows

Pick a documented and contractually permitted job/market data source for each opportunity category. Store source URL/ID, fetched/verification timestamp, eligibility details, market evidence, uncertainty and a freshness state. Do not publish sample or stale records as current opportunities. Include user-country/age requirements only when directly sourced. Attribute evidence for any range; otherwise state “No evidence-backed range available.” Add safety/fraud guidance, source expiry and opt-out. Before implementing dropship supplier data, real orders or inventory, connect a verified commerce/provider source and show assumptions separately from actual values. Taxes and profit estimates require jurisdiction-specific review and explicit assumptions.

### 5. Game builds, publishing and analytics

For Roblox, Steam, itch.io, Google Play and Apple App Store, implement authenticated target-specific workflows only after provider approval and platform agreements. Separate local concepts, assets/build artifacts and release records; require user-controlled target selection, platform scopes and final release approval. Show a release as published only after a verified provider response/identifier. Display earnings or analytics only from a verified source with data timestamp and metric definition. No release, sales or analytics are currently connected.

### 6. Verification and launch checks

Before general availability, test registration/authentication/session expiry, secure workspace ownership, isolation under ID enumeration, XSS and file permissions, OAuth redirect/state handling, least-privilege scopes, sharing and revocation, audit logging, deletion, backup/restore, provider failures, stale source behavior, AI data controls, keyboard/screen-reader use, mobile layouts, reduced-motion mode, CSP and deployment routing. Record implementation, configuration, tests and independent provider verification as separate statuses. Never change a status to “connected”, “tested” or “verified” without the corresponding evidence.
