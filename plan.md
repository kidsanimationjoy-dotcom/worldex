# WORLDEX MVP — Implementation Plan

## Product and implementation approach

Build a responsive, single-page React + TypeScript application for WORLDEX with AURIX as its workspace-aware AI employee. Focus this first deliverable on onboarding, independently scoped workspaces, device-local saved chats, revocable workspace permissions for accounts, structured opportunity details, and a complete navigation shell with truthful capability/status pages.

This is a front-end MVP, not a multi-user production service. Persist app records in the browser's localStorage, label them as device-local, and make the isolation semantics visible. Local storage does not provide security between browser users or devices. The app will never claim that accounts, providers, AI, analytics, payment data, jobs, publishing, or external execution are live. Sample opportunity records, where shown, carry a visible DEMO DATA label. Unavailable actions remain disabled and explain the missing provider/setup. No customer-facing website builder or website hosting/publishing features will appear anywhere.

Implement functional onboarding and “new workspace” forms with all requested audience paths, name/type/description/goals, optional country/currency, and type-sensitive presentation. Workspace-scoped records include chats, workspace identity, account grants, and local activity metadata. Workspaces begin with no inherited conversations, files, customers, memory, or connections. Explicit grants identify source account, target workspace(s), selected resource-level permissions, and can be revoked. Sharing a grant does not copy chats, files, customer records, memories, or finance data. Cross-workspace overview is off by default and will be surfaced as an off-by-default setting; it will not aggregate hidden workspace information.

Saved chat management supports new/create, list, open, search, rename, archive, and reopen in the current workspace. A chat stores a local draft/message log; the AI response/send-to-model action is disabled unless a real provider has been configured. An always-visible notice states that AURIX AI is not configured. A readable approval inbox shows no pending approvals unless a real app-generated request exists. Do not fabricate execution states. Use `draft` only for locally saved drafts.

Opportunity Finder supports remote jobs, freelance contracts/services, business models, creator opportunities, and digital product ideas. Live listings are not available. Provide a clear no-live-source state and optional structured DEMO DATA ideas. Any demo details include evidence/provenance state, verification date/eligibility caveats, skills, difficulty, cost/time assumptions, uncertain earning range rather than a promise, competition/risks, and start steps. Dropship Studio, Game Studio, and other planned modules are navigable capability pages, not simulated products. Universal Connect may display only an honest catalogue with “Not connected”, “Requires setup”, “Limited”, or “Not yet supported” status; do not imply OAuth or external account verification.

Provide a product status page distinguishing implemented in the app, configured, tested, and independently verified. Include an in-app developer handoff and a project-root `HANDOFF.md` documenting the boundary, data model, local runtime, and the missing steps for real authentication, persistent database, AI provider, OAuth/integration adapter, access control, audit log, and production verification.

## Structure and modules

- `src/main.tsx` — React entry point.
- `src/App.tsx` — app shell, onboarding gate, navigation/module composition, and workspace state orchestration.
- `src/types.ts` — workspace/chat/opportunity/integration/permission/status types.
- `src/lib/store.ts` — versioned browser-local storage, safe load/save, isolated default creation, migrations and workspace-scoped selectors.
- `src/lib/workspaces.ts` — workspace creation and type-derived theme tokens.
- `src/lib/opportunities.ts` — structured, clearly labelled static demo records and no-live-source metadata.
- `src/components/` — reusable sidebar, topbar, globe/orbit brand mark, workspace picker, status badges, onboarding wizard, and focused module panels.
- `src/styles.css` — responsive dark-interface design tokens, dense layout, accessibility, transitions and type styles.
- `public/manus-routes.json` — synchronized route manifest with only the actual root route (the application uses internal view state, not invented deep routes).
- `plan.md`, `TODO.md`, `HANDOFF.md` — design/implementation intent, full source requirement coverage and real setup instructions.

Dependencies should stay minimal (React, React DOM, Vite, TypeScript, Lucide React for consistent icons). No server/database feature is enabled in this local-first MVP. Configure TypeScript diagnostics before the first application source batch, pin pnpm per setup guidance, and add the route manifest before starting the dev server.

## Design system

### Design Movement

**User-specified premium dark command environment with an illuminated digital globe/orbit network**, blended with restrained neo-industrial interface typography rather than a generic admin dashboard.

### Core Principles

1. Workspace context is continuously visible; isolation should be legible, not implied.
2. Honest availability is a primary interface state: setup, limited, demo and unavailable states are designed as deliberately as active features.
3. Dense, compact panels give the operator meaningful context without clutter or card-grid monotony.
4. Every interactive control either performs a local, explainable action or is disabled with an explicit reason.

### Color Philosophy

Near-black `#090B12` and navy `#11182A` supply a calm operational canvas. Cool white is reserved for high-priority information; steel grey carries metadata. WORLDEX electric blue `#477BFF` represents accessible action and connected paths, while restrained violet `#8B72FF` is reserved for AI and intent. Status amber and muted red communicate setup/error without pretending success.

### Layout Paradigm

A compact, persistent left navigation rail and narrow workspace/context header frame an asymmetric dashboard: a wide primary-work surface with a slimmer status/context column. Opportunities use structured split-pane detail, and capability modules use clear availability callouts rather than empty promotional cards. On smaller screens the rail collapses into an accessible drawer/bottom navigation and panels stack.

### Signature Elements

- An ownable WORLDEX orbital globe mark with three connecting nodes.
- Fine orbit arcs, luminous blue-violet edge accents and controlled spatial glows.
- AURIX's waveform/signal indicator, explicitly paired with an “AI not configured” status until a provider exists.

### Interaction Philosophy

Fast, keyboard-friendly workspace switching and contextual navigation. Preserve active workspace context when opening modules. Confirm destructive actions such as revoking an account grant or archiving a chat; provide accessible inline feedback. Forms validate before save. No interaction produces mock external success.

### Animation

Short 120–200 ms opacity, transform and color transitions; small signal orbit motion only where it aids orientation. Respect `prefers-reduced-motion`. No autoplay dashboards, constant pulsing or long entrance sequences.

### Typography System

Use a clean premium sans stack (`Inter`, `Manrope`, system fallbacks) with compact headings and carefully tracked uppercase micro-labels. Display headings use strong weight with tight tracking; body remains comfortable at 14–16 px. Monospaced numerals are limited to IDs, timestamps and technical status.

### Brand Essence

**A workspace command center for independent operators, creators, game teams and client managers—unified by AI readiness, but honest about what is actually connected.** Personality: precise, ambitious, transparent.

### Brand Voice

Headlines orient action; CTAs use direct verbs; setup copy states exactly what is missing.

- “One World. Unlimited Possibilities.”
- “AURIX is standing by. Connect an AI provider to enable replies.”

### Wordmark & Logo

Custom typographic WORLDEX wordmark with a geometric orbital globe: outlined sphere/open arc, two offset orbital paths and three connected points. AURIX uses a distinct violet signal glyph. Preserve WORLDEX identity across all workspace themes.

### Signature Brand Color

WORLDEX electric blue `#477BFF`, highlighted by a restrained blue-to-violet orbital gradient.


## Server-side evolution (continuation of the existing MVP)

Preserve the React WORLDEX shell and its workflows while replacing browser-local state as the authoritative data source with a same-origin API backed by the managed MySQL database. The existing managed development port remains 3000. Vite proxies `/api` to a Node/Express API process for Preview; production will serve the compiled frontend and API from one Node server. No user-facing site-builder, publishing or unrelated decorative functionality is added.

Use Manus OAuth as the default identity provider, following the platform wire contract. Registration is first sign-in/upsert by verified `openId`; local passwords are never stored. Recovery therefore remains with the Manus account identity provider—no email sender or password-reset backend is configured. The application issues a short-lived, revocable `webdev_app_session` cookie backed by an application `sessions` row, verifies the platform project signature and app ID, and resolves the subject to an owned user record. OAuth `state`/single-use nonce is bound to a short-lived HttpOnly cookie; only fixed `/auth/callback` redirects are allowed. Protect cookie-authenticated mutations with same-origin/Origin and CSRF-token validation; cookie flags reflect the browser-visible HTTPS origin rather than internal server request scheme.

Commit additive, versioned MySQL migrations for users, application sessions, workspaces, workspace-owned conversations/messages, projects, tasks, approval/audit events, provider-free connection-sharing intent/grants/scopes/targets and migration history. Derive identity only from the verified server session. Every workspace query and mutation uses `user_id` ownership predicates and rejects foreign workspace IDs; child rows must additionally reference workspaces owned by that user. Keep chat, policy and task data workspace-scoped. The API never accepts a user ID as authority. Opt-in import of legacy browser data is shown only after identity is established and requires an explicit confirmation; it is not automatically attached to the first account that opens the browser.

Use bounded validated same-origin JSON APIs to hydrate and persist application state without localStorage as the source of truth. Preserve existing onboarding, workspace switching, chat create/search/rename/archive/reopen and local MVP views. Server snapshots are merged/upserted (never implicitly deleted); ownership checks, message/record limits, parameterized SQL and transactions are required. The management of future per-record deletion remains explicit and auditable. Server-backed connection sharing stores revocable intents and audit events only; without connected account IDs and provider OAuth it is not an external provider grant, and the UI must say so. Resource scopes never grant access to chats/files/customers by implication.

AURIX work uses a database-backed task/approval state machine with explicit user approval before queueing side-effecting or AI work. Workers claim jobs with row-level locks/leases, bounded retries/backoff and persisted outcomes. A server-only Manus LLM adapter calls the provided `/v1/chat/completions` endpoint when its runtime credential exists, validates returned content and reports upstream failures rather than manufacturing text. Integration status remains unverified until an actual provider call is deliberately performed; automated tests inject mock adapters only for deterministic fault and state tests.

Security and testing: strict schemas/limits, HttpOnly cookies, CSRF/Origin enforcement, rate limits on authentication/workspace/task writes, redacted logs, audit events, no secrets in client output. Use unit/API tests with injected fake identity/provider/repository boundaries; test migrations non-destructively and only use transactions that rollback for shared managed database integration checks. Existing database schema/data is never reset. Document tests separately from live OAuth/provider verification. Add `docs/API.md`, additive SQL migrations, automated test suites, and `CLAUDE_HANDOFF.md` listing the delivered backend, proven checks and remaining external approvals/limitations.
