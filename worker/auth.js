// =====================================================
// LUMMET MASTER ADMIN AUTH
// Self-contained identity system for the control plane.
// Deliberately NOT connected to any tenant's `users` table
// (rule #27) — a tenant admin never inherits Lummet master
// access, and a Lummet admin never becomes a tenant user.
// =====================================================

const SESSION_COOKIE = "lummet_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 hours

// -----------------------------------------------------
// Password hashing (PBKDF2, 100k iterations, salt:hash hex)
// -----------------------------------------------------

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, storedHash) {
  const [saltHex, hashHex] = (storedHash || "").split(":");
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  const computedHex = [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === hashHex;
}

// -----------------------------------------------------
// Rate limiting (mirrors the tenant repo's auth_attempts pattern)
// -----------------------------------------------------

async function hashIP(ip) {
  if (!ip) return "";
  const data = new TextEncoder().encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(env, ipHash, action) {
  const windowMinutes = 15;
  const maxAttempts = 5;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  await env.LUMMET_DB.prepare(
    `DELETE FROM lummet_auth_attempts WHERE created_at < ?`
  ).bind(windowStart).run();

  const row = await env.LUMMET_DB.prepare(
    `SELECT COUNT(*) c FROM lummet_auth_attempts WHERE ip_hash = ? AND action = ? AND created_at >= ?`
  ).bind(ipHash, action, windowStart).first();

  return (row?.c || 0) < maxAttempts;
}

async function logFailedAttempt(env, ipHash, action) {
  await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_auth_attempts (ip_hash, action, created_at) VALUES (?, ?, ?)`
  ).bind(ipHash, action, new Date().toISOString()).run();
}

// -----------------------------------------------------
// Bootstrap — creates the first admin, only when none exist.
// This is the only unauthenticated write this module allows.
// -----------------------------------------------------

export async function hasAnyAdmins(env) {
  const countRow = await env.LUMMET_DB.prepare(
    `SELECT COUNT(*) c FROM lummet_admins`
  ).first();
  return (countRow?.c || 0) > 0;
}

export async function bootstrapFirstAdmin(env, email, password) {
  const countRow = await env.LUMMET_DB.prepare(
    `SELECT COUNT(*) c FROM lummet_admins`
  ).first();

  if ((countRow?.c || 0) > 0) {
    return { ok: false, status: 403, error: "already_bootstrapped" };
  }

  if (!email || !password || password.length < 12) {
    return { ok: false, status: 422, error: "invalid_email_or_password" };
  }

  const passwordHash = await hashPassword(password);
  const trimmedEmail = email.trim();

  const inserted = await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_admins (email, password_hash, role) VALUES (?, ?, 'master_admin') RETURNING id`
  ).bind(trimmedEmail, passwordHash).first();

  return { ok: true, adminId: inserted?.id ?? null, email: trimmedEmail };
}

// -----------------------------------------------------
// Login / logout / session lookup
// -----------------------------------------------------

export async function hashIPForRateLimit(request) {
  return hashIP(request.headers.get("CF-Connecting-IP"));
}

export async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").trim();
  const password = body.password || "";
  const ipHash = await hashIP(request.headers.get("CF-Connecting-IP"));
  return authenticateAdmin(env, email, password, ipHash);
}

/**
 * Core credential check, independent of how email/password were
 * obtained. Use this directly (instead of login()) whenever the
 * request body has already been consumed by something else — e.g.
 * a page route that parsed it as form data — since Request bodies
 * can only be read once.
 */
export async function authenticateAdmin(env, email, password, ipHash) {
  email = (email || "").trim();
  password = password || "";

  if (!email || !password) {
    return { ok: false, status: 400, error: "email_and_password_required", email };
  }

  const allowed = await checkRateLimit(env, ipHash, "login");
  if (!allowed) {
    return { ok: false, status: 429, error: "too_many_attempts", email };
  }

  const admin = await env.LUMMET_DB.prepare(
    `SELECT * FROM lummet_admins WHERE email = ?`
  ).bind(email).first();

  if (!admin) {
    await logFailedAttempt(env, ipHash, "login");
    return { ok: false, status: 401, error: "invalid_credentials", email };
  }

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) {
    await logFailedAttempt(env, ipHash, "login");
    return { ok: false, status: 401, error: "invalid_credentials", email, adminId: admin.id };
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_sessions (id, admin_id, expires_at) VALUES (?, ?, ?)`
  ).bind(sessionId, admin.id, expiresAt).run();

  return {
    ok: true,
    sessionId,
    adminId: admin.id,
    email: admin.email,
    cookie: `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`
  };
}

export async function logout(request, env) {
  const sessionId = getSessionIdFromRequest(request);
  let adminId = null;

  if (sessionId) {
    const session = await env.LUMMET_DB.prepare(
      `SELECT admin_id FROM lummet_sessions WHERE id = ?`
    ).bind(sessionId).first();
    adminId = session?.admin_id ?? null;

    await env.LUMMET_DB.prepare(`DELETE FROM lummet_sessions WHERE id = ?`)
      .bind(sessionId)
      .run();
  }

  return {
    adminId,
    cookie: `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  };
}

function getSessionIdFromRequest(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Resolves the current Lummet admin from the session cookie.
 * Returns null if there is no valid, unexpired session — callers
 * must treat that as unauthenticated.
 */
export async function getCurrentAdmin(request, env) {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) return null;

  const session = await env.LUMMET_DB.prepare(
    `SELECT * FROM lummet_sessions WHERE id = ?`
  ).bind(sessionId).first();

  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await env.LUMMET_DB.prepare(`DELETE FROM lummet_sessions WHERE id = ?`)
      .bind(sessionId)
      .run();
    return null;
  }

  const admin = await env.LUMMET_DB.prepare(
    `SELECT id, email, role FROM lummet_admins WHERE id = ?`
  ).bind(session.admin_id).first();

  if (!admin) return null;

  return { ...admin, sessionId, activeTenantId: session.active_tenant_id || null };
}

export async function setActiveTenant(env, sessionId, tenantId) {
  await env.LUMMET_DB.prepare(
    `UPDATE lummet_sessions SET active_tenant_id = ? WHERE id = ?`
  ).bind(tenantId, sessionId).run();
}
