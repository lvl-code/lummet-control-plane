// =====================================================
// DASHBOARD SHELL
// Server-rendered HTML shell shared by every Lummet
// dashboard page. Deliberately its own visual identity —
// distinct from the tenant admin UI — per the master
// plan's rule #11 ("visually and structurally separate
// from the normal tenant admin").
// =====================================================

import { isSuperAdmin, loadPermissionMap, listAccessibleTenants } from "../rbac.js";

// Every item below (besides Dashboard/Overview, always visible) can
// declare `area` + `resource` to be gated by rbac.js's permission
// map — a staff admin only ever sees a link if they hold a "read"
// grant on that area/resource; a super admin sees everything.
// Items with no `area` (e.g. Tenants/Platform registry actions) are
// implicitly super-admin-only, since they touch the control plane
// itself rather than a single tenant's or lummet.com's content.
const NAV = [
  {
    section: "Dashboard",
    items: [{ label: "Overview", href: "/", key: "dashboard" }]
  },
  {
    section: "Tenants",
    superAdminOnly: true,
    items: [
      { label: "All Tenants", href: "/tenants", key: "tenants-all" },
      { label: "Add Tenant", href: "/tenants/new", key: "tenants-new" },
      { label: "Health", href: "/tenants/health", key: "tenants-health" },
      { label: "Deployments", href: "/tenants/deployments", key: "tenants-deployments" }
    ]
  },
  {
    section: "Content",
    items: [
      { label: "Casinos", href: "/content/casinos", key: "content-casinos", area: "tenant", resource: "casinos" },
      { label: "Reviews", href: "/content/reviews", key: "content-reviews", area: "tenant", resource: "reviews" },
      { label: "News", href: "/content/news", key: "content-news", area: "tenant", resource: "news" },
      { label: "Updates", href: "/content/updates", key: "content-updates", area: "tenant", resource: "updates" },
      { label: "Pages", href: "/content/pages", key: "content-pages", area: "tenant", resource: "pages" },
      { label: "Categories", href: "/content/categories", key: "content-categories", area: "tenant", resource: "categories" },
      { label: "Countries", href: "/content/countries", key: "content-countries", area: "tenant", resource: "countries" },
      { label: "Country Pages", href: "/content/country-pages", key: "content-country-pages", area: "tenant", resource: "seo_pages" },
      { label: "Category Countries", href: "/content/category-countries", key: "content-category-countries", area: "tenant", resource: "seo_pages" }
    ]
  },
  {
    section: "System",
    items: [
      { label: "Users", href: "/system/users", key: "system-users", area: "tenant", resource: "users" },
      { label: "Permissions", href: "/system/permissions", key: "system-permissions", area: "tenant", resource: "users" },
      { label: "Components", href: "/system/components", key: "system-components", area: "tenant", resource: "components" },
      { label: "Blocks", href: "/system/blocks", key: "system-blocks", area: "tenant", resource: "components" },
      { label: "Navigation", href: "/system/nav-items", key: "system-nav-items", area: "tenant", resource: "settings" },
      { label: "Banners", href: "/system/banners", key: "system-banners", area: "tenant", resource: "banners" },
      { label: "Media", href: "/system/media", key: "system-media", area: "tenant", resource: "media" },
      { label: "Settings", href: "/system/settings", key: "system-settings", area: "tenant", resource: "settings" }
    ]
  },
  {
    section: "Lummet Site",
    items: [
      { label: "Pages", href: "/cms/pages", key: "cms-pages", area: "cms", resource: "pages" },
      { label: "Authors", href: "/cms/authors", key: "cms-authors", area: "cms", resource: "authors" },
      { label: "Brand profiles", href: "/cms/brands", key: "cms-brands", area: "cms", resource: "brands" },
      { label: "Partners", href: "/cms/partners", key: "cms-partners", area: "cms", resource: "partners" },
      { label: "Updates", href: "/cms/updates", key: "cms-updates", area: "cms", resource: "updates" },
      { label: "Publications", href: "/cms/publications", key: "cms-publications", area: "cms", resource: "publications" },
      { label: "Advertisements", href: "/cms/advertisements", key: "cms-advertisements", area: "cms", resource: "advertisements" },
      { label: "Homepage sections", href: "/cms/homepage_sections", key: "cms-homepage-sections", area: "cms", resource: "homepage_sections" },
      { label: "Homepage settings", href: "/cms/settings", key: "cms-site-settings", area: "cms", resource: "site_settings" }
    ]
  },
  {
    section: "Platform",
    superAdminOnly: true,
    items: [
      { label: "Admins", href: "/platform/admins", key: "platform-admins" },
      { label: "API", href: "/platform/api", key: "platform-api" },
      { label: "Credentials", href: "/platform/credentials", key: "platform-credentials" },
      { label: "Audit Logs", href: "/platform/audit-logs", key: "platform-audit-logs" },
      { label: "Capabilities", href: "/platform/capabilities", key: "platform-capabilities" }
    ]
  }
];

const STYLES = `
  :root {
    --bg: #0f1117;
    --panel: #171a23;
    --panel-border: #262a38;
    --text: #e7e9f0;
    --text-dim: #9096ac;
    --accent: #7c6cf6;
    --accent-soft: rgba(124, 108, 246, 0.14);
    --ok: #3ecf8e;
    --warn: #f5a623;
    --danger: #f0526b;
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    min-height: 100vh;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--panel-border);
    padding: 20px 0;
    display: flex;
    flex-direction: column;
  }
  .brand {
    padding: 0 20px 20px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .brand .dot { color: var(--accent); }
  .nav-section { margin-top: 18px; }
  .nav-section h4 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    padding: 0 20px;
    margin: 0 0 6px;
  }
  .nav-section a {
    display: block;
    padding: 7px 20px;
    color: var(--text-dim);
    font-size: 14px;
  }
  .nav-section a:hover { color: var(--text); text-decoration: none; background: var(--accent-soft); }
  .nav-section a.active {
    color: var(--text);
    background: var(--accent-soft);
    border-right: 2px solid var(--accent);
  }

  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar {
    height: 56px;
    border-bottom: 1px solid var(--panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    flex-shrink: 0;
  }
  .topbar .who { font-size: 13px; color: var(--text-dim); }
  .role-badge { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: var(--accent-soft); color: var(--accent); text-transform: uppercase; letter-spacing: 0.03em; }
  .topbar .logout { font-size: 13px; }
  .content { padding: 28px; overflow-y: auto; }

  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: var(--text-dim); font-size: 14px; margin: 0 0 24px; }

  .card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
  }
  .card h2 { font-size: 15px; margin: 0 0 14px; }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .stat { background: var(--panel); border: 1px solid var(--panel-border); border-radius: var(--radius); padding: 16px; }
  .stat .num { font-size: 28px; font-weight: 700; }
  .stat .label { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: var(--text-dim); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--panel-border); }
  td { padding: 10px; border-bottom: 1px solid var(--panel-border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }

  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge-ok { background: rgba(62, 207, 142, 0.14); color: var(--ok); }
  .badge-warn { background: rgba(245, 166, 35, 0.14); color: var(--warn); }
  .badge-danger { background: rgba(240, 82, 107, 0.14); color: var(--danger); }
  .badge-dim { background: rgba(144, 150, 172, 0.14); color: var(--text-dim); }

  .btn {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 7px;
    padding: 9px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:hover { opacity: 0.9; text-decoration: none; }
  .btn-secondary { background: transparent; border: 1px solid var(--panel-border); color: var(--text); }
  .btn-danger { background: var(--danger); }
  .btn-small { padding: 5px 10px; font-size: 12px; }

  input, textarea, select {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--panel-border);
    border-radius: 7px;
    padding: 9px 12px;
    color: var(--text);
    font-size: 14px;
    margin-bottom: 14px;
  }
  label { display: block; font-size: 13px; color: var(--text-dim); margin-bottom: 6px; }

  .empty { color: var(--text-dim); font-size: 14px; padding: 24px 0; text-align: center; }
  .flash { padding: 12px 16px; border-radius: var(--radius); margin-bottom: 20px; font-size: 14px; }
  .flash-error { background: rgba(240, 82, 107, 0.1); border: 1px solid rgba(240, 82, 107, 0.3); color: #ff8fa3; }
  .flash-success { background: rgba(62, 207, 142, 0.1); border: 1px solid rgba(62, 207, 142, 0.3); color: var(--ok); }
  .mono { font-family: "SF Mono", Consolas, monospace; font-size: 13px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }

  .rte-toolbar { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
  .rte-toolbar button {
    background: var(--bg); border: 1px solid var(--panel-border); color: var(--text);
    border-radius: 5px; padding: 5px 9px; font-size: 12px; cursor: pointer;
  }
  .rte-toolbar button:hover { background: var(--accent-soft); }
  .rte-editor {
    min-height: 180px; max-height: 480px; overflow-y: auto;
    background: var(--bg); border: 1px solid var(--panel-border); border-radius: 7px;
    padding: 12px 14px; margin-bottom: 14px; font-size: 14px; line-height: 1.6;
  }
  .rte-editor:focus { outline: none; border-color: var(--accent); }
  .rte-editor h2, .rte-editor h3 { margin: 0.6em 0 0.3em; }
  .rte-editor blockquote { border-left: 3px solid var(--accent); margin: 0.6em 0; padding-left: 12px; color: var(--text-dim); }
  .rte-editor ul, .rte-editor ol { padding-left: 22px; }

  .media-field .media-preview { margin-bottom: 8px; }
  .media-picker-panel { background: var(--bg); }
`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/**
 * Filters NAV down to what this admin may actually use, then
 * renders it. `permMap` is the output of rbac.js's
 * loadPermissionMap() — `null` means "super admin, allow
 * everything" (see rbac.js), matching the tenant's own `admin`
 * role bypassing its permissions table.
 */
function renderNav(activeKey, permMap, isSuper) {
  return NAV.map((section) => {
    if (section.superAdminOnly && !isSuper) return null;

    const visibleItems = section.items.filter((item) => {
      if (!item.area) return true; // e.g. Dashboard/Overview — always visible
      if (permMap === null) return true; // super admin sentinel
      return !!permMap?.[item.area]?.[item.resource]?.read;
    });
    if (visibleItems.length === 0) return null;

    return `
      <div class="nav-section">
        <h4>${escapeHtml(section.section)}</h4>
        ${visibleItems
          .map(
            (item) => `<a href="${item.href}" class="${item.key === activeKey ? "active" : ""}">${escapeHtml(item.label)}</a>`
          )
          .join("")}
      </div>`;
  }).filter(Boolean).join("");
}

async function getSwitcherTenants(env) {
  const result = await env.LUMMET_DB.prepare(
    `SELECT id, name, status FROM tenants ORDER BY name`
  ).all();
  return result.results || [];
}

function renderTenantSwitcher(tenants, activeTenantId) {
  const options = [`<option value="">— none —</option>`]
    .concat(
      tenants.map(
        (t) =>
          `<option value="${escapeHtml(t.id)}" ${t.id === activeTenantId ? "selected" : ""}>${escapeHtml(t.name)}${t.status !== "active" ? " (disabled)" : ""}</option>`
      )
    )
    .join("");

  return `
    <div class="switcher">
      <label for="tenant-switcher">Active tenant</label>
      <select id="tenant-switcher" onchange="lummetSwitchTenant(this.value)">
        ${options}
      </select>
    </div>`;
}

/**
 * Full page shell: sidebar + topbar (with tenant switcher) +
 * content. Use for every authenticated dashboard page. Pass `env`
 * so the switcher can list registered tenants; omit it only for
 * pages rendered without D1 access (there currently are none).
 */
export async function renderShell({ title, activeKey, admin, bodyHtml, env }) {
  const allTenants = env ? await getSwitcherTenants(env) : [];
  const isSuper = isSuperAdmin(admin);
  const permMap = env && admin ? await loadPermissionMap(env, admin) : null;
  const tenants = env && admin ? await listAccessibleTenants(env, admin, allTenants) : allTenants;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Lummet</title>
  <style>
    ${STYLES}
    .switcher { display: flex; align-items: center; gap: 8px; }
    .switcher label { margin: 0; white-space: nowrap; }
    .switcher select { width: auto; min-width: 180px; margin: 0; }
    .topbar-right { display: flex; align-items: center; gap: 18px; }
  </style>
</head>
<body>
  <nav class="sidebar">
    <div class="brand"><span class="dot">●</span> Lummet</div>
    ${renderNav(activeKey, permMap, isSuper)}
  </nav>
  <div class="main">
    <div class="topbar">
      ${admin ? renderTenantSwitcher(tenants, admin.activeTenantId) : "<div></div>"}
      <div class="topbar-right">
        <div class="who">${admin ? escapeHtml(admin.email) : ""}${admin ? ` <span class="role-badge">${escapeHtml(isSuper ? "super admin" : "staff")}</span>` : ""}</div>
        ${admin ? `<a class="logout" href="/account/password">Change password</a>` : ""}
        ${admin ? `<a class="logout" href="#" onclick="fetch('/api/auth/logout',{method:'POST'}).then(()=>location.href='/login');return false;">Log out</a>` : ""}
      </div>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
  </div>
  <script>
    function lummetSwitchTenant(id) {
      const url = id ? ('/api/tenants/' + id + '/switch') : '/api/session/active-tenant';
      const method = id ? 'POST' : 'DELETE';
      fetch(url, { method })
        .then(r => r.json())
        .then(data => {
          if (data.success) { location.reload(); }
          else { alert('Could not switch tenant: ' + (data.error || 'unknown error')); }
        })
        .catch(() => alert('Could not switch tenant.'));
    }
  </script>
</body>
</html>`;
}

/**
 * Minimal unauthenticated page shell (login/bootstrap) — no
 * sidebar, since there's no admin session yet.
 */
export function renderAuthShell({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Lummet</title>
  <style>
    ${STYLES}
    body { align-items: center; justify-content: center; }
    .auth-card { width: 380px; }
    .brand-lg { font-size: 26px; font-weight: 700; margin-bottom: 4px; text-align: center; }
    .brand-lg .dot { color: var(--accent); }
    .auth-subtitle { text-align: center; color: var(--text-dim); font-size: 14px; margin-bottom: 24px; }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="brand-lg"><span class="dot">●</span> Lummet</div>
    <div class="auth-subtitle">Central control plane</div>
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

export { escapeHtml };
