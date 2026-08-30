import { renderShell, escapeHtml } from "../layout.js";
import { getFromTenant, putToTenant, messageForStatus } from "../../client.js";
import { getTenant } from "../../registry.js";

const BASE_PATH = "/en/api/super/settings";

export async function renderSettingsPage(env, admin, flash) {
  if (!admin.activeTenantId) {
    const body = `
      <h1>Settings</h1>
      <p class="subtitle">System · Settings</p>
      <div class="card"><p style="font-size:14px;">No active tenant is selected. Use the switcher at the top of the page to pick one.</p></div>
    `;
    return renderShell({ title: "Settings", activeKey: "system-settings", admin, bodyHtml: body, env });
  }

  const tenant = await getTenant(env, admin.activeTenantId);
  if (!tenant) {
    const body = `<h1>Settings</h1><div class="card"><p>Active tenant no longer exists.</p></div>`;
    return renderShell({ title: "Settings", activeKey: "system-settings", admin, bodyHtml: body, env });
  }

  const result = await getFromTenant(env, tenant, BASE_PATH);

  const flashHtml = flash
    ? `<div class="flash ${flash.type === "error" ? "flash-error" : "flash-success"}">${escapeHtml(flash.message)}</div>`
    : "";

  if (!result.ok) {
    const body = `
      <h1>Settings</h1>
      <p class="subtitle">System · Settings on <strong>${escapeHtml(tenant.name)}</strong></p>
      <div class="flash flash-error"><strong>${escapeHtml(String(result.status))}</strong> — ${escapeHtml(result.message || messageForStatus(result.status))}</div>
    `;
    return renderShell({ title: "Settings", activeKey: "system-settings", admin, bodyHtml: body, env });
  }

  const settings = result.data.data || {};
  const entries = Object.entries(settings);

  const rowsHtml = entries
    .map(
      ([key, value], i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
          <input type="text" name="key_${i}" value="${escapeHtml(key)}" style="max-width:220px;margin:0;" readonly />
          <input type="text" name="value_${i}" value="${escapeHtml(value)}" style="margin:0;" />
        </div>`
    )
    .join("");

  const body = `
    <h1>Settings</h1>
    <p class="subtitle">System · Settings on <strong>${escapeHtml(tenant.name)}</strong></p>
    ${flashHtml}
    <div class="card" style="max-width:640px;">
      <p style="color:var(--text-dim);font-size:13px;margin-top:0;">
        Only safe configuration keys are exposed here — anything that looks like a secret,
        password, credential, or token is filtered out by the tenant's Super API and never
        readable or writable through this screen.
      </p>
      <form method="POST" action="/system/settings">
        <input type="hidden" name="existing_count" value="${entries.length}" />
        ${rowsHtml || '<p style="color:var(--text-dim);font-size:13px;">No settings found on this tenant yet.</p>'}

        <div style="border-top:1px solid var(--panel-border);margin:18px 0;padding-top:14px;">
          <label>Add a new key</label>
          <div style="display:flex;gap:10px;">
            <input type="text" name="new_key" placeholder="setting_key" style="max-width:220px;" />
            <input type="text" name="new_value" placeholder="value" />
          </div>
        </div>

        <button class="btn" type="submit">Save settings</button>
      </form>
    </div>
  `;

  return renderShell({ title: "Settings", activeKey: "system-settings", admin, bodyHtml: body, env });
}

export async function submitSettings(env, admin, form) {
  if (!admin.activeTenantId) return { ok: false, error: "no_active_tenant" };

  const tenant = await getTenant(env, admin.activeTenantId);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  const count = Number(form.existing_count || 0);
  const payload = {};

  for (let i = 0; i < count; i++) {
    const key = form[`key_${i}`];
    const value = form[`value_${i}`];
    if (key) payload[key] = value ?? "";
  }

  if (form.new_key) {
    payload[form.new_key] = form.new_value ?? "";
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, status: 422, message: "Nothing to save." };
  }

  return putToTenant(env, tenant, BASE_PATH, payload);
}
