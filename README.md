# Lummet Control Plane

Standalone Cloudflare Worker + D1 database. This is a **separate
project from any tenant repo** — it never shares code or a database
with tenant deployments, and tenants never need to redeploy or
migrate anything for this to exist.

It talks to tenants only over HTTPS, via each tenant's
`/en/api/super/*` Super API (see the tenant repo's
`en/docs/super-api.md`). It never queries a tenant's D1 directly.

**For deployment steps, see `DEPLOYMENT.md`** in this folder — it
covers both halves (this control plane and the tenant-side Super
API) end-to-end, plus day-to-day operation and rollback.

## What's in Phase 2 + 3 + 4 + 5 + 6 + 7 + 8

- `migrations/0001_control_plane.sql` — tenant registry, encrypted
  credential storage, capability/health cache, and a completely
  separate Lummet admin identity system (`lummet_admins`,
  `lummet_sessions`) with its own audit log.
- `worker/crypto.js` — AES-GCM encrypt/decrypt for tenant HMAC
  secrets at rest, keyed by a Worker secret (`CREDENTIAL_KEK`) that
  never touches D1.
- `worker/signing.js` — builds the same HMAC-signed headers the
  tenant's Super API verifies (shared canonical-string scheme).
- `worker/data.js` — shared low-level D1 reads (tenant rows, active
  credential) used by both `registry.js` and `client.js`.
- `worker/client.js` — the single place this control plane ever
  makes an outbound HTTPS call to a tenant. Exposes
  `requestTenant(env, tenant, { method, path, body, timeoutMs })`,
  handles credential lookup/decryption + signing, and normalizes
  every failure into the error taxonomy from rule #24 (401/403/404/
  409/422/429/500/502/504), distinguishing a genuine timeout (504)
  from a network/connection failure (502).
- `worker/auth.js` — Lummet master-admin login/session (PBKDF2 +
  HttpOnly session cookie), bootstrap-first-admin flow, rate
  limiting.
- `worker/registry.js` — tenant CRUD, credential issuance/rotation,
  and connection testing. `testConnection()` routes through
  `client.js`'s `requestTenant()` rather than constructing its own
  `fetch()`.
- `worker/audit.js` — control-plane-side audit log writer.
- `worker/views/layout.js` — shared HTML shell (sidebar nav,
  topbar, CSS) — its own visual identity, deliberately distinct
  from the tenant admin UI (rule #11).
- `worker/views/pages/login.js` — login page, which automatically
  switches to a one-time "create the first admin" form when
  `lummet_admins` is empty.
- `worker/views/pages/dashboard.js` — overview page: tenant counts,
  health breakdown, recent audit activity.
- `worker/views/pages/tenants.js` — All Tenants, Add Tenant
  (shows the issued credential exactly once), Health, Deployments,
  and per-tenant detail (enable/disable/rotate/test/delete actions).
- `worker/views/pages/platform.js` — Audit Logs, Credentials, and
  Capabilities pages (all backed by local control-plane data), plus
  a static API reference page.
- `worker/views/pages/placeholder.js` — Content/System nav sections
  render with the correct navigation and labels now, but explain
  that managing tenant resources requires tenant switching (Phase 5)
  and the resource CRUD screens (Phase 6).
- `worker/index.js` — now serves both the JSON API (unchanged) and
  the HTML dashboard pages. Page routes redirect an unauthenticated
  visitor to `/login`; API routes still return a JSON 401.

The dashboard's navigation follows the exact structure from the
master plan's rule #11 (Dashboard / Tenants / Content / System /
Platform), but its look is its own — a dark, mission-control style
distinct from the tenant CMS admin, so an operator can never mistake
one for the other.

Not yet built (later phases): tenant-switching-aware CRUD screens
for Content/System (Phase 6), the health-check cron (Phase 7). Both
are documented further down — see those sections below.

### Phase 5 — Tenant switching

- The topbar on every dashboard page now shows an **active tenant**
  selector, populated from the registry. Switching tenants calls
  `POST /api/tenants/:id/switch` (or `DELETE /api/session/active-tenant`
  to clear it), which only ever updates `lummet_sessions.active_tenant_id`
  — the tenant's own session/auth state is never touched (rule #12).
- A tenant's detail page also offers a "Set as active tenant" button,
  and shows an "Active tenant" badge when it's the current selection.
- The Content/System placeholder pages now reflect which tenant (if
  any) is active, previewing what Phase 6's CRUD screens will operate
  against once they resolve requests through `client.js`'s
  `requestTenant()` against `admin.activeTenantId`.
- Every switch/clear action is recorded in `lummet_audit_logs`
  (`action: "switch_tenant"` / `"clear_active_tenant"`).

### Phase 6 — CRUD administration

- `worker/resources.js` — field/column configuration for every
  resource the tenant's Super API supports, taken directly from the
  tenant repo's actual `schema.sql` columns and the real Phase 1
  handler signatures (which key differ per resource: `casinos`,
  `reviews`, `news`, `pages`, `categories` on `:slug`; `countries` on
  `:code`; `authors`, `media`, `users` on numeric `:id`).
- `worker/views/pages/crud.js` — generic list/create/edit screens
  driven entirely by that config. Every read and write goes through
  `client.js`'s `requestTenant()` (via `getFromTenant`/`postToTenant`/
  `putToTenant`/`deleteFromTenant`) against `admin.activeTenantId` —
  no page ever constructs its own `fetch()`.
- `worker/views/pages/settings.js` — a dedicated screen for
  `settings`, since it's a key/value dictionary rather than a list of
  records; existing keys are editable in place and a new key can be
  added, all through the same safe-settings filter the tenant's
  Super API already enforces.
- **Capability-aware**: a list screen checks the tenant's cached
  `tenant_capabilities` (from a prior "Test connection") and shows a
  clear notice instead of a broken screen if that tenant's deployment
  reports the resource as unsupported (rule #16).
- **No active tenant**: every CRUD/settings screen shows a plain
  "select a tenant" notice rather than erroring if nothing is active.
- **Errors**: any non-2xx from the tenant is shown inline using the
  taxonomy from `client.js` (401/403/404/409/422/429/500/502/504),
  never a raw stack trace (rule #24).
- **Unsupported nav items stay honest**: `permissions` and
  `components` remain on the System nav (per the master plan's fixed
  nav structure) but still render the Phase 4 placeholder, since no
  Super API endpoint exists for them yet — they were never part of
  Phase 1's allowlist.
- **users** is role-only (no create/delete) and **media** is
  edit/delete-only (no create — there's no upload endpoint in the
  Super API yet), matching exactly what Phase 1's handlers actually
  expose.
- While wiring `authors` into the CRUD config, found and fixed a
  real bug in the tenant repo's Phase 1 `super/handlers.js`:
  `handleGetAuthor` was keying on `slug` while `handleUpdateAuthor`/
  `handleDeleteAuthor` key on numeric `id`, even though all three
  share the same `:id` URL segment from `router.js`. Fixed to use
  `authorsDB.getAuthorById()` consistently. See the tenant repo's
  updated `en/worker/super/handlers.js`.

### Phase 7 — Health monitoring cron

- `worker/cron.js` — `runHealthChecks(env)` walks every registered
  tenant (active and disabled) in small concurrent batches (default
  5 at a time) and calls `registry.js`'s `testConnection()` for
  each — the exact same code path a manual "Test connection" click
  uses, which itself routes through `client.js` (rule #23). A
  network failure, timeout, or disabled tenant is recorded with its
  correct status in `tenant_health` and is **never** treated as "the
  tenant was deleted" (rule #15) — only an explicit
  `DELETE /api/tenants/:id` removes a registry row.
- `wrangler.jsonc` — added a `triggers.crons` entry (`*/5 * * * *`
  by default; adjust to taste) that invokes the new `scheduled()`
  export in `worker/index.js`, which runs `runHealthChecks` inside
  `ctx.waitUntil()`.
- `POST /api/tenants/health-check-all` — an authenticated,
  on-demand version of the same sweep, for testing or for an admin
  who doesn't want to wait for the next tick. Logged to
  `lummet_audit_logs` (`action: "health_check_all"`) since it's an
  explicit admin action; the automatic cron ticks are not
  individually audit-logged — `tenant_health` is already the source
  of truth for reachability, and logging every scheduled tick for
  every tenant would mostly just be noise in the audit trail.
- The Health page (`/tenants/health`) gained a **Run all now**
  button that calls the on-demand endpoint and shows a summary
  before refreshing.
- Verified end-to-end against a fake D1 (no live tenant needed):
  a tenant with no configured credential correctly resolves to
  `Configuration Error`, and a disabled tenant resolves to
  `Disabled` without an outbound network call — both routed through
  the real `registry.js`/`client.js` code, not a reimplementation.

### Phase 8 — Audit logging (completeness)

Most of the audit trail already existed from earlier phases
(`lummet_audit_logs`, the Audit Logs page, and `logAudit()` calls on
every registry/CRUD/settings mutation). Phase 8 closes the
remaining gaps:

- **Admin login events are now audited.** Previously only
  registry/CRUD mutations were logged — a login, a failed login
  attempt, a bootstrap, or a logout never appeared in the trail.
  `POST /api/auth/{bootstrap,login,logout}` and the page-based
  `/login` form now all write to `lummet_audit_logs`
  (`action: "bootstrap" | "login" | "logout"`), including **failed**
  login attempts (the attempted email is recorded, never the
  password). This is on top of the existing `lummet_auth_attempts`
  rate-limiting table, which is unchanged.
- **Fixed a real bug found while wiring this up**: the page-based
  `/login` form handler called `parseForm(request)` (which consumes
  the request body as form data) and then also called
  `auth.login(request, env)`, which tried to read the same body
  again as JSON — a second read of an already-consumed `Request`
  body, which throws. Fixed by splitting `auth.js`'s `login()` into
  a thin request-parsing wrapper plus a reusable
  `authenticateAdmin(env, email, password, ipHash)` core; the page
  route now calls the core directly with the already-parsed form
  values instead of re-reading the request.
- **Retention**: `worker/cron.js` gained `pruneOldAuditLogs()`,
  which deletes `lummet_audit_logs` rows older than 180 days (only
  that table — never `tenant_health`, the registry, or any tenant's
  own data). It runs alongside the Phase 7 health-check sweep on
  the same Cron Trigger.
- **Filtering and pagination**: the Audit Logs page
  (`/platform/audit-logs`) now supports filtering by tenant, action,
  and success/failure, plus offset-based pagination (50 rows per
  page) instead of a fixed 200-row cap with no way to see older
  entries.
- Verified end-to-end against a fake D1: `bootstrapFirstAdmin` now
  returns the new admin's id via `INSERT ... RETURNING id` (a real
  D1-supported clause per Cloudflare's own docs), and the
  bootstrap → login → logout sequence was run against a mock
  `LUMMET_DB` to confirm `adminId` flows through correctly at every
  step.
- Confirmed no audit entry anywhere logs a password, a decrypted
  HMAC secret, or a KEK — `errorMessage` fields only ever contain
  error codes/reasons or an admin's own email.

This closes out all 8 phases of the master plan.

## Deployment

See **DEPLOYMENT.md** in this same folder for the full, step-by-step
guide covering both the control plane and the tenant-side Super API
(including how they fit together, adding another tenant, day-to-day
operation, and rollback). This README covers what's built; that file
covers how to run it.
