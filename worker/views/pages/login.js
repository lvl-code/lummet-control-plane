import { renderAuthShell, escapeHtml } from "../layout.js";

export function renderLoginPage({ mode, error }) {
  const flash = error
    ? `<div class="flash flash-error">${escapeHtml(error)}</div>`
    : "";

  if (mode === "bootstrap") {
    return renderAuthShell({
      title: "Set up",
      bodyHtml: `
        ${flash}
        <p style="color:var(--text-dim);font-size:13px;margin-top:0;">
          No Lummet administrator exists yet. Create the first one —
          this form only works once.
        </p>
        <form method="POST" action="/login">
          <input type="hidden" name="mode" value="bootstrap" />
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required autofocus />
          <label for="password">Password (12+ characters)</label>
          <input type="password" id="password" name="password" minlength="12" required />
          <button class="btn" type="submit" style="width:100%;">Create admin account</button>
        </form>
      `
    });
  }

  return renderAuthShell({
    title: "Log in",
    bodyHtml: `
      ${flash}
      <form method="POST" action="/login">
        <input type="hidden" name="mode" value="login" />
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autofocus />
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required />
        <button class="btn" type="submit" style="width:100%;">Log in</button>
      </form>
    `
  });
}
