# Current implementation status — 2026-11-24

Main includes the Universal Connect OAuth foundation, merged in PR #1 (commit `11c1887a36ed42b04ff1bd6d9cf689cca63e686c`).

## Verified in GitHub Actions on the merged feature-branch head
- Dependency installation: PASS.
- TypeScript typecheck: PASS.
- Unit tests: 69 total; 49 passed, 0 failed, 20 skipped because no dedicated `WORLDEX_TEST_DATABASE_URL` was configured.
- Vite production build: PASS.
- Server syntax checks: PASS.
- The database migration and live Google/GitHub/LinkedIn OAuth flows were not run.

## Implemented
- React/Vite frontend, Express/MySQL API and Manus session/authentication foundation.
- Workspace/task API ownership checks, database migration 0001, audit/rate-limit and approval/task records.
- Universal Connect marketplace with signed-in state, workspace-save flow, permission picker, account list and disconnect flow.
- Google, GitHub and LinkedIn OAuth Authorization Code/PKCE adapters, one-time OAuth state, AES-256-GCM encrypted token storage, internal workspace-scoped token access and refresh where supported.
- Provider disconnect attempts: Google OAuth revocation endpoint and GitHub grant deletion; LinkedIn local token removal with a clear notice that provider-side removal must be completed in LinkedIn settings.
- Migration 0002, provider setup/API documentation, OAuth tests and CI workflow.

## Next steps, in order
1. Platform owner / eligible account holder must register WORLDEX provider apps, complete any provider review and add the exact callback URLs. Configure the server-only client IDs, client secrets and `WORLDEX_TOKEN_ENCRYPTION_KEY` in the actual deployment secret manager. These external account and secret-manager actions are not accessible through the current GitHub repository integration.
2. Review migration `db/migrations/0002_provider_oauth.sql`, back up the managed database and apply with `pnpm db:migrate` in the deployment environment. Do not reset or automatically migrate the shared database.
3. Run Google, GitHub and LinkedIn OAuth consent/token-exchange tests against staging apps; run the isolated MySQL suite with a dedicated `WORLDEX_TEST_DATABASE_URL`.
4. Global React account-state integration implemented on `feature/global-account-sync`: startup restores authenticated server workspaces, a first-time browser-profile import remains an explicit user action, and later workspace changes are serialized to `/api/state` with CSRF protection. In account mode the server is authoritative; signed-out preview remains browser-local. Account workspace deletion now calls the authenticated server `DELETE /api/state` endpoint. After CI passes and this change is merged, update this item to complete.
5. Build and test provider API actions separately (Drive/Gmail/Analytics/GitHub/LinkedIn actions as approved). OAuth by itself does not enable publishing, messaging, ads, commerce or automation.
6. Continue remaining product work such as task approval/poll UI, MySQL optimistic version checks and the 3D globe. Do not claim production readiness until the relevant live tests and deployment checks pass.

---

# WORLDEX MVP — Delivery TODO

## 1. Honest product scope, shell, visual identity and module navigation
- [x] Build the first interactive web-app MVP for WORLDEX. WORLDEX is the platform; AURIX is its AI employee. Tagline: “One World. Unlimited Possibilities.” The platform serves people who want to find online work, start/manage businesses, create digital products and games, market them, publish through supported external platforms and manage connected accounts.
- [x] Do not build a website builder, website generator, website redesign, website hosting or website publishing tools for WORLDEX users. WORLDEX itself is a web app; users must not be offered website creation.
- [x] Do not pretend all planned features/integrations are finished. No fake buttons, fake connected accounts, fake sales/balances, fake jobs, fake game publishing, fake analytics or simulated external success.
- [x] Clearly label sample content “DEMO DATA”. Unconfigured integrations must say “Not connected”, “Requires setup”, “Limited” or “Not yet supported”. A button must work or be disabled with an explanation.
- [x] Build a credible MVP and extensible product foundation, not a fake all-features showcase.
- [x] Provide navigation for Home, AURIX Chat, Workspaces, Opportunity Finder, Dropship Studio, Game Studio, Universal Connect, Research, Outreach, Social, Ads, Messages, Documents, Images, Videos, Schedule/Automations, Library, Analytics, Team and Settings. For modules not built yet, provide honest capability/status pages, not fake functional controls.
- [x] Use a premium competition-quality dark workspace, with responsive desktop/mobile layout and accessible contrast/keyboard support/clear loading, empty and error states. Palette: near-black #090B12, deep navy #11182A, electric blue #477BFF, restrained violet #8B72FF, cool white and steel-grey text. Include crisp premium sans typography, refined iconography, compact panels, elegant charts only with labelled demo data, subtle glass/gradient surfaces, tasteful motion, and an illuminated digital globe/orbit network signature. Avoid a generic dashboard template, plain grids of cards, clutter and excessive empty space.
- [x] Preserve recognisable WORLDEX identity while workspace themes adapt to fashion, gaming, creator, marketing, ecommerce, education, services or personal work.

## 2. Onboarding and isolated multi-workspace records
- [x] Onboarding asks whether a person already has a business; wants to start one; wants online jobs/freelance work; wants to create games/digital products; or manages clients. Then collect workspace name/type, short description, goals, country and currency (optional fields skippable). Create an appropriate workspace and adapt accent colours, terminology, modules and dashboard to its type. Let users customise logo, colours and appearance later. Keep WORLDEX identity recognisable. The local MVP provides workspace monogram/accent customization; custom logo-file upload is not implemented.
- [x] Users can create multiple independent workspaces for businesses, client accounts, creator projects, game projects or personal job/opportunity journeys.
- [x] Each workspace has its own type, description, goals, brand identity/theme, chats, files, projects, tasks, assistant memory, connected accounts and activity history. Files, tasks, memory and connected-account arrays begin empty; external accounts and secure remote storage are not implemented.
- [x] “New Workspace” creates an isolated environment. It must not inherit other workspaces’ chats, files, customers, memory or integrations by default. Users can return to old workspaces and continue previous chats.
- [x] Switching workspace changes active context and shows only its data. Make the first-MVP device-local persistence/security boundary explicit. Browser-local organization is not secure multi-user isolation.
- [x] Include two different-workspace creation flows and make new workspaces empty/isolated by default.

## 3. AURIX chat and saved conversation management
- [x] “New Chat” creates a separate conversation within the current workspace; it may use only that workspace’s approved business context. Chats can be searched, renamed, archived and reopened. Chat records are workspace-scoped; AURIX receives no context because no AI is configured.
- [x] Assistant interface includes conversation list, New Chat, search/rename/archive/reopen, attachment affordance, prompt composer, task progress and approval inbox. Always display active workspace. The attachment affordance is disabled with an explanation; the approval inbox has a truthful empty state.
- [x] Task states are draft, awaiting approval, running, completed, failed. Do not fake AI responses or claim external execution until a real provider is configured. If no live AI provider is configured, explain this and mark any preview clearly. AI/provider secrets must remain server-side. Only local draft tasks/notes are available; no task executor is configured.
- [x] Provide honest empty AI/provider and approval states; do not create fake assistant answers or fabricated external actions.

## 4. Explicit, least-privilege connection sharing
- [ ] Connections belong to one workspace by default. Owner can explicitly share a selected connected account with selected workspaces or all workspaces, with least-privilege/resource-level permissions. Sharing account access must NOT share chats, business memory, files, customers or financial data. Sharing must be revocable. Provide optional cross-workspace overview, off by default. **Implemented scope:** optional overview is off by default and exposes workspace inventory only; selected/all-workspace policy drafts and proposed scopes are locally stored/revocable. No connected account, OAuth token or provider permission exists, so real account access sharing/enforcement is not implemented.
- [x] Universal Connect displays the catalogue groups Social, Commerce, Games, App Stores, Ads, Payments, Email, CRM, Courses, Scheduling, Analytics, Storage and Developer APIs, with search and category filtering. Provider account selection and actual connection-based assignment are not enabled; workspace targets are policy-draft intent only.
- [x] Connection statuses are shown honestly: no entry claims “Verified and connected” or “Available to connect” unless a real API test/OAuth exists; listed integrations are “Not connected” and marked “Requires setup” or “Not yet supported”.
- [ ] A connection detail page shows supported actions, requested scopes, last sync, errors, disconnect and sharing controls. Never expose secrets in client code. Integration-specific detail, sync, error, disconnect and secret controls require real provider connections and are not implemented.
- [ ] Implement explicit selected-account/resource/workspace grant creation and revocation; never display a demo grant as a connected account or verified API connection. Current creation/revocation saves a local policy draft only; it does not authenticate, grant or revoke external access.

## 5. Opportunity Finder and honest structured details
- [x] Opportunity Finder is for users without a business and includes remote jobs, freelance contracts/services, business models, creator opportunities and digital product ideas.
- [x] Opportunity detail shows a source/provenance note, not-applicable verification date, country/age eligibility caveats, skills, difficulty, startup cost, time commitment, uncertain earning range/evidence, competition, risks and application/start steps. No demo record is represented as live or as having verified earnings.
- [x] Provide no-live-source empty state and clearly labelled structured DEMO DATA only. No live listings or applications are connected.

## 6. Dropship and Game Studio capability boundaries
- [ ] Dropship Studio supports product research, supplier comparison, unit economics/profit calculator, store connection, orders/fulfilment, inventory and customer-support workflows. The current local MVP implements only a per-unit estimate that includes user-entered product cost, shipping, payment fees, ads, refund and tax assumptions. Product research, suppliers, store, orders, inventory and support are not connected or implemented.
- [ ] Game Studio supports concepts/projects, assets, testing checklist, version history, release checklist, targets (Roblox, Steam, itch.io, Google Play, Apple App Store) and analytics. Local project briefs and a reference release checklist are implemented; assets, per-project testing/version history, publishing and analytics are not implemented. Publishing requires genuine platform authentication/permissions; no release or revenue is simulated.
- [x] For unimplemented parts above, provide truthful capability/status pages and disabled actions with an explanation, not pretend live workflows.

## 7. Quality/status and developer handoff
- [x] Include a product quality/status page showing implemented, configured, tested and verified features separately.
- [x] Include setup and developer handoff documentation for connecting real AI, database and provider APIs (`HANDOFF.md`).
- [x] State exactly what works in this MVP and what remains unimplemented in the status page and developer handoff.
- [x] Deliver a cohesive first MVP focused on onboarding, workspace isolation, saved chats, local connection-sharing policy drafts, Opportunity Finder structure and the full application shell. Use only clearly labelled demo data where useful. Do not describe the whole vision as completed.

## Delivery evidence and remaining scope

`pnpm typecheck` and `pnpm build` complete successfully. Managed Preview’s root page, `/manus-routes.json` and WORLDEX SVG favicon return HTTP 200. These checks verify compilation/serving only; they do not constitute independent provider, security or multi-user verification.

Real account authentication, server-enforced workspace isolation, durable database and storage, AI responses/execution, provider OAuth and account-level grant enforcement, live opportunity feeds, external store/game publishing, live orders, team roles, live marketing channels, analytics and automated messaging remain unconfigured or unimplemented. See `HANDOFF.md` before connecting real data.


## 8. Authentication, identity and revocable sessions (server-side continuation)
- [ ] Implement registration and login through verified Manus OAuth by default; never invent an authenticated user or accept an unverified browser identity. Persist a user record keyed by the verified provider subject; document that no local password exists and password/account recovery is handled by the identity provider unless a mail/password provider is explicitly configured.
- [ ] Bind OAuth `state`/nonce to the initiating browser with a short-lived single-use HttpOnly cookie; validate callback state, identity exchange and project identity. Issue an application session compatible with the Preview cookie name, persist revocable session records, validate signature/expiry/app ID and ownership on every authenticated API request, and provide logout/revocation.
- [ ] Protect sessions with browser-appropriate Secure/HttpOnly/SameSite attributes, strict callback origin/redirect allowlists, same-origin/Origin and CSRF-token controls, and rate-limited auth endpoints. Never expose platform JWT/database/service credentials to browser code.
- [ ] Provide a logged-out/login state and server-verified account identity in the retained WORLDEX UI. No Preview-user shortcut or environment-based auth bypass.

## 9. Managed database schema, migrations and data model
- [ ] Use the provisioned managed MySQL database as the durable authority, with deterministic additive versioned migrations and a migration history table; never destructively reset project data or seed fabricated identities/content.
- [ ] Persist users, sessions, workspaces, conversations, messages, chat labels/archive/timestamps, workspace projects/tasks, connection sharing intent and associated permission scopes/targets, approval/job state and audit records. Preserve the browser-local MVP features through the server-backed model.
- [ ] Remove `localStorage` as the authoritative state store. Offer an explicit, post-authentication consent flow before importing any pre-existing browser profile data; do not automatically attach another profile user's records to the newly logged-in account.
- [ ] Enforce data limits, parameterized SQL and transactional writes. A multi-device user can fetch current server state after login without relying on prior device storage.

## 10. Multi-workspace authorization and API
- [ ] Derive user identity from a verified server session only, never from a request body. Every workspace query/mutation must include authenticated owner checks; every child record must be verified through its owning workspace. Reject cross-user and cross-workspace IDOR attempts.
- [ ] Preserve workspace-local chat and project data, and keep conversations, files, customers, assistant memory and other workspace content out of connection-sharing grants by default.
- [ ] Provide documented same-origin APIs with input validation, ownership-aware errors, rate limits and structured redacted logs. Maintain API documentation and a technically accurate Claude developer handoff.

## 11. Database-backed connection sharing and audit
- [ ] Persist owner workspace, selected target workspace(s), explicit resource scopes, creation/revocation state and audit events in MySQL; validate every owner and target against the authenticated user. Revoked grants stop authorizing access immediately.
- [ ] Distinguish a stored sharing intent from an actual external provider permission. With no provider account/OAuth installation, show no account as connected and do not claim provider enforcement or verified external access.

## 12. AURIX approval and background task foundation
- [ ] Persist task records with explicit states, approvals, attempts, retry/backoff and failure details. Side-effecting work requires user approval before enqueue/execution; expose real task status and cancellation/terminal failures.
- [ ] Implement a server-only provider adapter for the configured Manus LLM runtime, but do not fabricate completion responses or report success on empty/error output. Keep provider execution unverified until an actual deliberate live call succeeds. Unit tests may inject a deterministic fake adapter, identified as a test double.
- [ ] Keep task worker leases and durable state in MySQL; do not rely on one process's memory/timers as the source of queue state. Document operational limits and any required runtime/deployment configuration.

## 13. Security and automated verification
- [ ] Cover authentication/session verification and revocation, workspace ownership and cross-tenant rejection, persisted chat lifecycle, grant scope/target isolation and immediate revocation, audit records, queue approval, retries, empty provider responses and upstream failure handling.
- [ ] Run unit/API tests and non-destructive database migration checks; test writes to the project-managed DB only inside rollback-only transactions. Report any unavailable integration test distinctly from a passing test.
- [ ] Before delivery, run type checks, production build and the complete automated test suite. Keep automated mocks distinct from provider/OAuth verification.
- [ ] Report what was implemented, what passed, what failed/not run, and which credentials, redirect allowlists, provider approvals or deployment configuration still need a user/admin.
