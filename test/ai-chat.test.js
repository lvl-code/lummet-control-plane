import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, applyMigrations } from "./support/d1-shim.js";
import {
  createConversation,
  getOwnedConversation,
  listConversations,
  getMessages,
  formatResultAsText,
  handleChatMessage
} from "../worker/ai/chat.js";

const TENANT_A = "11111111-1111-1111-1111-111111111111";

let db, env;

beforeEach(async () => {
  db = createTestDb();
  applyMigrations(db);
  env = { LUMMET_DB: db }; // no env.AI -> intent.js will use its fallback parser

  await env.LUMMET_DB.prepare(
    `INSERT INTO tenants (id, name, host, api_base_url, status) VALUES (?, 'level.casino', 'level.casino', 'https://level.casino', 'active')`
  ).bind(TENANT_A).run();
  await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_admins (id, email, password_hash, role) VALUES (1, 'a@test.local', 'x', 'super_admin')`
  ).run();
  await env.LUMMET_DB.prepare(
    `INSERT INTO lummet_admins (id, email, password_hash, role) VALUES (2, 'b@test.local', 'x', 'super_admin')`
  ).run();
});

const adminA = { id: 1, role: "super_admin", activeTenantId: TENANT_A };
const adminB = { id: 2, role: "super_admin", activeTenantId: TENANT_A };

describe("ai/chat.js persistence", () => {
  test("createConversation + getOwnedConversation round-trips", async () => {
    const id = await createConversation(env, 1, TENANT_A, "hello");
    const owned = await getOwnedConversation(env, adminA, id);
    assert.ok(owned);
    assert.equal(owned.title, "hello");
  });

  test("a conversation is NOT visible to a different admin (ownership isolation)", async () => {
    const id = await createConversation(env, 1, TENANT_A, "private convo");
    const asOtherAdmin = await getOwnedConversation(env, adminB, id);
    assert.equal(asOtherAdmin, null);
  });

  test("listConversations only returns the calling admin's own conversations", async () => {
    await createConversation(env, 1, TENANT_A, "mine 1");
    await createConversation(env, 1, TENANT_A, "mine 2");
    await createConversation(env, 2, TENANT_A, "someone else's");

    const mine = await listConversations(env, adminA);
    assert.equal(mine.length, 2);
    assert.ok(mine.every((c) => ["mine 1", "mine 2"].includes(c.title)));
  });

  test("getMessages returns messages in chronological order", async () => {
    const convId = await createConversation(env, 1, TENANT_A);
    await handleChatMessage(env, adminA, { conversationId: convId, message: "Show me all casinos." });
    const messages = await getMessages(env, convId);
    assert.equal(messages.length, 2); // user + assistant
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
  });
});

describe("ai/chat.js formatResultAsText", () => {
  test("an error result surfaces the message and available resources", () => {
    const text = formatResultAsText({}, { ok: false, message: "Nope.", available: ["casinos", "reviews"] });
    assert.match(text, /Nope\./);
    assert.match(text, /casinos, reviews/);
  });

  test("a schema result lists every field", () => {
    const text = formatResultAsText(
      {},
      {
        ok: true,
        kind: "schema",
        schema: {
          label: "Casinos",
          idField: "id",
          supportsCreate: true,
          supportsDelete: true,
          fields: [{ name: "rating", type: "number", required: true, lockOnEdit: false }]
        }
      }
    );
    assert.match(text, /rating/);
    assert.match(text, /required/);
  });
});

describe("ai/chat.js handleChatMessage (end-to-end orchestration, no live tenant call)", () => {
  test("rejects an empty message without touching the database", async () => {
    const result = await handleChatMessage(env, adminA, { conversationId: null, message: "   " });
    assert.equal(result.ok, false);
    assert.equal(result.error, "empty_message");
  });

  test("a schema question never reaches out to a tenant and always succeeds", async () => {
    const result = await handleChatMessage(env, adminA, {
      conversationId: null,
      message: "Show me the fields available for casinos."
    });
    assert.equal(result.ok, true);
    assert.equal(result.result.kind, "schema");
    assert.ok(result.conversationId);
  });

  test("an unrecognized resource is reported, not silently ignored", async () => {
    const result = await handleChatMessage(env, adminA, {
      conversationId: null,
      message: "Delete all bitcoin_wallets."
    });
    assert.equal(result.ok, true); // the chat call itself succeeds
    assert.equal(result.result.ok, false); // but the requested action failed
  });

  test("continuing an unknown/foreign conversationId is rejected", async () => {
    const result = await handleChatMessage(env, adminA, {
      conversationId: "00000000-0000-0000-0000-000000000000",
      message: "hi"
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "conversation_not_found");
  });

  test("a write request (create/update/delete) is resolved, authorized and attempts a live preview fetch — never silently executed without a preview", async () => {
    const result = await handleChatMessage(env, adminA, {
      conversationId: null,
      message: "Change casino 123 rating to 4.8."
    });
    assert.equal(result.ok, true);
    // No tenant credential is seeded in this fixture, so the preview's
    // attempt to fetch the current record fails — the important
    // assertion is that this NEVER becomes ok:true without a
    // pendingOperationId, i.e. nothing executes silently.
    assert.equal(result.result.ok, false);
    assert.equal(result.result.pendingOperationId, undefined);
    assert.equal(result.result.kind, undefined); // never reaches "write_preview"/executed without a real tenant
  });
});
