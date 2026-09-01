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
          : resourceKey === "media"
            ? `<div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><a class="btn" href="${base}/new">Upload</a></div>`
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
  const rawStoredValue = record ? record[field.name] : null;
  const value = record ? record[field.name] : "";
  const disabled = field.lockOnEdit && record ? "disabled" : "";
  const hiddenForLocked = field.lockOnEdit && record
    ? `<input type="hidden" name="${escapeHtml(field.name)}" value="${escapeHtml(value)}" />`
    : "";

  if (field.type === "list") {
    // Stored as a real array (e.g. reviews.pros, casinos.features).
    // Displayed one item per line, matching the tenant's own admin
    // UI exactly (en/static/js/admin.js splits/joins on "\n").
    const displayValue = Array.isArray(rawStoredValue) ? rawStoredValue.join("\n") : "";
    return `
      <label for="${field.name}">${escapeHtml(field.label)}${field.hint ? ` <span style="color:var(--text-dim);font-weight:400;">— ${escapeHtml(field.hint)}</span>` : ""}</label>
      <textarea id="${field.name}" name="${field.name}" rows="4" placeholder="One per line">${escapeHtml(displayValue)}</textarea>`;
  }

  if (field.type === "json_object") {
    // Stored as a real object/array (e.g. pages.content_json) — the
    // DB layer JSON.stringify()s it itself, so we pretty-print for
    // editing and parse back before sending (see coerceFieldValue).
    const displayValue =
      rawStoredValue && typeof rawStoredValue === "object"
        ? JSON.stringify(rawStoredValue, null, 2)
        : typeof rawStoredValue === "string" && rawStoredValue
          ? rawStoredValue
          : "";
    return `
      <label for="${field.name}">${escapeHtml(field.label)} <span style="color:var(--text-dim);font-weight:400;">— JSON</span></label>
      <textarea id="${field.name}" name="${field.name}" rows="8" class="mono" data-json-field="1">${escapeHtml(displayValue)}</textarea>
      <div class="json-error" style="display:none;color:var(--danger);font-size:12px;margin:-10px 0 14px;"></div>`;
  }

  if (field.type === "json_raw") {
    // Stored AS the raw JSON string itself (e.g. reviews.faq_json) —
    // the DB layer does not re-encode it, so what's typed here is
    // sent verbatim (only validated for parseability).
    const displayValue = typeof rawStoredValue === "string" ? rawStoredValue : "[]";
    return `
      <label for="${field.name}">${escapeHtml(field.label)} <span style="color:var(--text-dim);font-weight:400;">— JSON</span></label>
      <textarea id="${field.name}" name="${field.name}" rows="6" class="mono" data-json-field="1">${escapeHtml(displayValue)}</textarea>
      <div class="json-error" style="display:none;color:var(--danger);font-size:12px;margin:-10px 0 14px;"></div>`;
  }

  if (field.type === "richtext") {
    const html = typeof rawStoredValue === "string" ? rawStoredValue : "";
    return renderRichTextField(field, html);
  }

  if (field.type === "media") {
    return renderMediaPickerField(field, rawStoredValue);
  }

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

// -----------------------------------------------------
// Rich text editor — a minimal, self-contained contenteditable
// editor with no external/CDN dependency. Its output is a plain
// HTML string synced into a hidden textarea on every input, which
// is what actually gets submitted — matching what the tenant's own
// `content` columns store (see en/static/js/admin.js: `content:
// formData.get("content") || ""`, sent as raw HTML, never escaped
// or JSON-encoded).
// -----------------------------------------------------

let richTextInstanceCounter = 0;

function renderRichTextField(field, html) {
  const instanceId = `rte_${field.name}_${richTextInstanceCounter++}`;
  return `
    <label for="${instanceId}_editor">${escapeHtml(field.label)}</label>
    <div class="rte-toolbar" id="${instanceId}_toolbar">
      <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
      <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
      <button type="button" data-cmd="formatBlock" data-arg="H2" title="Heading 2">H2</button>
      <button type="button" data-cmd="formatBlock" data-arg="H3" title="Heading 3">H3</button>
      <button type="button" data-cmd="formatBlock" data-arg="P" title="Paragraph">¶</button>
      <button type="button" data-cmd="insertUnorderedList" title="Bullet list">• List</button>
      <button type="button" data-cmd="insertOrderedList" title="Numbered list">1. List</button>
      <button type="button" data-cmd="formatBlock" data-arg="BLOCKQUOTE" title="Quote">"</button>
      <button type="button" data-cmd="createLink" data-prompt="1" title="Link">Link</button>
      <button type="button" data-cmd="unlink" title="Remove link">Unlink</button>
      <button type="button" data-toggle-source="1" title="Toggle HTML source">&lt;/&gt;</button>
    </div>
    <div class="rte-editor" id="${instanceId}_editor" contenteditable="true">${html}</div>
    <textarea id="${instanceId}_source" style="display:none;font-family:monospace;" rows="10">${escapeHtml(html)}</textarea>
    <textarea name="${field.name}" id="${instanceId}_hidden" style="display:none;">${escapeHtml(html)}</textarea>
    <script>
      (function() {
        const editor = document.getElementById("${instanceId}_editor");
        const hidden = document.getElementById("${instanceId}_hidden");
        const source = document.getElementById("${instanceId}_source");
        const toolbar = document.getElementById("${instanceId}_toolbar");
        let sourceMode = false;

        function sync() {
          hidden.value = sourceMode ? source.value : editor.innerHTML;
        }

        editor.addEventListener("input", sync);
        source.addEventListener("input", sync);

        toolbar.addEventListener("click", (e) => {
          const btn = e.target.closest("button");
          if (!btn) return;
          e.preventDefault();

          if (btn.dataset.toggleSource) {
            sourceMode = !sourceMode;
            if (sourceMode) {
              source.value = editor.innerHTML;
              editor.style.display = "none";
              source.style.display = "block";
            } else {
              editor.innerHTML = source.value;
              editor.style.display = "block";
              source.style.display = "none";
            }
            sync();
            return;
          }

          editor.focus();
          const cmd = btn.dataset.cmd;
          let arg = btn.dataset.arg || null;
          if (btn.dataset.prompt) {
            arg = prompt("Link URL:");
            if (!arg) return;
          }
          document.execCommand(cmd, false, arg);
          sync();
        });

        // Keep the hidden field in sync right before the form submits,
        // in case the last edit didn't fire an input event.
        editor.closest("form")?.addEventListener("submit", sync);
      })();
    </script>`;
}

// -----------------------------------------------------
// Media picker — a numeric media-library id field (e.g.
// casinos.logo_media_id, news.featured_image) with a thumbnail
// preview and a picker that lists the active tenant's real media
// library, fetched through this control plane's own authenticated
// session (never exposing tenant credentials to the browser).
// -----------------------------------------------------

let mediaPickerInstanceCounter = 0;

function renderMediaPickerField(field, currentId) {
  const instanceId = `media_${field.name}_${mediaPickerInstanceCounter++}`;
  const idValue = currentId != null && currentId !== "" ? currentId : "";

  return `
    <label>${escapeHtml(field.label)}</label>
    <div class="media-field" id="${instanceId}">
      <div class="media-preview" id="${instanceId}_preview">
        ${idValue ? `<span style="color:var(--text-dim);font-size:12px;">Media #${escapeHtml(idValue)} selected</span>` : `<span style="color:var(--text-dim);font-size:12px;">No image selected</span>`}
      </div>
      <input type="hidden" name="${field.name}" id="${instanceId}_input" value="${escapeHtml(idValue)}" />
      <div class="actions" style="margin-bottom:14px;">
        <button type="button" class="btn btn-secondary btn-small" onclick="lummetOpenMediaPicker('${instanceId}')">Choose image</button>
        ${idValue ? `<button type="button" class="btn btn-secondary btn-small" onclick="lummetClearMedia('${instanceId}')">Remove</button>` : ""}
      </div>
      <div class="media-picker-panel" id="${instanceId}_panel" style="display:none;border:1px solid var(--panel-border);border-radius:8px;padding:12px;margin-bottom:14px;max-height:300px;overflow-y:auto;"></div>
    </div>
    <script>
      window.lummetMediaCache = window.lummetMediaCache || null;

      window.lummetOpenMediaPicker = async function(instanceId) {
        const panel = document.getElementById(instanceId + "_panel");
        const isOpen = panel.style.display !== "none";
        if (isOpen) { panel.style.display = "none"; return; }

        panel.style.display = "block";
        panel.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">Loading…</div>';

        try {
          if (!window.lummetMediaCache) {
            const res = await fetch("/api/media-picker");
            const data = await res.json();
            window.lummetMediaCache = data.success ? data.data : [];
          }
          const items = window.lummetMediaCache || [];
          if (items.length === 0) {
            panel.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">No media found on this tenant.</div>';
            return;
          }
          panel.innerHTML = items.map(function(item) {
            const thumb = item.thumbnail_url || item.url;
            return '<div style="display:inline-block;width:80px;margin:4px;cursor:pointer;text-align:center;" ' +
              'onclick="lummetSelectMedia(\\'' + instanceId + '\\', ' + item.id + ', \\'' + (item.filename || "").replace(/'/g, "") + '\\')">' +
              '<img src="' + thumb + '" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--panel-border);" loading="lazy" />' +
              '<div style="font-size:10px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">#' + item.id + '</div>' +
              '</div>';
          }).join("");
        } catch (err) {
          panel.innerHTML = '<div style="color:var(--danger);font-size:13px;">Could not load media.</div>';
        }
      };

      window.lummetSelectMedia = function(instanceId, id, filename) {
        document.getElementById(instanceId + "_input").value = id;
        document.getElementById(instanceId + "_preview").innerHTML =
          '<span style="color:var(--text-dim);font-size:12px;">Media #' + id + (filename ? ' — ' + filename : '') + ' selected</span>';
        document.getElementById(instanceId + "_panel").style.display = "none";
      };

      window.lummetClearMedia = function(instanceId) {
        document.getElementById(instanceId + "_input").value = "";
        document.getElementById(instanceId + "_preview").innerHTML =
          '<span style="color:var(--text-dim);font-size:12px;">No image selected</span>';
      };
    </script>`;
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

// Columns that exist on every record but are never sent back in a
// write — server-computed/identity fields. Anything else present
// in the fetched record (including fields this UI doesn't yet
// expose a form control for) is preserved as-is when merging.
const NON_WRITABLE_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by"
]);

/**
 * Converts one field's raw form-submitted string into the value
 * shape the tenant's database layer actually expects, matching the
 * tenant's own admin frontend (en/static/js/admin.js) exactly:
 *
 *   - "list"        newline-separated textarea -> real JS array of
 *                    trimmed, non-empty strings (matches admin.js's
 *                    pros/cons handling exactly: split("\n").map(trim)
 *                    .filter(Boolean))
 *   - "json_object"  textarea holding JSON -> parsed JS object/array,
 *                    since the DB layer JSON.stringify()s it itself
 *                    (e.g. pages.content_json) — sending an already-
 *                    parsed object here avoids double-encoding.
 *   - "json_raw"     textarea holding JSON -> the RAW STRING is sent
 *                    as-is (e.g. reviews.faq_json), because the DB
 *                    layer does NOT re-stringify it — it expects the
 *                    column's value to already be a JSON-encoded
 *                    string. Only validated for parseability, never
 *                    parsed into an object before sending.
 *   - "richtext"     raw HTML string, sent through unchanged.
 *   - "media"        numeric media-library id, or null.
 *   - "checkbox"     real boolean.
 *   - "number"       real number, or null if left blank.
 *   - "text"/"select" the raw string, or null if left blank (matches
 *                    admin.js's `formData.get(x) || null` convention
 *                    for optional text fields — NOT empty string).
 *
 * Throws a plain Error with a field-specific message on invalid
 * JSON, which the caller turns into a form-level validation error
 * shown to the admin — never silently sent as malformed data.
 */
function coerceFieldValue(field, rawValue) {
  switch (field.type) {
    case "checkbox":
      return rawValue === "1";

    case "number":
      return rawValue === "" || rawValue == null ? null : Number(rawValue);

    case "list":
      return rawValue
        ? String(rawValue)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [];

    case "json_object": {
      const text = (rawValue ?? "").trim();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`"${field.label}" is not valid JSON: ${error.message}`);
      }
    }

    case "json_raw": {
      const text = (rawValue ?? "").trim() || "[]";
      try {
        JSON.parse(text); // validate only — send the raw string itself
      } catch (error) {
        throw new Error(`"${field.label}" is not valid JSON: ${error.message}`);
      }
      return text;
    }

    case "media":
      return rawValue === "" || rawValue == null ? null : Number(rawValue);

    case "richtext":
      return rawValue ?? "";

    default: // "text", "select", "textarea"
      return rawValue === "" || rawValue == null ? null : rawValue;
  }
}

function coerceFormValues(config, form) {
  const body = {};
  for (const field of config.fields) {
    body[field.name] = coerceFieldValue(field, form[field.name]);
  }
  return body;
}

export async function submitCreate(env, admin, resourceKey, config, form) {
  const { tenant } = await resolveActiveTenant(env, admin);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  let body;
  try {
    body = coerceFormValues(config, form);
  } catch (error) {
    return { ok: false, status: 422, reason: "invalid_input", message: error.message };
  }

  const result = await postToTenant(env, tenant, `${BASE_PATH}/${resourceKey}`, body);
  return result;
}

/**
 * Updates a record WITHOUT losing fields the current form doesn't
 * expose an input for. This tenant's own update functions
 * (verified directly against en/worker/database/*.js — e.g.
 * updateNews, updateCasino) are full-overwrite UPDATEs, not partial
 * updates: any field missing from the payload is NOT preserved —
 * it's silently reset to a hardcoded fallback default (e.g. a
 * missing `published` resets a news post to published=1, a missing
 * `author` resets it to "Admin"). So every update here fetches the
 * complete current record first and sends a complete merged
 * representation — edited fields overlaid on top of everything
 * else exactly as it already existed — never a partial object.
 */
export async function submitUpdate(env, admin, resourceKey, config, id, form) {
  const { tenant } = await resolveActiveTenant(env, admin);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  if (config.roleOnly) {
    return putToTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`, { role: form.role });
  }

  const existingResult = await getFromTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`);
  if (!existingResult.ok) return existingResult;

  const existingRecord = existingResult.data.data || {};

  let editedValues;
  try {
    editedValues = coerceFormValues(config, form);
  } catch (error) {
    return { ok: false, status: 422, reason: "invalid_input", message: error.message };
  }

  const body = {};
  for (const [key, value] of Object.entries(existingRecord)) {
    if (!NON_WRITABLE_FIELDS.has(key)) body[key] = value;
  }
  Object.assign(body, editedValues);

  const result = await putToTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`, body);
  return result;
}

export async function submitDelete(env, admin, resourceKey, id) {
  const { tenant } = await resolveActiveTenant(env, admin);
  if (!tenant) return { ok: false, error: "no_active_tenant" };

  return deleteFromTenant(env, tenant, `${BASE_PATH}/${resourceKey}/${encodeURIComponent(id)}`);
}

export { resolveActiveTenant };
