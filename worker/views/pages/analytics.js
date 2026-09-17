// =====================================================
// ANALYTICS
// Wraps en/worker/super/handlers-analytics.js's three read-only
// endpoints: analytics-overview (dimension performance),
// analytics-revenue (daily revenue/commission time series), and
// tracking-health (link status counts). Deliberately read-only --
// that handler file's own header explains these are TENANT-WIDE
// pre-aggregated numbers (analytics_daily), never raw events, and
// report_definitions/report_runs are handled by reports.js instead.
//
// Query-string driven (?start_date=&end_date=&dimension_type=&
// currency=) rather than a JS-fetch page, same convention as
// audit-logs.js's renderAuditLogsPage(env, admin, query) -- a normal
// GET form resubmit, no client-side state to manage.
// =====================================================

import { renderShell, escapeHtml } from "../layout.js";
import { getFromTenant } from "../../client.js";
import { getTenant } from "../../registry.js";

const BASE_PATH = "/en/api/super";
const DIMENSION_TYPES = [
  "casino", "offer", "tracking_link", "partner", "program",
  "account", "campaign", "review", "news", "page"
];

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export async function renderAnalyticsPage(env, admin, query = {}) {
  const activeKey = "content-analytics";
  const title = "Analytics";

  if (!admin.activeTenantId) {
    const body = `<h1>${title}</h1><div class="card"><p style="font-size:14px;">No active tenant is selected. Use the switcher at the top of the page to pick one.</p></div>`;
    return renderShell({ title, activeKey, admin, bodyHtml: body, env });
  }
  const tenant = await getTenant(env, admin.activeTenantId);
  if (!tenant) {
    const body = `<h1>${title}</h1><div class="card"><p>Active tenant no longer exists.</p></div>`;
    return renderShell({ title, activeKey, admin, bodyHtml: body, env });
  }

  const defaults = defaultDateRange();
  const startDate = query.start_date || defaults.startDate;
  const endDate = query.end_date || defaults.endDate;
  const dimensionType = query.dimension_type || "casino";
  const currency = query.currency || "USD";

  const [overviewResult, revenueResult, healthResult] = await Promise.all([
    getFromTenant(env, tenant, `${BASE_PATH}/analytics-overview?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&dimension_type=${encodeURIComponent(dimensionType)}&currency=${encodeURIComponent(currency)}`),
    getFromTenant(env, tenant, `${BASE_PATH}/analytics-revenue?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&currency=${encodeURIComponent(currency)}`),
    getFromTenant(env, tenant, `${BASE_PATH}/tracking-health`)
  ]);

  const filterBar = `
    <form class="card" method="GET" action="/content/analytics" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
      <label>Start date<input type="date" name="start_date" value="${escapeHtml(startDate)}" /></label>
      <label>End date<input type="date" name="end_date" value="${escapeHtml(endDate)}" /></label>
      <label>Dimension
        <select name="dimension_type">
          ${DIMENSION_TYPES.map((d) => `<option value="${d}" ${d === dimensionType ? "selected" : ""}>${d}</option>`).join("")}
        </select>
      </label>
      <label>Currency<input type="text" name="currency" value="${escapeHtml(currency)}" style="width:80px;" /></label>
      <button type="submit" class="btn btn-small">Apply</button>
    </form>`;

  let overviewHtml;
  if (!overviewResult.ok) {
    overviewHtml = `<div class="flash flash-error"><strong>${escapeHtml(String(overviewResult.status))}</strong> — ${escapeHtml(overviewResult.message || "Could not load overview.")}</div>`;
  } else {
    const rows = overviewResult.data.rows || [];
    overviewHtml = rows.length ? `
      <table class="table">
        <thead><tr>${Object.keys(rows[0]).map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${Object.values(r).map((v) => `<td>${escapeHtml(v ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>` : `<p class="empty">No data for that range/dimension.</p>`;
  }

  let revenueHtml;
  if (!revenueResult.ok) {
    revenueHtml = `<div class="flash flash-error"><strong>${escapeHtml(String(revenueResult.status))}</strong> — ${escapeHtml(revenueResult.message || "Could not load revenue.")}</div>`;
  } else {
    const series = revenueResult.data.series || [];
    revenueHtml = series.length ? `
      <table class="table">
        <thead><tr>${Object.keys(series[0]).map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr></thead>
        <tbody>${series.map((r) => `<tr>${Object.values(r).map((v) => `<td>${escapeHtml(v ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>` : `<p class="empty">No revenue data for that range/currency.</p>`;
  }

  let healthHtml;
  if (!healthResult.ok) {
    healthHtml = `<div class="flash flash-error"><strong>${escapeHtml(String(healthResult.status))}</strong> — ${escapeHtml(healthResult.message || "Could not load tracking health.")}</div>`;
  } else {
    const counts = healthResult.data.counts || {};
    const unhealthy = healthResult.data.unhealthy_links || [];
    healthHtml = `
      <p>${Object.entries(counts).map(([status, count]) => `<strong>${escapeHtml(count)}</strong> ${escapeHtml(status)}`).join(" &nbsp;·&nbsp; ") || "No tracking links yet."}</p>
      ${unhealthy.length ? `
      <table class="table">
        <thead><tr><th>Link</th><th>Status</th></tr></thead>
        <tbody>${unhealthy.map((l) => `<tr><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.status)}</td></tr>`).join("")}</tbody>
      </table>` : ""}`;
  }

  const body = `
    <h1>${title}</h1>
    <p class="subtitle">Content · Analytics on <strong>${escapeHtml(tenant.name)}</strong></p>
    ${filterBar}

    <div class="card">
      <h3 style="margin-top:0;">Performance by ${escapeHtml(dimensionType)}</h3>
      ${overviewHtml}
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Revenue — ${escapeHtml(currency)}</h3>
      ${revenueHtml}
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Tracking link health</h3>
      ${healthHtml}
    </div>
  `;

  return renderShell({ title, activeKey, admin, bodyHtml: body, env });
}
