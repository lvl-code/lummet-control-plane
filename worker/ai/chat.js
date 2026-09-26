// =====================================================
// AI CHAT
// Conversation/message persistence (D1, not in-memory --
// required so a pending write-preview in Phase 2 survives a
// reload) plus the orchestrator that ties intent -> resolver
// -> action-engine together for one chat turn.
// =====================================================

import { parseIntent } from "./intent.js";
import { runAction } from "./action-engine.js";

export async function createConversation(env, adminId, tenantId, title = null) {
  const id = crypto.randomUUID();
  await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_ai_conversations (id, admin_id, tenant_id, title) VALUES (?, ?, ?, ?)`
  )
    .bind(id, adminId, tenantId || null, title)
    .run();
  return id;
}

/** Ownership-checked fetch -- never returns another admin's conversation. */
export async function getOwnedConversation(env, admin, conversationId) {
  const row = await env.LUMMET_DB.prepare(`SELECT * FROM lummet_ai_conversations WHERE id = ?`)
    .bind(conversationId)
    .first();
  if (!row) return null;
  if (row.admin_id !== admin.id) return null;
  return row;
}

export async function listConversations(env, admin, limit = 50) {
  const result = await env.LUMMET_DB.prepare(
    `SELECT id, tenant_id, title, created_at, updated_at FROM lummet_ai_conversations
     WHERE admin_id = ? ORDER BY updated_at DESC LIMIT ?`
  )
    .bind(admin.id, limit)
    .all();
  return result.results || [];
}

export async function getMessages(env, conversationId, limit = 200) {
  const result = await env.LUMMET_DB.prepare(
    `SELECT id, role, content, action_id, created_at FROM lummet_ai_messages
     WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
  )
    .bind(conversationId, limit)
    .all();
  return result.results || [];
}

export async function appendMessage(env, conversationId, role, content, actionId = null) {
  const id = crypto.randomUUID();
  await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_ai_messages (id, conversation_id, role, content, action_id) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, conversationId, role, content, actionId)
    .run();
  await env.LUMMET_DB.prepare(`UPDATE lummet_ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(conversationId)
    .run();
  return id;
}

/**
 * Renders one action-engine result into a chat-bubble-friendly
 * string. The full structured `result` is still returned alongside
 * this for a richer UI to use -- this text form is the fallback /
 * plain-chat rendering, and exact field values are never altered
 * here, only laid out.
 */
export function formatResultAsText(intent, result) {
  if (!result.ok) {
    let text = result.message || "That request could not be completed.";
    if (result.available) text += `\n\nAvailable resources: ${result.available.join(", ")}`;
    if (result.candidates) {
      text += `\n\n${result.candidates.map((c) => `- ${c.name} (${c.host})`).join("\n")}`;
    }
    return text;
  }

  if (result.kind === "schema_list") {
    return `Available resources: ${result.resources.join(", ")}`;
  }

  if (result.kind === "schema") {
    const s = result.schema;
    const fieldLines = s.fields
      .map((f) => `- ${f.name} (${f.type}${f.required ? ", required" : ""}${f.lockOnEdit ? ", locked after create" : ""})`)
      .join("\n");
    return `${s.label} (id field: ${s.idField}; create: ${s.supportsCreate ? "yes" : "no"}; delete: ${s.supportsDelete ? "yes" : "no"})\n\nFields:\n${fieldLines}`;
  }

  if (result.kind === "write_preview") {
    const lines = [`WRITE PREVIEW — ${result.destructive ? "DESTRUCTIVE OPERATION" : result.operation.toUpperCase()}`];
    lines.push(`Tenant: ${result.tenant.name}`);
    lines.push(`Resource: ${result.resourceKey}`);
    if (result.recordId) lines.push(`Record: ${result.recordId}`);
    if (result.changes?.length) {
      lines.push("", "Changes:");
      for (const c of result.changes) {
        lines.push(`  ${c.field}: ${JSON.stringify(c.current)} -> ${JSON.stringify(c.proposed)}`);
      }
    }
    if (result.destructive && result.recordSnapshot) {
      lines.push("", "This record will be permanently deleted:", JSON.stringify(result.recordSnapshot, null, 2));
    }
    lines.push("", "No other fields will be changed.");
    lines.push(`Audit: will be created`);
    lines.push("", `[CONTINUE — WRITE] confirm with pendingOperationId=${result.pendingOperationId}`);
    return lines.join("\n");
  }

  if (result.kind === "read" && result.mode === "record") {
    return `${result.resourceKey} on ${result.tenant.name}:\n\n${JSON.stringify(result.record, null, 2)}`;
  }

  if (result.kind === "read" && result.mode === "list") {
    let text = `${result.records.length} of ${result.totalBeforeFilters} ${result.resourceKey} on ${result.tenant.name}`;
    if (result.unrecognizedFilters?.length) {
      text += `\n(note: filter(s) not recognized on this resource and not applied: ${result.unrecognizedFilters.join(", ")})`;
    }
    text += `\n\n${JSON.stringify(result.records, null, 2)}`;
    return text;
  }

  return JSON.stringify(result, null, 2);
}

/**
 * One full chat turn: authenticate is the caller's job (index.js);
 * everything from here on operates as `admin` and nothing else.
 */
export async function handleChatMessage(env, admin, { conversationId, message }) {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return { ok: false, error: "empty_message", message: "Message cannot be empty." };
  }

  let convId = conversationId;
  if (convId) {
    const owned = await getOwnedConversation(env, admin, convId);
    if (!owned) {
      return { ok: false, error: "conversation_not_found", message: "That conversation does not exist." };
    }
  } else {
    convId = await createConversation(env, admin.id, admin.activeTenantId, trimmed.slice(0, 80));
  }

  await appendMessage(env, convId, "user", trimmed);

  const history = await getMessages(env, convId, 12);
  const historyForModel = history
    .slice(0, -1) // exclude the message we just added, passed separately
    .map((m) => ({ role: m.role, content: m.content }));

  const intent = await parseIntent(env, trimmed, historyForModel);
  const result = await runAction(env, admin, intent, { conversationId: convId });
  const replyText = formatResultAsText(intent, result);

  await appendMessage(env, convId, "assistant", replyText, result.pendingOperationId || null);

  return { ok: true, conversationId: convId, intent, result, reply: replyText };
}
