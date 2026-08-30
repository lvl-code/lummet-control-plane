// =====================================================
// TENANT API CLIENT
// The ONLY place in this control plane that ever
// constructs a raw fetch() to a tenant's Super API
// (rule #23). Every dashboard screen and every internal
// caller (registry health checks, CRUD screens, etc.)
// goes through requestTenant().
//
// Lummet never queries a tenant's D1 directly — this is
// the HTTPS boundary described in the master plan:
//
//   Lummet -> HTTPS -> tenant Worker -> tenant D1
// =====================================================

import { decryptSecret } from "./crypto.js";
import { buildSuperApiHeaders } from "./signing.js";
import { getActiveCredential, getTenant } from "./data.js";

const DEFAULT_TIMEOUT_MS = 15000;

// -----------------------------------------------------
// Error taxonomy (rule #24)
// -----------------------------------------------------
//
// error.status is always one of:
//   401 Unauthorized        — bad/missing/expired Lummet credential
//   403 Forbidden           — tenant explicitly refused the action
//   404 Not Found           — route or resource doesn't exist on tenant
//   409 Conflict            — e.g. duplicate slug
//   422 Validation Error    — bad input, OR a control-plane-side
//                             configuration problem (see `reason`)
//   429 Rate Limited        — tenant is throttling this credential
//   500 Tenant Error        — tenant returned an unexpected 5xx
//   502 Tenant Unavailable  — network/connection failure reaching tenant
//   504 Tenant Timeout      — request exceeded the timeout
//
// `reason` gives finer detail for logging/UI without overloading
// the HTTP status, e.g. "no_active_credential", "credential_decrypt_failed",
// "tenant_disabled", "malformed_response".

export class TenantApiError extends Error {
  constructor(status, reason, message, meta = {}) {
    super(message || reason);
    this.name = "TenantApiError";
    this.status = status;
    this.reason = reason;
    this.meta = meta;
  }
}

function isPreflightConfigError(status) {
  // Errors that happen before any request left this Worker.
  return status === 422 || status === 409;
}

// -----------------------------------------------------
// requestTenant
// -----------------------------------------------------

/**
 * Makes an authenticated, signed request to a tenant's Super API.
 *
 * @param {object} env
 * @param {string|object} tenantOrId - a tenant row, or a tenant id
 *   (the id form is fetched fresh so callers don't need to re-read
 *   the tenant themselves).
 * @param {object} options
 * @param {string} options.method - GET | POST | PUT | DELETE
 * @param {string} options.path   - e.g. "/en/api/super/news/my-slug"
 * @param {object|null} [options.body] - JSON-serializable body
 * @param {number} [options.timeoutMs]
 *
 * @returns {Promise<{ok: true, status: number, data: any} | {ok: false, status: number, reason: string, message: string}>}
 *
 * This never throws for ordinary failure modes (auth, network,
 * tenant-side errors) — it always resolves with a tagged result so
 * callers can render a useful message per rule #24. It only throws
 * for genuine programmer errors (e.g. missing required options).
 */
export async function requestTenant(env, tenantOrId, options) {
  const { method, path, body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!method || !path) {
    throw new Error("requestTenant requires { method, path }");
  }

  const tenant =
    typeof tenantOrId === "string" ? await getTenant(env, tenantOrId) : tenantOrId;

  if (!tenant) {
    return fail(404, "tenant_not_found", "Tenant is not registered.");
  }

  if (tenant.status === "disabled") {
    return fail(422, "tenant_disabled", "This tenant is disabled in the registry.");
  }

  const credential = await getActiveCredential(env, tenant.id);
  if (!credential) {
    return fail(
      422,
      "no_active_credential",
      "No active Super API credential is configured for this tenant."
    );
  }

  let secret;
  try {
    secret = await decryptSecret(env, credential.encrypted_secret, credential.secret_iv);
  } catch (error) {
    return fail(
      500,
      "credential_decrypt_failed",
      "Could not decrypt this tenant's credential. Check CREDENTIAL_KEK."
    );
  }

  const bodyText = body != null ? JSON.stringify(body) : "";

  const headers = await buildSuperApiHeaders({
    credentialId: credential.credential_id,
    secret,
    method,
    path,
    bodyText
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${tenant.api_base_url}${path}`, {
      method,
      headers,
      body: bodyText || undefined,
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      return fail(504, "timeout", "The tenant did not respond in time.");
    }
    return fail(502, "unavailable", "Could not reach the tenant deployment.", {
      networkError: error.message
    });
  }
  clearTimeout(timeout);

  const data = await response.json().catch(() => null);

  if (response.ok) {
    if (!data || data.success !== true) {
      return fail(502, "malformed_response", "Tenant returned an unexpected response shape.");
    }
    return { ok: true, status: response.status, data };
  }

  // Map the tenant's HTTP status straight through — the tenant's
  // Super API already returns the right status per its own
  // validation/auth/rate-limit logic (Phase 1).
  const reason = data?.error || reasonForStatus(response.status);
  return fail(response.status, reason, messageForStatus(response.status), { data });
}

function fail(status, reason, message, meta = {}) {
  return { ok: false, status, reason, message, meta };
}

function reasonForStatus(status) {
  switch (status) {
    case 401: return "unauthorized";
    case 403: return "forbidden";
    case 404: return "not_found";
    case 409: return "conflict";
    case 422: return "validation_error";
    case 429: return "rate_limited";
    case 500: return "tenant_error";
    default: return "unknown_error";
  }
}

export function messageForStatus(status) {
  switch (status) {
    case 401: return "Lummet's credential for this tenant was rejected.";
    case 403: return "The tenant refused this action.";
    case 404: return "That resource does not exist on the tenant.";
    case 409: return "This conflicts with existing data on the tenant.";
    case 422: return "The tenant rejected this input as invalid.";
    case 429: return "The tenant is rate-limiting this credential.";
    case 500: return "The tenant encountered an internal error.";
    default: return "The tenant returned an unexpected error.";
  }
}

// -----------------------------------------------------
// Convenience wrappers
// -----------------------------------------------------

export function getFromTenant(env, tenant, path) {
  return requestTenant(env, tenant, { method: "GET", path });
}

export function postToTenant(env, tenant, path, body) {
  return requestTenant(env, tenant, { method: "POST", path, body });
}

export function putToTenant(env, tenant, path, body) {
  return requestTenant(env, tenant, { method: "PUT", path, body });
}

export function deleteFromTenant(env, tenant, path) {
  return requestTenant(env, tenant, { method: "DELETE", path });
}
