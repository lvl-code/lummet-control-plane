# Lummet Deployment Guide

This covers deploying both halves of the system:

1. **Tenant side** — the Super API added to each tenant repo (Phase 1).
   Already applied to `freewin.xyz`; repeat for any other tenant.
2. **Control plane** — the standalone `lummet-control-plane/` Worker +
   D1 (Phases 2–8), deployed once, independent of any tenant.

Read this top to bottom the first time. After that, "Adding another
tenant" is the only section you'll repeat regularly.

---

## Architecture recap

```
Lummet (this project)  --HTTPS, HMAC-signed-->  Tenant Worker  -->  Tenant D1
```

- Each tenant is one Cloudflare Worker with its own independent D1.
  Nothing here changes that — the control plane never touches a
  tenant's D1 directly, only its `/en/api/super/*` HTTP endpoints.
- The control plane is its own Worker with its own, separate D1
  (`lummet-control-plane-db`). It stores *metadata about* tenants
  (host, encrypted credential, cached health/capabilities) — never
  tenant content (casinos, reviews, news, users, etc.).
- Deleting a tenant from the control plane's registry only removes
  that metadata. It never deletes anything in the tenant's own D1.

---

## Part 1 — Tenant side (per tenant)

Already done for `freewin.xyz` in this delivery. To add the Super
API to another tenant repo, repeat this section for it.

### 1.1 Apply the code

Copy into the tenant repo, preserving paths:

```
en/worker/super/router.js
en/worker/super/auth.js
en/worker/super/handlers.js
en/worker/super/capabilities.js
en/migrations/0017_super_api.sql
en/docs/super-api.md
```

And apply these two small edits (already done in `freewin.xyz`):

**`en/worker/index.js`** — add the import and one new `case`:
```js
import { handleSuperApi } from "./super/router.js";
// ...
case "superApi":
  return handleSuperApi(request, env, ctx, route.path);
case "api":
  // ...unchanged...
```
(Place `superApi` **before** `case "api"`.)

**`en/worker/routes.js`** — add one match **before** the existing
generic API match:
```js
if (path.startsWith("/en/api/super/")) {
  return { type: "superApi", path };
}
if (path.startsWith("/api/") || path.startsWith("/en/api/")) {
  // ...unchanged...
}
```

Nothing else in the tenant repo changes. Verify with:
```
git diff --stat
```
You should see exactly these two files modified, plus the new files
above as untracked/added.

### 1.2 Run the migration

```
wrangler d1 execute <tenant-db-name> --file=en/migrations/0017_super_api.sql --remote
```

Use `--env <envname>` too if the tenant uses a named environment
block in `wrangler.jsonc` (e.g. `freewin.xyz` deploys via
`--env levelcasino`, `--env clustercasino`, etc. — check the tenant's
`wrangler.jsonc` `env` block names). Drop `--remote` to apply to a
local/dev D1 first if you want to test before touching production.

This migration is additive only (`CREATE TABLE IF NOT EXISTS`) — it
does not touch `casinos`, `news`, `users`, or any existing table.

### 1.3 Set the tenant's Super API secrets

You'll get these values from the control plane in Part 2, step 2.6
(**Register a tenant**) — come back to this step after that.

```
wrangler secret put SUPER_API_CREDENTIAL_ID --env <envname>
wrangler secret put SUPER_API_SECRET --env <envname>
```

Until these are set, the tenant's Super API returns `503
not_configured` for every request — the tenant's normal site, admin,
and login are completely unaffected either way.

### 1.4 Deploy the tenant Worker

```
wrangler deploy --env <envname>
```

### 1.5 Verify nothing broke

Manually check, per the master plan's acceptance criteria:
- Homepage loads normally
- Admin login and dashboard work
- A normal CRUD action (e.g. edit a news post) works
- The tenant's `lummet.<tenant-host>` AI assistant subdomain still
  responds (if configured)
- `GET https://<tenant-host>/en/api/super/handshake` **without**
  auth headers returns `401`, not a crash or a 200

---

## Part 2 — Control plane (deploy once)

### 2.1 Prerequisites

```
cd lummet-control-plane
npm install -g wrangler   # if not already installed
wrangler login
```

### 2.2 Create the D1 database

```
wrangler d1 create lummet-control-plane-db
```

Copy the `database_id` from the output into `wrangler.jsonc`,
replacing `REPLACE_WITH_ACTUAL_D1_DATABASE_ID`.

### 2.3 Run the migrations

```
wrangler d1 execute lummet-control-plane-db --file=migrations/0001_control_plane.sql --remote
wrangler d1 execute lummet-control-plane-db --file=migrations/0002_lummet_cms.sql --remote
wrangler d1 execute lummet-control-plane-db --file=migrations/0003_lummet_admin_rbac.sql --remote
wrangler d1 execute lummet-control-plane-db --file=migrations/0004_lummet_homepage_sections.sql --remote
```

`0002` adds Lummet's own CMS tables (pages, authors, brands,
partners, updates, publications, advertisements, homepage settings).
`0003` adds the staff-account RBAC tables. `0004` adds the homepage
sections table (Phase 9.1). All three are additive — safe to run on
an existing deployment that only has `0001` applied, and the
homepage/nav code falls back gracefully if a later migration hasn't
run yet (new nav sections/CMS just won't have anywhere to write, and
`renderPublicHomepage` catches the failure and falls back to its
built-in defaults). Run `0002`/`0003` before granting any staff
account access, though — until `0003` is applied, every
non-bootstrap admin account creation will fail since
`lummet_admins.status` doesn't exist yet.

### 2.4 Generate and set the credential encryption key

This key (KEK) encrypts every tenant's HMAC secret at rest. Losing
it means every tenant credential must be rotated.

```
openssl rand -base64 32
wrangler secret put CREDENTIAL_KEK
# paste the value from openssl rand above
```

### 2.5 Deploy

```
wrangler deploy
```

This also registers the Cron Trigger (`*/5 * * * *` by default,
`wrangler.jsonc` → `triggers.crons`) that runs the Phase 7
health-check sweep automatically.

### 2.6 Choose the master hostname

**Do not** use a hostname whose first label is `lummet` (e.g.
`lummet.io`, `lummet.example.com`). Tenant repos route
`hostname.startsWith("lummet.")` to their own per-tenant AI
assistant (`en/worker/lummet/`) — a prefix match, so it would also
match an apex domain like `lummet.io`. This is a real ambiguity in
the existing tenant routing, not a hypothetical one.

Use something unambiguous instead — e.g. `console.yourdomain.com` —
and attach it as a Worker Route or Custom Domain in the Cloudflare
dashboard, or via a `routes` entry in `wrangler.jsonc`.

### 2.7 Bootstrap the first admin

Visit `https://<control-plane-host>/login`. With zero rows in
`lummet_admins`, it automatically shows a "create the first admin"
form instead of a login form, and logs you straight in afterward.

(Or via the API: `POST /api/auth/bootstrap` with
`{"email": "...", "password": "... 12+ chars ..."}`.)

The bootstrapped account is always a super admin — it can grant
itself and anyone else access to anything. Add every other Lummet
staff account from **Platform → Admins → New admin** (super-admin
only): pick "Staff" as the role, and a temporary password is shown
exactly once — copy it before leaving the page, then grant that
staff account whichever tenants and Content/System/CMS resources
they need from their detail page (`/platform/admins/:id`). A fresh
staff account has zero access until you grant it, and is forced to
`/account/password` to set a real password before it can use
anything else. Any admin can change their password later from the
"Change password" link in the topbar.

### 2.8 Set up lummet.com's own homepage/content

Optional, any time after 2.7: **Lummet Site → Homepage settings**
lets you override the hero title/subtitle/CTAs, footer text, and
contact email shown on the public homepage — everything left blank
falls back to sensible built-in copy. **Lummet Site → Pages/Authors/
Brand profiles/Partners/Updates/Publications/Advertisements** manage
the rest of lummet.com's own content (separate from any tenant's
content). Published Updates and Partners show up on the homepage
automatically; a published Page is reachable at
`lummet.com/p/<slug>`.

### 2.9 Register a tenant

From the dashboard: **Tenants → Add Tenant**, enter the tenant's
display name and hostname (e.g. `freewin.xyz`).

The response shows a **credential_id and secret exactly once** —
copy both immediately. This is what goes into Part 1, step 1.3 on
the tenant side:

```
wrangler secret put SUPER_API_CREDENTIAL_ID --env <envname>
# paste credential_id

wrangler secret put SUPER_API_SECRET --env <envname>
# paste secret
```

After setting those and redeploying the tenant Worker, go back to
the tenant's page in the dashboard and click **Test connection**.
You should see `Online` and a populated capability list.

### 2.10 Repeat for each additional tenant

Part 1 (tenant side) + step 2.9 (register + set secrets), once per
tenant. Each tenant gets its own credential — rotating or revoking
one tenant's credential never affects another. Remember: a staff
admin needs to be explicitly granted access to a new tenant before
they can see or manage it (Platform → Admins → that admin →
Tenant access) — a super admin always has access automatically.

---

## Adding another tenant later (the short version)

1. Apply Part 1.1–1.2 to that tenant's repo (copy the 4 files + 2
   edits + run the migration).
2. **Tenants → Add Tenant** in the Lummet dashboard.
3. `wrangler secret put` the two returned values on the tenant
   Worker.
4. Deploy the tenant Worker.
5. **Test connection** from the tenant's page in the dashboard.

---

## Operating the control plane

- **Switch active tenant**: the dropdown in the topbar of every
  dashboard page. This only changes *your session's* selection —
  it never touches the tenant's own auth/session state.
- **CRUD**: Content/System nav items operate against whichever
  tenant is currently active. `casinos`, `reviews`, `news`, `pages`,
  `categories`, `countries`, `authors`, `users` (role-only), `media`
  (edit/delete only — no upload yet), and `settings` (safe keys
  only) are supported. `permissions` and `components` show a
  placeholder — no Super API endpoint exists for them yet.
- **Health**: `Tenants → Health` shows last-known status per
  tenant, refreshed automatically every 5 minutes by the cron, or
  on demand via the **Run all now** button.
- **Rotating a credential**: tenant's detail page → **Rotate
  credential**. The new secret is shown once — update the tenant
  Worker's `SUPER_API_SECRET`/`SUPER_API_CREDENTIAL_ID` immediately,
  or that tenant will start rejecting Lummet's requests as
  unauthorized until you do.
- **Audit trail**: `Platform → Audit Logs` — filterable by tenant,
  action, and success/failure, paginated. Entries older than 180
  days are pruned automatically by the same cron. Never contains
  passwords, decrypted secrets, or the KEK.

---

## Rollback

Everything is additive and isolated in both directions:

- **Tenant side**: revert the two small edits to `index.js` /
  `routes.js`, delete `en/worker/super/`, and optionally drop the
  three new tables (`super_api_nonces`, `super_api_rate_limits`,
  `super_audit_logs`) — nothing else in the tenant's schema or code
  was touched. Removing `SUPER_API_CREDENTIAL_ID`/`SUPER_API_SECRET`
  alone is enough to disable the Super API without any code change
  (it starts returning `503`).
- **Control plane**: not deploying it at all, or deleting the
  Worker entirely, leaves every tenant completely unaffected —
  tenants never call the control plane, only the reverse.
- **A single tenant**: `DELETE /api/tenants/:id` (or the "Delete
  registration" button) removes only that tenant's row from the
  control plane's own D1. It never touches that tenant's D1,
  content, or deployment.

---

## Pre-production checklist

Everything here has been verified by static syntax checking
(`node --check` on every file) and functional tests against mocked
D1/fetch — **not against a live Cloudflare D1 or Workers runtime**.
Before this touches real production traffic:

- [ ] Deploy the control plane to a staging hostname first.
- [ ] Deploy Phase 1 to one non-production tenant (or a tenant's
      staging environment, if it has one) before production tenants.
- [ ] Walk the manual test list from the master plan (§29): reject
      unauthenticated / bad-signature / replayed / expired requests;
      confirm full CRUD round-trip; confirm the tenant's normal
      site/admin/login/AI-assistant are unaffected.
- [ ] Register two tenants and confirm changing one never affects
      the other — live, not just by reading the code.
- [ ] Have another engineer review the HMAC/auth path before
      production data is exposed through it — this is, by design,
      a remote administrative interface.
