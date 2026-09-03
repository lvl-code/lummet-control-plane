// =====================================================
// ACCOUNT — self-service password change
// Used both for the forced "you have a temp password,
// change it" flow (must_change_password = 1) and for a
// voluntary change any admin can trigger later from the
// topbar link in layout.js.
// =====================================================

import { renderShell, escapeHtml } from "../layout.js";
import { changeOwnPassword } from "../../auth.js";

export async function renderChangePasswordPage(env, admin, error) {
  const forced = admin.must_change_password === 1;

  const body = `
    <h1>Change password</h1>
    <p class="subtitle">Account · ${escapeHtml(admin.email)}</p>
    ${forced
      ? `<div class="flash flash-error">You're signed in with a temporary password. Set a real one before continuing.</div>`
      : ""}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/account/password" class="card" style="max-width:420px;">
      <div class="form-group">
        <label>Current password</label>
        <input type="password" name="current_password" required autocomplete="current-password" />
      </div>
      <div class="form-group">
        <label>New password</label>
        <input type="password" name="new_password" required minlength="12" autocomplete="new-password" />
        <span style="font-size:12px;color:var(--text-dim);">At least 12 characters.</span>
      </div>
      <div class="form-group">
        <label>Confirm new password</label>
        <input type="password" name="confirm_password" required minlength="12" autocomplete="new-password" />
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button type="submit" class="btn btn-primary">Save new password</button>
        ${forced ? "" : `<a class="btn btn-secondary" href="/">Cancel</a>`}
      </div>
    </form>`;

  return renderShell({ title: "Change password", activeKey: "account-password", admin, bodyHtml: body, env });
}

export async function submitChangePassword(env, admin, form) {
  const newPassword = form.new_password || "";
  const confirmPassword = form.confirm_password || "";

  if (newPassword !== confirmPassword) {
    return { ok: false, status: 422, error: "passwords_do_not_match" };
  }

  return changeOwnPassword(env, admin.id, form.current_password, newPassword);
}
