// Signed-in staff see "Dashboard" in place of "Sign in" in the public header.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedFixtures, FIXTURE_PASSWORDS } from './support/fixtures.js';
import { authenticateAdmin } from '../worker/auth.js';
import { createAssets } from './support/public-env.js';

describe('header link for signed-in staff', () => {
  let env, sid, prepared;
  beforeEach(async () => {
    const db = createTestDb();
    applyMigrations(db);
    await seedFixtures(db);
    prepared = 0;
    const real = db.prepare.bind(db);
    db.prepare = (...a) => { prepared += 1; return real(...a); };
    env = { LUMMET_DB: db, ASSETS: createAssets(), CONTACT_EMAIL: 'hello@example.test' };
    const key = Object.keys(FIXTURE_PASSWORDS)[0];
    const r = await authenticateAdmin(env, `${key}@example.com`, FIXTURE_PASSWORDS[key], 'ip-1');
    sid = r.sessionId;
  });
  const get = (path, cookie) =>
    worker.fetch(new Request(`https://lummet.test${path}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} }), env, { waitUntil() {} });

  test('/session-status says false for visitors, without touching the database', async () => {
    prepared = 0;
    const res = await get('/session-status');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { signedIn: false });
    assert.equal(prepared, 0);
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.match(res.headers.get('cache-control'), /private/);
  });

  test('/session-status says true for a valid session, false for a bad or expired one', async () => {
    assert.deepEqual(await (await get('/session-status', `lummet_session=${sid}`)).json(), { signedIn: true });
    assert.deepEqual(await (await get('/session-status', 'lummet_session=nope')).json(), { signedIn: false });
    await env.LUMMET_DB.prepare(`UPDATE lummet_sessions SET expires_at = '2000-01-01T00:00:00.000Z'`).run();
    assert.deepEqual(await (await get('/session-status', `lummet_session=${sid}`)).json(), { signedIn: false });
  });

  test('/session-status exposes nothing but the flag', async () => {
    const body = await (await get('/session-status', `lummet_session=${sid}`)).json();
    assert.deepEqual(Object.keys(body), ['signedIn']);
  });

  test('the cached page is the same for everyone and carries the label from the database', async () => {
    const anon = await (await get('/')).text();
    const staff = await (await get('/', `lummet_session=${sid}`)).text();
    assert.equal(anon, staff);
    assert.match(anon, /data-signed-in-label="Dashboard"/);
    assert.match(anon, /data-signed-in-href="\/dashboard"/);
    assert.match(anon, /\/static\/js\/session\.js/);
    assert.match(anon, />Sign in</);
  });

  test('editing the label in the database changes the page', async () => {
    await env.LUMMET_DB.prepare(`UPDATE lummet_ui_strings SET value = 'Console' WHERE ui_key = 'signed_in_label'`).run();
    assert.match(await (await get('/brands')).text(), /data-signed-in-label="Console"/);
  });

  test('the script swaps every sign-in link and has no strings of its own', () => {
    const src = readFileSync(new URL('../public/static/js/session.js', import.meta.url), 'utf8');
    assert.match(src, /\/session-status/);
    assert.match(src, /textContent/);
    assert.doesNotMatch(src, /innerHTML|eval\(|Dashboard|Sign in/);
  });

  test('migration 0009 is safe to run twice and keeps an edited label', async () => {
    const sql = readFileSync(new URL('../migrations/0009_signed_in_header.sql', import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /DELETE|DROP|UPDATE/i);
    const db = env.LUMMET_DB;
    await db.prepare(`UPDATE lummet_ui_strings SET value = 'Console' WHERE ui_key = 'signed_in_label'`).run();
    const stmt = sql.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim().replace(/;$/, '');
    await db.prepare(stmt).run();
    await db.prepare(stmt).run();
    const rows = (await db.prepare(`SELECT ui_key, value FROM lummet_ui_strings WHERE ui_key LIKE 'signed_in_%' ORDER BY ui_key`).all()).results;
    assert.deepEqual(rows.map((r) => [r.ui_key, r.value]), [['signed_in_href', '/dashboard'], ['signed_in_label', 'Console']]);
  });
});
