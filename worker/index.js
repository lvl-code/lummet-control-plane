// =====================================================
// LUMMET CONTROL PLANE — WORKER ENTRY POINT
//
// JSON API (unchanged from Phase 2/3):
//   POST /api/auth/bootstrap   (only while zero admins exist)
//   POST /api/auth/login
//   POST /api/auth/logout
//   GET  /api/tenants
//   POST /api/tenants
//   GET  /api/tenants/:id
//   PUT  /api/tenants/:id
//   DELETE /api/tenants/:id
//   POST /api/tenants/:id/enable
//   POST /api/tenants/:id/disable
//   POST /api/tenants/:id/rotate-credential
//   POST /api/tenants/:id/test-connection
//   GET  /api/tenants/:id/capabilities
//   POST /api/tenants/:id/switch   (sets active tenant on session)
//   DELETE /api/session/active-tenant  (clears active tenant on session)
//
// Public marketing site (unauthenticated):
//   GET  /            (public homepage for anonymous visitors;
//                       signed-in admins see the dashboard instead)
//   GET  /privacy
//   GET  /terms
//
// Dashboard pages (Phase 4, new):
//   GET/POST /login
//   GET  /             (authenticated dashboard, same path as above)
//   GET  /tenants
//   GET/POST /tenants/new
//   GET  /tenants/health
//   GET  /tenants/deployments
//   GET  /tenants/:id
//   GET  /content/:resource
//   GET  /system/:resource
//   GET  /platform/api
//   GET  /platform/credentials
//   GET  /platform/audit-logs
//   GET  /platform/capabilities
//
// Everything except bootstrap/login/logout requires a valid
// lummet_session cookie (see auth.js). This is a completely
// separate identity system from any tenant's own auth. Page
// routes redirect unauthenticated visitors to /login; API
// routes return a JSON 401.
// =====================================================

import * as auth from "./auth.js";
import * as registry from "./registry.js";
import { logAudit } from "./audit.js";
import { getFromTenant } from "./client.js";
import { isSuperAdmin, canAccessTenant, hasPermission, setPermission, setTenantAccess, listAccessibleTenants } from "./rbac.js";

import { renderLoginPage } from "./views/pages/login.js";
import { renderDashboardHome } from "./views/pages/dashboard.js";
import { renderPublicHomepage, renderPublicStaticPage, renderPublicCmsPage } from "./views/pages/home.js";
import {
  renderTenantsList,
  renderAddTenantForm,
  renderTenantCreatedPage,
  renderHealthPage,
  renderDeploymentsPage,
  renderTenantDetail
} from "./views/pages/tenants.js";
import {
  renderAuditLogsPage,
  renderCredentialsPage,
  renderCapabilitiesPage,
  renderApiReferencePage
} from "./views/pages/platform.js";
import { renderResourcePlaceholder } from "./views/pages/placeholder.js";
import { getResourceConfig } from "./resources.js";
import {
  renderResourceList,
  renderResourceForm,
  submitCreate,
  submitUpdate,
  submitDelete
} from "./views/pages/crud.js";
import {
  renderSettingsPage,
  submitSettings,
  submitCreateAdRule,
  submitUpdateAdRule,
  submitDeleteAdRule
} from "./views/pages/settings.js";
import { renderMediaUploadForm, submitMediaUpload, submitMediaFromUrl } from "./views/pages/media.js";
import {
  renderPermissionsMatrix,
  submitSetPermission,
  renderUserItemAccess,
  submitSetItemScope,
  submitSetItemAssignment
} from "./views/pages/permissions.js";
import {
  renderReviewBlocksPage,
  submitCreateReviewBlock,
  submitUpdateReviewBlock,
  submitDeleteReviewBlock
} from "./views/pages/review-blocks.js";
import { runHealthChecks, pruneOldAuditLogs } from "./cron.js";
import { getCmsResourceConfig } from "./cms-resources.js";
import {
  renderCmsList,
  renderCmsForm,
  submitCmsCreate,
  submitCmsUpdate,
  submitCmsDelete,
  renderSiteSettingsPage,
  submitSiteSettings
} from "./views/pages/cms.js";
import {
  renderAdminsList,
  renderNewAdminForm,
  renderAdminCreatedPage,
  renderAdminDetail,
  submitCreateAdmin,
  submitSetRole,
  submitSetStatus,
  submitDeleteAdmin,
  submitSetTenantAccess,
  submitSetPermission as submitSetAdminPermission
} from "./views/pages/admins.js";
import { renderChangePasswordPage, submitChangePassword } from "./views/pages/account.js";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

function html(content, status = 200, extraHeaders = {}) {
  return new Response(content, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders }
  });
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, ...extraHeaders } });
}

async function hashIP(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!ip) return null;
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function matchPath(pattern, path) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function parseForm(request) {
  const formData = await request.formData();
  const out = {};
  for (const [key, value] of formData.entries()) out[key] = value;
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const requestId = crypto.randomUUID();
    const isApiRoute = path.startsWith("/api/");

    try {
      // ---------------------------------------------
      // Unauthenticated JSON auth routes
      // ---------------------------------------------

      if (method === "POST" && path === "/api/auth/bootstrap") {
        const body = await request.json().catch(() => ({}));
        const result = await auth.bootstrapFirstAdmin(env, body.email, body.password);

        await logAudit(env, {
          adminId: result.ok ? result.adminId : null,
          endpoint: path, method,
          resource: "lummet_admin", action: "bootstrap",
          success: result.ok, statusCode: result.ok ? 200 : result.status,
          errorMessage: result.ok ? `email:${result.email}` : result.error,
          requestId, ipHash: await hashIP(request)
        });

        if (!result.ok) return json({ success: false, error: result.error }, result.status);
        return json({ success: true });
      }

      if (method === "POST" && path === "/api/auth/login") {
        const result = await auth.login(request, env);

        await logAudit(env, {
          adminId: result.adminId || null,
          endpoint: path, method,
          resource: "lummet_admin", action: "login",
          success: result.ok, statusCode: result.ok ? 200 : result.status,
          errorMessage: result.ok ? `email:${result.email}` : `email:${result.email || "unknown"} reason:${result.error}`,
          requestId, ipHash: await hashIP(request)
        });

        if (!result.ok) return json({ success: false, error: result.error }, result.status);
        return json({ success: true }, 200, { "Set-Cookie": result.cookie });
      }

      if (method === "POST" && path === "/api/auth/logout") {
        const result = await auth.logout(request, env);

        await logAudit(env, {
          adminId: result.adminId,
          endpoint: path, method,
          resource: "lummet_admin", action: "logout",
          success: true, statusCode: 200,
          requestId, ipHash: await hashIP(request)
        });

        return json({ success: true }, 200, { "Set-Cookie": result.cookie });
      }

      // ---------------------------------------------
      // Login page (unauthenticated, HTML)
      // ---------------------------------------------

      if (path === "/login") {
        const existingAdmin = await auth.getCurrentAdmin(request, env);
        if (existingAdmin && method === "GET") {
          return redirect("/");
        }

        const bootstrapMode = !(await auth.hasAnyAdmins(env));

        if (method === "GET") {
          return html(renderLoginPage({ mode: bootstrapMode ? "bootstrap" : "login" }));
        }

        if (method === "POST") {
          const form = await parseForm(request);
          const pageIpHash = await hashIP(request);
          const authIpHash = await auth.hashIPForRateLimit(request);

          if (form.mode === "bootstrap") {
            const result = await auth.bootstrapFirstAdmin(env, form.email, form.password);

            await logAudit(env, {
              adminId: result.ok ? result.adminId : null,
              endpoint: path, method,
              resource: "lummet_admin", action: "bootstrap",
              success: result.ok, statusCode: result.ok ? 200 : result.status,
              errorMessage: result.ok ? `email:${result.email}` : result.error,
              requestId, ipHash: pageIpHash
            });

            if (!result.ok) {
              return html(
                renderLoginPage({ mode: "bootstrap", error: describeAuthError(result.error) })
              );
            }
            // Log the freshly bootstrapped admin straight in.
            const loginResult = await auth.authenticateAdmin(env, form.email, form.password, authIpHash);

            await logAudit(env, {
              adminId: loginResult.adminId || null,
              endpoint: path, method,
              resource: "lummet_admin", action: "login",
              success: loginResult.ok, statusCode: loginResult.ok ? 200 : loginResult.status,
              errorMessage: loginResult.ok ? `email:${loginResult.email}` : `email:${loginResult.email || "unknown"} reason:${loginResult.error}`,
              requestId, ipHash: pageIpHash
            });

            if (!loginResult.ok) return redirect("/login");
            return redirect("/", { "Set-Cookie": loginResult.cookie });
          }

          const loginResult = await auth.authenticateAdmin(env, form.email, form.password, authIpHash);

          await logAudit(env, {
            adminId: loginResult.adminId || null,
            endpoint: path, method,
            resource: "lummet_admin", action: "login",
            success: loginResult.ok, statusCode: loginResult.ok ? 200 : loginResult.status,
            errorMessage: loginResult.ok ? `email:${loginResult.email}` : `email:${loginResult.email || "unknown"} reason:${loginResult.error}`,
            requestId, ipHash: pageIpHash
          });

          if (!loginResult.ok) {
            return html(
              renderLoginPage({ mode: "login", error: describeAuthError(loginResult.error) })
            );
          }
          return redirect("/", { "Set-Cookie": loginResult.cookie });
        }
      }

      // ---------------------------------------------
      // Public marketing site (unauthenticated, HTML)
      //
      // "/" is shared by two very different audiences: an
      // anonymous visitor should see the public Lummet
      // marketing homepage, while a signed-in admin should
      // keep seeing the authenticated dashboard exactly as
      // before. Rather than move the dashboard off "/" (which
      // would change an existing route), an unauthenticated
      // visitor is served the public page here and everything
      // else falls through unchanged to the dashboard route
      // further down, which still requires a session.
      //
      // /privacy and /terms are simple public placeholder pages
      // linked from the homepage footer.
      // ---------------------------------------------

      if (method === "GET" && path === "/") {
        const maybeAdmin = await auth.getCurrentAdmin(request, env);
        if (!maybeAdmin) {
          return html(await renderPublicHomepage(env, { contactEmail: env.CONTACT_EMAIL || null }));
        }
        // Signed in — fall through to the authenticated dashboard route below.
      }

      // /p/:slug — a Lummet-managed standalone page created from
      // /cms/pages in the dashboard (see cms.js). Public and
      // unauthenticated, same audience as "/" above. Falls through
      // to the normal 404 below if there's no published page there.
      {
        const pageParams = method === "GET" ? matchPath("/p/:slug", path) : null;
        if (pageParams) {
          const rendered = await renderPublicCmsPage(env, pageParams.slug);
          if (rendered) return html(rendered);
          // fall through to 404 further down
        }
      }

      if (method === "GET" && path === "/privacy") {
        return html(
          renderPublicStaticPage({
            title: "Privacy",
            heading: "Privacy",
            bodyText:
              "This page will describe how Lummet handles data for the platform and its connected brands. Full privacy documentation is coming soon."
          })
        );
      }

      if (method === "GET" && path === "/terms") {
        return html(
          renderPublicStaticPage({
            title: "Terms",
            heading: "Terms",
            bodyText:
              "This page will describe the terms of use for the Lummet platform. Full terms documentation is coming soon."
          })
        );
      }

      // ---------------------------------------------
      // Everything below requires a valid session.
      // Page routes redirect to /login; API routes 401.
      // ---------------------------------------------

      const admin = await auth.getCurrentAdmin(request, env);
      if (!admin) {
        if (isApiRoute) return json({ success: false, error: "unauthorized" }, 401);
        return redirect("/login");
      }

      const ipHash = await hashIP(request);
      const adminIsSuper = isSuperAdmin(admin);

      // Any admin signed in with a temporary password (set at account
      // creation — see admins.js) is redirected to /account/password
      // for every HTML route until they set a real one. API routes are
      // left alone so nothing silently breaks mid-session.
      if (admin.must_change_password === 1 && !isApiRoute && path !== "/account/password") {
        return redirect("/account/password");
      }

      // ---------------------------------------------
      // RBAC enforcement helpers (Phase 10)
      //
      // These are the checks that actually matter — the nav in
      // layout.js only hides a link a staff admin can't use, it
      // doesn't stop a direct request to the route. Every handler
      // below that touches a tenant's Content/System resources,
      // lummet.com's own CMS, or the control plane itself
      // (tenant registry, credentials, other admins' accounts)
      // goes through one of these first.
      // ---------------------------------------------

      function forbidden() {
        if (isApiRoute) return json({ success: false, error: "forbidden" }, 403);
        return html(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;">
          <h1>403 — Forbidden</h1><p>You don't have access to this. Ask a super admin to grant it.</p>
          <a href="/">Back to dashboard</a></body></html>`, 403);
      }

      /** Super-admin-only screens: tenant registry, credentials, other admins. */
      function requireSuperAdmin() {
        return adminIsSuper ? null : forbidden();
      }

      /** area = 'tenant' | 'cms'; action = create|read|update|delete. */
      async function requirePermission(area, resource, action) {
        const allowed = await hasPermission(env, admin, area, resource, action);
        return allowed ? null : forbidden();
      }

      /** For any route that acts on the admin's currently active tenant. */
      async function requireActiveTenantAccess() {
        const allowed = await canAccessTenant(env, admin, admin.activeTenantId);
        return allowed ? null : forbidden();
      }

      /** For routes that take an explicit :id — e.g. /api/tenants/:id/switch. */
      async function requireTenantParamAccess(tenantId) {
        const allowed = await canAccessTenant(env, admin, tenantId);
        return allowed ? null : forbidden();
      }

      // ===============================================
      // JSON API
      // ===============================================

      if (isApiRoute) {
        // GET /api/tenants — a staff admin only ever sees the tenants
        // they've been granted; a super admin sees all of them.
        if (method === "GET" && path === "/api/tenants") {
          const tenants = await registry.listTenants(env);
          const filtered = await listAccessibleTenants(env, admin, tenants);
          return json({ success: true, data: filtered });
        }

        // POST /api/tenants — registering a brand-new tenant touches
        // the control plane itself, not any one tenant's content, so
        // this stays super-admin-only (same as the Tenants nav section).
        if (method === "POST" && path === "/api/tenants") {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const body = await request.json().catch(() => ({}));
          const result = await registry.createTenant(env, body);

          await logAudit(env, {
            adminId: admin.id,
            tenantId: result.tenant?.id,
            endpoint: path,
            method,
            resource: "tenant",
            action: "create",
            success: result.ok,
            statusCode: result.ok ? 201 : result.status,
            errorMessage: result.ok ? null : (result.message || result.error),
            requestId,
            ipHash
          });

          if (!result.ok) {
            return json({ success: false, error: result.error, message: result.message }, result.status);
          }
          return json({ success: true, data: result.tenant, credential: result.credential }, 201);
        }

        const tenantIdParams = matchPath("/api/tenants/:id", path);
        const enableParams = matchPath("/api/tenants/:id/enable", path);
        const disableParams = matchPath("/api/tenants/:id/disable", path);
        const rotateParams = matchPath("/api/tenants/:id/rotate-credential", path);
        const testParams = matchPath("/api/tenants/:id/test-connection", path);
        const capabilitiesParams = matchPath("/api/tenants/:id/capabilities", path);
        const switchParams = matchPath("/api/tenants/:id/switch", path);

        if (method === "GET" && tenantIdParams) {
          const guard = await requireTenantParamAccess(tenantIdParams.id);
          if (guard) return guard;
          const tenant = await registry.getTenant(env, tenantIdParams.id);
          if (!tenant) return json({ success: false, error: "not_found" }, 404);
          const health = await registry.getTenantHealth(env, tenantIdParams.id);
          const capabilities = await registry.getTenantCapabilities(env, tenantIdParams.id);
          return json({ success: true, data: { ...tenant, health, capabilities } });
        }

        if (method === "PUT" && tenantIdParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const body = await request.json().catch(() => ({}));
          const result = await registry.updateTenant(env, tenantIdParams.id, body);

          await logAudit(env, {
            adminId: admin.id, tenantId: tenantIdParams.id, endpoint: path, method,
            resource: "tenant", resourceId: tenantIdParams.id, action: "update",
            success: result.ok, statusCode: result.ok ? 200 : result.status,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.error }, result.status);
          return json({ success: true, data: result.tenant });
        }

        if (method === "DELETE" && tenantIdParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const result = await registry.deleteTenant(env, tenantIdParams.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: tenantIdParams.id, endpoint: path, method,
            resource: "tenant", resourceId: tenantIdParams.id, action: "delete",
            success: result.ok, statusCode: result.ok ? 200 : result.status,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.error }, result.status);
          return json({ success: true });
        }

        if (method === "POST" && enableParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const result = await registry.setTenantStatus(env, enableParams.id, "active");
          await logAudit(env, {
            adminId: admin.id, tenantId: enableParams.id, endpoint: path, method,
            resource: "tenant", resourceId: enableParams.id, action: "enable",
            success: result.ok, statusCode: result.ok ? 200 : result.status,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });
          if (!result.ok) return json({ success: false, error: result.error }, result.status);
          return json({ success: true, data: result.tenant });
        }

        if (method === "POST" && disableParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const result = await registry.setTenantStatus(env, disableParams.id, "disabled");
          await logAudit(env, {
            adminId: admin.id, tenantId: disableParams.id, endpoint: path, method,
            resource: "tenant", resourceId: disableParams.id, action: "disable",
            success: result.ok, statusCode: result.ok ? 200 : result.status,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });
          if (!result.ok) return json({ success: false, error: result.error }, result.status);
          return json({ success: true, data: result.tenant });
        }

        if (method === "POST" && rotateParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const result = await registry.rotateCredential(env, rotateParams.id);
          await logAudit(env, {
            adminId: admin.id, tenantId: rotateParams.id, endpoint: path, method,
            resource: "tenant_credential", resourceId: rotateParams.id, action: "rotate",
            success: result.ok, statusCode: result.ok ? 200 : result.status,
            errorMessage: result.ok ? null : (result.message || result.error), requestId, ipHash
          });
          if (!result.ok) return json({ success: false, error: result.error, message: result.message }, result.status);
          return json({ success: true, credential: result.credential });
        }

        if (method === "POST" && testParams) {
          const guard = await requireTenantParamAccess(testParams.id);
          if (guard) return guard;
          const result = await registry.testConnection(env, testParams.id);
          await logAudit(env, {
            adminId: admin.id, tenantId: testParams.id, endpoint: path, method,
            resource: "tenant", resourceId: testParams.id, action: "test_connection",
            success: result.ok, statusCode: result.ok ? 200 : result.status,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });
          if (!result.ok) return json({ success: false, error: result.error }, result.status);
          return json({ success: true, data: result.data });
        }

        if (method === "GET" && capabilitiesParams) {
          const guard = await requireTenantParamAccess(capabilitiesParams.id);
          if (guard) return guard;
          const capabilities = await registry.getTenantCapabilities(env, capabilitiesParams.id);
          return json({ success: true, data: capabilities });
        }

        if (method === "POST" && switchParams) {
          const guard = await requireTenantParamAccess(switchParams.id);
          if (guard) return guard;
          const tenant = await registry.getTenant(env, switchParams.id);
          if (!tenant) return json({ success: false, error: "not_found" }, 404);
          await auth.setActiveTenant(env, admin.sessionId, switchParams.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: switchParams.id, endpoint: path, method,
            resource: "session", resourceId: switchParams.id, action: "switch_tenant",
            success: true, statusCode: 200, requestId, ipHash
          });

          return json({ success: true, data: { active_tenant_id: switchParams.id } });
        }

        if (method === "DELETE" && path === "/api/session/active-tenant") {
          await auth.setActiveTenant(env, admin.sessionId, null);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "session", action: "clear_active_tenant",
            success: true, statusCode: 200, requestId, ipHash
          });

          return json({ success: true, data: { active_tenant_id: null } });
        }

        // Manual, on-demand run of the same check the Cron Trigger
        // performs on a schedule — useful for testing and for an
        // admin who doesn't want to wait for the next tick.
        if (method === "POST" && path === "/api/tenants/health-check-all") {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const summary = await runHealthChecks(env);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "tenant_health", action: "health_check_all",
            success: true, statusCode: 200, requestId, ipHash,
            errorMessage: `checked=${summary.checked} online=${summary.online} disabled=${summary.disabled} failed=${summary.failed}`
          });

          return json({ success: true, data: summary });
        }

        // Lists the active tenant's media library for the media-picker
        // widget in CRUD forms. Proxies through the same authenticated
        // client.js path as everything else — the browser never sees
        // the tenant's credential, only this JSON list.
        if (method === "GET" && path === "/api/media-picker") {
          if (!admin.activeTenantId) {
            return json({ success: true, data: [] });
          }
          const tenantGuard = await requireActiveTenantAccess();
          if (tenantGuard) return tenantGuard;
          const tenant = await registry.getTenant(env, admin.activeTenantId);
          if (!tenant) return json({ success: true, data: [] });

          const result = await getFromTenant(env, tenant, "/en/api/super/media");
          if (!result.ok) return json({ success: false, error: result.reason }, result.status);
          return json({ success: true, data: result.data.data || [] });
        }

        if (method === "POST" && path === "/api/media/upload") {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "media", "create"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitMediaUpload(env, admin, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "media", action: "upload",
            success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true, data: result.data?.data }, 201);
        }

        if (method === "POST" && path === "/api/media/from-url") {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "media", "create"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitMediaFromUrl(env, admin, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "media", action: "create_from_url",
            success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true, data: result.data?.data }, 201);
        }

        if (method === "POST" && path === "/api/permissions/set") {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "users", "update"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetPermission(env, admin, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "permissions", action: "set",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true });
        }

        const itemAccessScopeParams = matchPath("/api/item-access/:id/scope", path);
        if (method === "POST" && itemAccessScopeParams) {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "users", "update"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetItemScope(env, admin, itemAccessScopeParams.id, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "item_access", resourceId: itemAccessScopeParams.id, action: "set_scope",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true });
        }

        const itemAccessAssignParams = matchPath("/api/item-access/:id/assignment", path);
        if (method === "POST" && itemAccessAssignParams) {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "users", "update"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetItemAssignment(env, admin, itemAccessAssignParams.id, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "item_access", resourceId: itemAccessAssignParams.id, action: "set_assignment",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true });
        }

        if (method === "POST" && path === "/api/ad-rules") {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "settings", "update"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitCreateAdRule(env, admin, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "ad_rules", action: "create",
            success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true, data: result.data?.data }, 201);
        }

        const adRuleParams = matchPath("/api/ad-rules/:id", path);
        if (adRuleParams && (method === "PUT" || method === "DELETE")) {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "settings", "update"));
          if (guard) return guard;
          const payload = method === "PUT" ? await request.json().catch(() => ({})) : null;
          const result =
            method === "PUT"
              ? await submitUpdateAdRule(env, admin, adRuleParams.id, payload)
              : await submitDeleteAdRule(env, admin, adRuleParams.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "ad_rules", resourceId: adRuleParams.id, action: method === "PUT" ? "update" : "delete",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true });
        }

        if (method === "POST" && path === "/api/review-blocks") {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "components", "create"));
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitCreateReviewBlock(env, admin, payload);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "review_blocks", action: "create",
            success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true, data: result.data?.data }, 201);
        }

        const reviewBlockParams = matchPath("/api/review-blocks/:id", path);
        if (reviewBlockParams && (method === "PUT" || method === "DELETE")) {
          const guard = (await requireActiveTenantAccess()) || (await requirePermission("tenant", "components", "update"));
          if (guard) return guard;
          const payload = method === "PUT" ? await request.json().catch(() => ({})) : null;
          const result =
            method === "PUT"
              ? await submitUpdateReviewBlock(env, admin, reviewBlockParams.id, payload)
              : await submitDeleteReviewBlock(env, admin, reviewBlockParams.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
            resource: "review_blocks", resourceId: reviewBlockParams.id, action: method === "PUT" ? "update" : "delete",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error || result.reason,
            requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.reason, message: result.message }, result.status || 400);
          return json({ success: true });
        }

        // ---------------------------------------------
        // Lummet admin management API (Phase 10, super-admin only)
        // ---------------------------------------------

        const adminRoleParams = matchPath("/api/admins/:id/role", path);
        if (method === "POST" && adminRoleParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetRole(env, adminRoleParams.id, payload.role, admin.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "lummet_admin", resourceId: adminRoleParams.id, action: "set_role",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.error }, result.status || 400);
          return json({ success: true });
        }

        const adminStatusParams = matchPath("/api/admins/:id/status", path);
        if (method === "POST" && adminStatusParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetStatus(env, adminStatusParams.id, payload.status, admin.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "lummet_admin", resourceId: adminStatusParams.id, action: "set_status",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.error }, result.status || 400);
          return json({ success: true });
        }

        const adminTenantAccessParams = matchPath("/api/admins/:id/tenant-access", path);
        if (method === "POST" && adminTenantAccessParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetTenantAccess(env, adminTenantAccessParams.id, payload.tenant_id, !!payload.allowed);

          await logAudit(env, {
            adminId: admin.id, tenantId: payload.tenant_id || null, endpoint: path, method,
            resource: "lummet_admin_tenant_access", resourceId: adminTenantAccessParams.id,
            action: payload.allowed ? "grant" : "revoke",
            success: result.ok, statusCode: 200, requestId, ipHash
          });

          return json({ success: true });
        }

        const adminPermissionParams = matchPath("/api/admins/:id/permission", path);
        if (method === "POST" && adminPermissionParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const payload = await request.json().catch(() => ({}));
          const result = await submitSetAdminPermission(
            env, adminPermissionParams.id, payload.area, payload.resource, payload.action, !!payload.allowed
          );

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "lummet_admin_permission", resourceId: adminPermissionParams.id,
            action: `${payload.area}.${payload.resource}.${payload.action}=${!!payload.allowed}`,
            success: result.ok, statusCode: 200, requestId, ipHash
          });

          return json({ success: true });
        }

        const adminDeleteParams = matchPath("/api/admins/:id", path);
        if (method === "DELETE" && adminDeleteParams) {
          const guard = requireSuperAdmin();
          if (guard) return guard;
          const result = await submitDeleteAdmin(env, adminDeleteParams.id, admin.id);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "lummet_admin", resourceId: adminDeleteParams.id, action: "delete",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });

          if (!result.ok) return json({ success: false, error: result.error }, result.status || 400);
          return json({ success: true });
        }

        return json({ success: false, error: "not_found" }, 404);
      }

      // ===============================================
      // DASHBOARD PAGES (HTML)
      // ===============================================

      if (method === "GET" && path === "/") {
        return html(await renderDashboardHome(env, admin));
      }

      if (path === "/account/password") {
        if (method === "GET") {
          return html(await renderChangePasswordPage(env, admin, null));
        }

        if (method === "POST") {
          const form = await parseForm(request);
          const result = await submitChangePassword(env, admin, form);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "lummet_admin", resourceId: admin.id, action: "change_password",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.error, requestId, ipHash
          });

          if (!result.ok) {
            return html(await renderChangePasswordPage(env, admin, describePasswordError(result.error)));
          }
          return redirect("/");
        }
      }

      if (method === "GET" && path === "/tenants") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderTenantsList(env, admin, readFlash(url)));
      }

      if (path === "/tenants/new") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        if (method === "GET") return html(await renderAddTenantForm(env, admin));

        if (method === "POST") {
          const form = await parseForm(request);
          const result = await registry.createTenant(env, form);

          await logAudit(env, {
            adminId: admin.id,
            tenantId: result.tenant?.id,
            endpoint: path,
            method,
            resource: "tenant",
            action: "create",
            success: result.ok,
            statusCode: result.ok ? 201 : result.status,
            errorMessage: result.ok ? null : (result.message || result.error),
            requestId,
            ipHash
          });

          if (!result.ok) {
            return html(await renderAddTenantForm(env, admin, { error: result.message || describeRegistryError(result.error) }));
          }

          return html(await renderTenantCreatedPage(env, admin, result.tenant, result.credential), 201);
        }
      }

      if (method === "GET" && path === "/tenants/health") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderHealthPage(env, admin));
      }

      if (method === "GET" && path === "/tenants/deployments") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderDeploymentsPage(env, admin));
      }

      const tenantDetailParams = matchPath("/tenants/:id", path);
      if (method === "GET" && tenantDetailParams) {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        const pageHtml = await renderTenantDetail(env, admin, tenantDetailParams.id, readFlash(url));
        if (!pageHtml) return html("Tenant not found.", 404);
        return html(pageHtml);
      }

      const contentOrSystemCrud = await handleResourceRoutes(request, env, admin, path, method, requestId, ipHash);
      if (contentOrSystemCrud) return contentOrSystemCrud;

      // ---------------------------------------------
      // Lummet Site CMS (Phase 9) — lummet.com's own pages,
      // authors, brands, partners, updates, publications,
      // advertisements, and homepage settings. Backed directly
      // by this control plane's own D1, not any tenant's.
      // ---------------------------------------------

      if (method === "GET" && path === "/cms/settings") {
        const guard = await requirePermission("cms", "site_settings", "read");
        if (guard) return guard;
        return html(await renderSiteSettingsPage(env, admin, readFlash(url)));
      }

      if (method === "POST" && path === "/cms/settings") {
        const guard = await requirePermission("cms", "site_settings", "update");
        if (guard) return guard;
        const form = await parseForm(request);
        await submitSiteSettings(env, form);

        await logAudit(env, {
          adminId: admin.id, tenantId: null, endpoint: path, method,
          resource: "lummet_site_settings", action: "update",
          success: true, statusCode: 200, requestId, ipHash
        });

        return redirect("/cms/settings?flash=Homepage+settings+saved&flash_type=success");
      }

      const cmsListParams = matchPath("/cms/:resource", path);
      if (method === "GET" && cmsListParams && getCmsResourceConfig(cmsListParams.resource)) {
        const guard = await requirePermission("cms", cmsListParams.resource, "read");
        if (guard) return guard;
        return html(await renderCmsList(env, admin, cmsListParams.resource, readFlash(url)));
      }

      const cmsNewParams = matchPath("/cms/:resource/new", path);
      if (cmsNewParams && getCmsResourceConfig(cmsNewParams.resource)) {
        const guard = await requirePermission("cms", cmsNewParams.resource, "create");
        if (guard) return guard;

        if (method === "GET") return html(await renderCmsForm(env, admin, cmsNewParams.resource, null, null));

        if (method === "POST") {
          const form = await parseForm(request);
          const result = await submitCmsCreate(env, cmsNewParams.resource, form);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: `lummet_cms_${cmsNewParams.resource}`, action: "create",
            success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error, requestId, ipHash
          });

          if (!result.ok) return html(await renderCmsForm(env, admin, cmsNewParams.resource, null, result.message || result.error));
          return redirect(`/cms/${cmsNewParams.resource}?flash=Created&flash_type=success`);
        }
      }

      const cmsEditParams = matchPath("/cms/:resource/:id/edit", path);
      if (cmsEditParams && getCmsResourceConfig(cmsEditParams.resource)) {
        if (method === "GET") {
          const guard = await requirePermission("cms", cmsEditParams.resource, "read");
          if (guard) return guard;
          return html(await renderCmsForm(env, admin, cmsEditParams.resource, cmsEditParams.id, null));
        }

        if (method === "POST") {
          const guard = await requirePermission("cms", cmsEditParams.resource, "update");
          if (guard) return guard;
          const form = await parseForm(request);
          const result = await submitCmsUpdate(env, cmsEditParams.resource, cmsEditParams.id, form);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: `lummet_cms_${cmsEditParams.resource}`, resourceId: cmsEditParams.id, action: "update",
            success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
            errorMessage: result.ok ? null : result.message || result.error, requestId, ipHash
          });

          if (!result.ok) return html(await renderCmsForm(env, admin, cmsEditParams.resource, cmsEditParams.id, result.message || result.error));
          return redirect(`/cms/${cmsEditParams.resource}?flash=Saved&flash_type=success`);
        }
      }

      const cmsDeleteParams = matchPath("/cms/:resource/:id/delete", path);
      if (method === "POST" && cmsDeleteParams && getCmsResourceConfig(cmsDeleteParams.resource)) {
        const guard = await requirePermission("cms", cmsDeleteParams.resource, "delete");
        if (guard) return guard;
        const result = await submitCmsDelete(env, cmsDeleteParams.resource, cmsDeleteParams.id);

        await logAudit(env, {
          adminId: admin.id, tenantId: null, endpoint: path, method,
          resource: `lummet_cms_${cmsDeleteParams.resource}`, resourceId: cmsDeleteParams.id, action: "delete",
          success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
          errorMessage: result.ok ? null : result.error, requestId, ipHash
        });

        return json({ success: result.ok, error: result.ok ? undefined : result.error });
      }

      // ---------------------------------------------
      // Platform — Lummet admin management (Phase 10, super-admin only)
      // ---------------------------------------------

      if (method === "GET" && path === "/platform/admins") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderAdminsList(env, admin, readFlash(url)));
      }

      if (path === "/platform/admins/new") {
        const guard = requireSuperAdmin();
        if (guard) return guard;

        if (method === "GET") return html(await renderNewAdminForm(env, admin, null));

        if (method === "POST") {
          const form = await parseForm(request);
          const result = await submitCreateAdmin(env, admin, form);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "lummet_admin", action: "create",
            success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
            errorMessage: result.ok ? `email:${result.email}` : result.error, requestId, ipHash
          });

          if (!result.ok) return html(await renderNewAdminForm(env, admin, describeAuthError(result.error)));
          return html(await renderAdminCreatedPage(env, admin, result.email, result.tempPassword));
        }
      }

      const adminDetailParams = matchPath("/platform/admins/:id", path);
      if (method === "GET" && adminDetailParams) {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderAdminDetail(env, admin, adminDetailParams.id, readFlash(url)));
      }

      if (method === "GET" && path === "/platform/api") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderApiReferencePage(env, admin));
      }

      if (method === "GET" && path === "/platform/credentials") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderCredentialsPage(env, admin));
      }

      if (method === "GET" && path === "/platform/audit-logs") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderAuditLogsPage(env, admin, Object.fromEntries(url.searchParams)));
      }

      if (method === "GET" && path === "/platform/capabilities") {
        const guard = requireSuperAdmin();
        if (guard) return guard;
        return html(await renderCapabilitiesPage(env, admin));
      }

      return html("Not found.", 404);
    } catch (error) {
      if (isApiRoute) return json({ success: false, error: "internal_error" }, 500);
      return html("Something went wrong.", 500);
    }
  },

  // Invoked by the Cron Trigger configured in wrangler.jsonc.
  // ctx.waitUntil keeps the Worker alive until both the health-check
  // sweep and the audit-log retention prune finish, since scheduled
  // handlers otherwise terminate as soon as the function returns.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runHealthChecks(env));
    ctx.waitUntil(pruneOldAuditLogs(env));
  }
};

// -----------------------------------------------------
// /content/* and /system/* routing
// Handles: the special key/value "settings" screen, the
// generic CRUD screens for every resource configured in
// resources.js, and falls back to the placeholder page for
// nav items with no Super API backing yet (permissions,
// components).
// -----------------------------------------------------

async function handleResourceRoutes(request, env, admin, path, method, requestId, ipHash) {
  const sectionMatch = path.match(/^\/(content|system)\//);
  if (!sectionMatch) return null;

  const section = sectionMatch[1];
  const sectionLabel = section === "content" ? "Content" : "System";

  // RBAC (Phase 10) — every Content/System route acts on whichever
  // tenant is currently active, so both "does this admin still have
  // access to that tenant at all" and "does this admin hold the
  // specific resource/action grant" are checked before anything else.
  const forbiddenHtml = () =>
    html(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;">
      <h1>403 — Forbidden</h1><p>You don't have access to this. Ask a super admin to grant it.</p>
      <a href="/">Back to dashboard</a></body></html>`, 403);
  const forbiddenJson = () => json({ success: false, error: "forbidden" }, 403);

  if (!(await canAccessTenant(env, admin, admin.activeTenantId))) {
    return method === "POST" && path.endsWith("/delete") ? forbiddenJson() : forbiddenHtml();
  }

  async function checkResourcePermission(resourceKey, action, isJsonRoute) {
    const allowed = await hasPermission(env, admin, "tenant", resourceKey, action);
    if (allowed) return null;
    return isJsonRoute ? forbiddenJson() : forbiddenHtml();
  }

  if (section === "system") {
    if (method === "GET" && path === "/system/settings") {
      const guard = await checkResourcePermission("settings", "read", false);
      if (guard) return guard;
      return html(await renderSettingsPage(env, admin, readFlash(new URL(request.url))));
    }

    if (method === "POST" && path === "/system/settings") {
      const guard = await checkResourcePermission("settings", "update", false);
      if (guard) return guard;
      const form = await parseForm(request);
      const result = await submitSettings(env, admin, form);

      await logAudit(env, {
        adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
        resource: "settings", action: "update",
        success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
        errorMessage: result.ok ? null : result.message || result.error || result.reason,
        requestId, ipHash
      });

      const flashParam = result.ok
        ? "flash=Settings+saved&flash_type=success"
        : `flash=${encodeURIComponent(result.message || "Could not save settings")}&flash_type=error`;

      return redirect(`/system/settings?${flashParam}`);
    }

    if (method === "GET" && path === "/system/media/new") {
      const guard = await checkResourcePermission("media", "create", false);
      if (guard) return guard;
      return html(await renderMediaUploadForm(env, admin));
    }

    if (method === "GET" && path === "/system/permissions") {
      const guard = await checkResourcePermission("users", "read", false);
      if (guard) return guard;
      return html(await renderPermissionsMatrix(env, admin));
    }

    const itemAccessParams = matchPath("/system/users/:id/item-access", path);
    if (method === "GET" && itemAccessParams) {
      const guard = await checkResourcePermission("users", "read", false);
      if (guard) return guard;
      return html(await renderUserItemAccess(env, admin, itemAccessParams.id));
    }
  }

  if (section === "content") {
    const reviewBlocksParams = matchPath("/content/reviews/:slug/blocks", path);
    if (method === "GET" && reviewBlocksParams) {
      const guard = await checkResourcePermission("reviews", "read", false);
      if (guard) return guard;
      return html(await renderReviewBlocksPage(env, admin, reviewBlocksParams.slug));
    }
  }

  const newParams = matchPath(`/${section}/:resource/new`, path);
  const editParams = matchPath(`/${section}/:resource/:id/edit`, path);
  const deleteParams = matchPath(`/${section}/:resource/:id/delete`, path);
  const listParams = matchPath(`/${section}/:resource`, path);

  const resourceKey = (newParams || editParams || deleteParams || listParams)?.resource;
  if (!resourceKey) return null;

  const config = getResourceConfig(resourceKey);
  const activeKey = `${section}-${resourceKey}`;

  if (!config || config.section !== sectionLabel) {
    if (method === "GET" && listParams) {
      return html(await renderResourcePlaceholder(env, admin, sectionLabel, resourceKey, activeKey));
    }
    return null;
  }

  const base = `/${section}/${resourceKey}`;

  if (method === "GET" && newParams && config.supportsCreate) {
    const guard = await checkResourcePermission(resourceKey, "create", false);
    if (guard) return guard;
    return html(await renderResourceForm(env, admin, resourceKey, config, null));
  }

  if (method === "POST" && newParams && config.supportsCreate) {
    const guard = await checkResourcePermission(resourceKey, "create", false);
    if (guard) return guard;
    const form = await parseForm(request);
    const result = await submitCreate(env, admin, resourceKey, config, form);

    await logAudit(env, {
      adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
      resource: resourceKey, action: "create",
      success: result.ok, statusCode: result.ok ? 201 : result.status || 400,
      errorMessage: result.ok ? null : result.message || result.error || result.reason,
      requestId, ipHash
    });

    if (!result.ok) {
      return html(
        await renderResourceForm(env, admin, resourceKey, config, null, result.message || "Could not create.")
      );
    }
    return redirect(`${base}?flash=Created&flash_type=success`);
  }

  if (method === "GET" && editParams) {
    const guard = await checkResourcePermission(resourceKey, "read", false);
    if (guard) return guard;
    return html(await renderResourceForm(env, admin, resourceKey, config, editParams.id));
  }

  if (method === "POST" && editParams) {
    const guard = await checkResourcePermission(resourceKey, "update", false);
    if (guard) return guard;
    const form = await parseForm(request);
    const result = await submitUpdate(env, admin, resourceKey, config, editParams.id, form);

    await logAudit(env, {
      adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
      resource: resourceKey, resourceId: editParams.id, action: "update",
      success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
      errorMessage: result.ok ? null : result.message || result.error || result.reason,
      requestId, ipHash
    });

    if (!result.ok) {
      return html(
        await renderResourceForm(env, admin, resourceKey, config, editParams.id, result.message || "Could not save changes.")
      );
    }
    return redirect(`${base}?flash=Saved&flash_type=success`);
  }

  if (method === "POST" && deleteParams && config.supportsDelete) {
    const guard = await checkResourcePermission(resourceKey, "delete", true);
    if (guard) return guard;
    const result = await submitDelete(env, admin, resourceKey, deleteParams.id);

    await logAudit(env, {
      adminId: admin.id, tenantId: admin.activeTenantId, endpoint: path, method,
      resource: resourceKey, resourceId: deleteParams.id, action: "delete",
      success: result.ok, statusCode: result.ok ? 200 : result.status || 400,
      errorMessage: result.ok ? null : result.message || result.error || result.reason,
      requestId, ipHash
    });

    return json(
      { success: result.ok, error: result.ok ? undefined : result.reason || result.error },
      result.ok ? 200 : result.status || 400
    );
  }

  if (method === "GET" && listParams) {
    const guard = await checkResourcePermission(resourceKey, "read", false);
    if (guard) return guard;
    return html(await renderResourceList(env, admin, resourceKey, config, readFlash(new URL(request.url)), new URL(request.url).searchParams));
  }

  return null;
}

function readFlash(url) {
  const message = url.searchParams.get("flash");
  const type = url.searchParams.get("flash_type") === "error" ? "error" : "success";
  return message ? { message, type } : null;
}

function describeAuthError(code) {
  const map = {
    invalid_credentials: "Incorrect email or password.",
    too_many_attempts: "Too many attempts. Try again in 15 minutes.",
    email_and_password_required: "Email and password are required.",
    already_bootstrapped: "An admin account already exists — please log in instead.",
    invalid_email_or_password: "Please provide a valid email and a password of at least 12 characters.",
    email_required: "Email is required.",
    invalid_role: "Please choose a valid role.",
    email_already_registered: "That email is already registered."
  };
  return map[code] || "Something went wrong. Please try again.";
}

function describePasswordError(code) {
  const map = {
    passwords_do_not_match: "The new password and confirmation don't match.",
    password_too_short: "New password must be at least 12 characters.",
    invalid_current_password: "Current password is incorrect.",
    not_found: "Account not found."
  };
  return map[code] || "Could not change password. Please try again.";
}

function describeRegistryError(code) {
  const map = {
    name_and_host_required: "Name and host are required.",
    host_already_registered: "A tenant with this host is already registered.",
    credential_generation_failed: "Could not generate a credential — check that CREDENTIAL_KEK is configured on this Worker."
  };
  return map[code] || "Could not register this tenant.";
}
