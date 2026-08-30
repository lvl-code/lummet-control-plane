import { renderShell, escapeHtml } from "../layout.js";
import { getFromTenant, postToTenant, putToTenant, deleteFromTenant, messageForStatus } from "../../client.js";
import { getTenant, getTenantCapabilities } from "../../registry.js";

const BASE_PATH = "/en/api/super";

function nav(resourceKey, config) {
  return config.section === "System" ? `system-${resourceKey}` : `content-${resourceKey}`;
}

function basePagePath(resourceKey, config) {
  return config.section === "System" ? `/system/${resourceKey}` : `/content/${resourceKey}`;
}

function formatCell(value, columnType) {
  if (columnType === "bool") {
    return value ? '<span class="badge badge-ok">Yes</span>' : '<span class="badge badge-dim">No</span>';
  }
  if (value == null || value === "") return '<span style="color:var(--text-dim);">—</span>';
  return escapeHtml(String(value));
}

async function resolveActiveTenant(env, admin) {
  if (!admin.activeTenantId) return { tenant: null, capabilityDisabled: false };
  const tenant = await getTenant(env, admin.activeTenantId);
  if (!tenant) return { tenant: null, capabilityDisabled: false };
  return { tenant, capabilityDisabled: false };
}

async function isCapabilityDisabled(env, tenantId, resourceKey) {
  const capabilities = await getTenantCapabilities(env, tenantId);
  if (capabilities.length === 0) return false; // not tested yet — don't block optimistically
  const row = capabilities.find((c) => c.capability === resourceKey);
  return row ? row.enabled === 0 : false;
}

function noActiveTenantNotice(env, admin, config, activeKey) {
  const body = `
    <h1>${escapeHtml(config.label)}</h1>
    <p class="subtitle">${escapeHtml(config.section)} · ${escapeHtml(config.label)}</p>
    <div class="card">
      <p style="font-size:14px;">No active tenant is selected. Use the switcher at the top of the page to pick one.</p>
      <a class="btn" href="/tenants">View tenants</a>
    </div>
  `;
  return renderShell({ title: config.label, activeKey, admin, bodyHtml: body, env });
}

function capabilityDisabledNotice(env, admin, config, tenant, activeKey) {
  const body = `
    <h1>${escapeHtml(config.label)}</h1>
    <p class="subtitle">${escapeHtml(config.section)} · ${escapeHtml(config.label)}</p>
    <div class="card">
      <p style="font-size:14px;"><strong>${escapeHtml(tenant.name)}</strong> reports that it does not support this resource (its Super API capability manifest marks <span class="mono">${escapeHtml(config.label.toLowerCase())}</span> as disabled).</p>
    </div>
  `;
  return renderShell({ title: config.label, activeKey, admin, bodyHtml: body, env });
}

function errorNotice(env, admin, config, tenant, activeKey, result) {
  const body = `
    <h1>${escapeHtml(config.label)}</h1>
    <p class="subtitle">${escapeHtml(config.section)} · ${escapeHtml(config.label)} on ${escapeHtml(tenant.name)}</p>
    <div class="flash flash-error">
      <strong>${escapeHtml(String(result.status))}</strong> — ${escapeHtml(result.message || messageForStatus(result.status))}
    </div>
    <div class="card"><a class="btn btn-secondary" href="/tenants/${encodeURIComponent(tenant.id)}">View tenant</a></div>
  `;
  return renderShell({ title: config.label, activeKey, admin, bodyHtml: body, env });
}

// -----------------------------------------------------
// LIST
// -----------------------------------------------------

export async function renderResourceList(env, admin, resourceKey, config, flash) {
  const activeKey = nav(resourceKey, config);
  const { tenant } = await resolveActiveTenant(env, admin);

  if (!tenant) return noActiveTenantNotice(env, admin, config, activeKey);

  if (await isCapabilityDisabled(env, tenant.id, resourceKey)) {
    return capabilityDisabledNotice(env, admin, config, tenant, activeKey);
  }

  const result = await getFromTenant(env, tenant, `${BASE_PATH}/${resourceKey}`);
  if (!result.ok) return errorNotice(env, admin, config, tenant, activeKey, result);

  const rows = result.data.data || [];
  const base = basePagePath(resourceKey, config);

  const flashHtml = flash
    ? `<div class="flash ${flash.type === "error" ? "flash-error" : "flash-success"}">${escapeHtml(flash.message)}</div>`
    : "";

  const body = `
    <h1>${escapeHtml(config.label)}</h1>
    <p class="subtitle">${escapeHtml(config.section)} · ${escapeHtml(config.label)} on <strong>${escapeHtml(tenant.name)}</strong></p>
    ${flashHtml}
    <div class="card">
      ${
        config.supportsCreate
          ? `<div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><a class="btn" href="${base}/new">New</a></div>`
          : ""
      }
      ${
        rows.length === 0
          ? `<div class="empty">Nothing here yet.</div>`
          : `<table>
              <thead><tr>${config.listColumns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}<th></th></tr></thead>
              <tbody>
                ${rows
                  .map((row) => {
                    const id = row[config.idField];
                    return `<tr>
                      ${config.listColumns.map((c) => `<td>${formatCell(row[c.key], c.type)}</td>`).join("")}
                      <td>
                        <a href="${base}/${encodeURIComponent(id)}/edit">${config.roleOnly ? "Edit role" : "Edit"}</a>
                        ${
                          config.supportsDelete
                            ? ` &nbsp;·&nbsp; <a href="#" onclick="if(confirm('Delete this ${escapeHtml(config.label.toLowerCase().replace(/s$/, ""))}?')) lummetDelete('${base}/${encodeURIComponent(id)}/delete'); return false;">Delete</a>`
                            : ""
                        }
                      </td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`
      }
    </div>

    <script>
      function lummetDelete(path) {
        fetch(path, { method: 'POST' })
          .then(r => r.json())
          .then(data => {
            if (data.success) location.reload();
            else alert('Delete failed: ' + (data.error || 'unknown error'));
          })
          .catch(() => alert('Delete failed.'));
      }
    </script>
  `;

  return renderShell({ title: config.label, activeKey, admin, bodyHtml: body, env });
}

// -----------------------------------------------------
// CREATE / EDIT FORM
// -----------------------------------------------------

function renderField(field, record) {
  const value = record ? record[field.name] : "";
  const disabled = field.lockOnEdit && record ? "disabled" : "";
  const hiddenForLocked = field.lockOnEdit && record
    ? `<input type="hidden" name="${escapeHtml(field.name)}" value="${escapeHtml(value)}" />`
    : "";

  if (field.type === "textarea") {
    return `
      <label for="${field.name}">${escapeHtml(field.label)}</label>
      <textarea id="${field.name}" name="${field.name}" rows="4" ${field.required ? "required" : ""}>${escapeHtml(value)}</textarea>`;
  }

  if (field.type === "checkbox") {
    const checked = value === 1 || value === true || value === "1" ? "checked" : "";
    return `
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="${field.name}" name="${field.name}" value="1" style="width:auto;margin:0;" ${checked} />
        ${escapeHtml(field.label)}
      </label>`;
  }

  if (field.type === "select") {
    const options = (field.options || [])
      .map((opt) => `<option value="${escapeHtml(opt)}" ${value === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`)
      .join("");
    return `
      <label for="${field.name}">${escapeHtml(field.label)}</label>
      <select id="${field.name}" name="${field.name}">${options}</select>`;
  }

  return `
    <label for="${field.name}">${escapeHtml(field.label)}</label>
    ${hiddenForLocked}
    <input type="${field.type === "number" ? "number" : "text"}" ${field.step ? `step="${field.step}"` : ""}
      id="${field.name}" name="${field.name}" value="${escapeHtml(value)}"
      ${field.required ? "required" : ""} ${disabled} />`;
}

export async function renderResourceForm(env, admin, resourceKey, config, id, formError) {
  const activeKey = nav(resourceKey, config);
  const { tenant } = await resolveActiveTenant(env, admin);

  if (!tenant) return noActiveTenantNotice(env, admin, config, activeKey);

  let record = null;
  if (id) {
    const result = await getFromTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`);
    if (!result.ok) return errorNotice(env, admin, config, tenant, activeKey, result);
    record = result.data.data;
  }

  const base = basePagePath(resourceKey, config);
  const isEdit = !!id;
  const flashHtml = formError ? `<div class="flash flash-error">${escapeHtml(formError)}</div>` : "";

  const body = `
    <h1>${isEdit ? `Edit ${escapeHtml(config.label.replace(/s$/, ""))}` : `New ${escapeHtml(config.label.replace(/s$/, ""))}`}</h1>
    <p class="subtitle">on <strong>${escapeHtml(tenant.name)}</strong></p>
    ${flashHtml}
    <div class="card" style="max-width:640px;">
      <form method="POST" action="${isEdit ? `${base}/${encodeURIComponent(id)}/edit` : `${base}/new`}">
        ${config.fields.map((f) => renderField(f, record)).join("")}
        <button class="btn" type="submit">${isEdit ? "Save changes" : "Create"}</button>
        <a class="btn btn-secondary" href="${base}">Cancel</a>
      </form>
    </div>
  `;

  return renderShell({ title: isEdit ? `Edit ${config.label}` : `New ${config.label}`, activeKey, admin, bodyHtml: body, env });
}

// -----------------------------------------------------
// SUBMIT HANDLERS (called from index.js)
// -----------------------------------------------------

function coerceFormValues(config, form) {
  const body = {};
  for (const field of config.fields) {
    if (field.type === "checkbox") {
      body[field.name] = form[field.name] === "1";
    } else if (field.type === "number") {
      body[field.name] = form[field.name] === "" || form[field.name] == null ? null : Number(form[field.name]);
    } else {
      body[field.name] = form[field.name] ?? "";
    }
  }
  return body;
}

export async function submitCreate(env, admin, resourceKey, config, form) {
  const { tenant } = await resolveActiveTenant(env, admin);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  const body = coerceFormValues(config, form);
  const result = await postToTenant(env, tenant, `${BASE_PATH}/${resourceKey}`, body);
  return result;
}

export async function submitUpdate(env, admin, resourceKey, config, id, form) {
  const { tenant } = await resolveActiveTenant(env, admin);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  const body = config.roleOnly ? { role: form.role } : coerceFormValues(config, form);
  const result = await putToTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`, body);
  return result;
}

export async function submitDelete(env, admin, resourceKey, id) {
  const { tenant } = await resolveActiveTenant(env, admin);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  return deleteFromTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`);
}

export { resolveActiveTenant };
