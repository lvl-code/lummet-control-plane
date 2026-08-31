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

import { renderLoginPage } from "./views/pages/login.js";
import { renderDashboardHome } from "./views/pages/dashboard.js";
import { renderPublicHomepage, renderPublicStaticPage } from "./views/pages/home.js";
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
import { renderSettingsPage, submitSettings } from "./views/pages/settings.js";
import { runHealthChecks, pruneOldAuditLogs } from "./cron.js";

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
          return html(renderPublicHomepage({ contactEmail: env.CONTACT_EMAIL || null }));
        }
        // Signed in — fall through to the authenticated dashboard route below.
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

      // ===============================================
      // JSON API
      // ===============================================

      if (isApiRoute) {
        // GET /api/tenants
        if (method === "GET" && path === "/api/tenants") {
          const tenants = await registry.listTenants(env);
          return json({ success: true, data: tenants });
        }

        // POST /api/tenants
        if (method === "POST" && path === "/api/tenants") {
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
          const tenant = await registry.getTenant(env, tenantIdParams.id);
          if (!tenant) return json({ success: false, error: "not_found" }, 404);
          const health = await registry.getTenantHealth(env, tenantIdParams.id);
          const capabilities = await registry.getTenantCapabilities(env, tenantIdParams.id);
          return json({ success: true, data: { ...tenant, health, capabilities } });
        }

        if (method === "PUT" && tenantIdParams) {
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
          const capabilities = await registry.getTenantCapabilities(env, capabilitiesParams.id);
          return json({ success: true, data: capabilities });
        }

        if (method === "POST" && switchParams) {
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
          const summary = await runHealthChecks(env);

          await logAudit(env, {
            adminId: admin.id, tenantId: null, endpoint: path, method,
            resource: "tenant_health", action: "health_check_all",
            success: true, statusCode: 200, requestId, ipHash,
            errorMessage: `checked=${summary.checked} online=${summary.online} disabled=${summary.disabled} failed=${summary.failed}`
          });

          return json({ success: true, data: summary });
        }

        return json({ success: false, error: "not_found" }, 404);
      }

      // ===============================================
      // DASHBOARD PAGES (HTML)
      // ===============================================

      if (method === "GET" && path === "/") {
        return html(await renderDashboardHome(env, admin));
      }

      if (method === "GET" && path === "/tenants") {
        return html(await renderTenantsList(env, admin, readFlash(url)));
      }

      if (path === "/tenants/new") {
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
        return html(await renderHealthPage(env, admin));
      }

      if (method === "GET" && path === "/tenants/deployments") {
        return html(await renderDeploymentsPage(env, admin));
      }

      const tenantDetailParams = matchPath("/tenants/:id", path);
      if (method === "GET" && tenantDetailParams) {
        const pageHtml = await renderTenantDetail(env, admin, tenantDetailParams.id, readFlash(url));
        if (!pageHtml) return html("Tenant not found.", 404);
        return html(pageHtml);
      }

      const contentOrSystemCrud = await handleResourceRoutes(request, env, admin, path, method, requestId, ipHash);
      if (contentOrSystemCrud) return contentOrSystemCrud;

      if (method === "GET" && path === "/platform/api") {
        return html(await renderApiReferencePage(env, admin));
      }

      if (method === "GET" && path === "/platform/credentials") {
        return html(await renderCredentialsPage(env, admin));
      }

      if (method === "GET" && path === "/platform/audit-logs") {
        return html(await renderAuditLogsPage(env, admin, Object.fromEntries(url.searchParams)));
      }

      if (method === "GET" && path === "/platform/capabilities") {
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

  if (section === "system") {
    if (method === "GET" && path === "/system/settings") {
      return html(await renderSettingsPage(env, admin, readFlash(new URL(request.url))));
    }

    if (method === "POST" && path === "/system/settings") {
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
    return html(await renderResourceForm(env, admin, resourceKey, config, null));
  }

  if (method === "POST" && newParams && config.supportsCreate) {
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
    return html(await renderResourceForm(env, admin, resourceKey, config, editParams.id));
  }

  if (method === "POST" && editParams) {
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
    return html(await renderResourceList(env, admin, resourceKey, config, readFlash(new URL(request.url))));
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
    invalid_email_or_password: "Please provide a valid email and a password of at least 12 characters."
  };
  return map[code] || "Something went wrong. Please try again.";
}

function describeRegistryError(code) {
  const map = {
    name_and_host_required: "Name and host are required.",
    host_already_registered: "A tenant with this host is already registered.",
    credential_generation_failed: "Could not generate a credential — check that CREDENTIAL_KEK is configured on this Worker."
  };
  return map[code] || "Could not register this tenant.";
}
