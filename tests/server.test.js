const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/server.js');
const { open } = require('../server/db.js');
const A = require('../server/auth.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hitcore-'));
const dbFile = path.join(dir, 'test.db');
const quiet = { info() {}, error() {} };

// create users directly in the database (what `manage.js add-user` does)
{
  const repo = open(dbFile);
  repo.createUser({ id: 'u-admin1', username: 'admin', name: 'Admin', role: 'admin', passwordHash: A.hashPassword('admin-pass-1') });
  repo.createUser({ id: 'u-coach1', username: 'coach', name: 'Coach One', role: 'coach', passwordHash: A.hashPassword('coach-pass-1') });
  repo.close();
}

async function boot() {
  const { server } = createServer({ dbFile, log: quiet });
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'X-HitCore': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json, res };
  };
  return { server, base, call, close: () => new Promise(r => server.close(r)) };
}

test('auth: rejects bad credentials, requires session, sets HttpOnly cookie', async () => {
  const s = await boot();
  assert.strictEqual((await s.call('GET', '/api/bootstrap')).status, 401);
  assert.strictEqual((await s.call('POST', '/api/auth/login', { username: 'coach', password: 'nope' })).status, 401);
  const ok = await s.call('POST', '/api/auth/login', { username: 'Coach', password: 'coach-pass-1' });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.json.user.u, 'coach');
  assert.match(ok.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.strictEqual((await s.call('GET', '/api/auth/me')).json.user.name, 'Coach One');
  // CSRF guard: writes need the custom header
  assert.strictEqual((await s.call('PUT', '/api/settings', {}, { 'X-HitCore': '' })).status, 403);
  // coaches are not admins
  assert.strictEqual((await s.call('GET', '/api/admin/users')).status, 403);
  await s.close();
});

test('results are saved and survive a server restart; edits keep an audit trail', async () => {
  let s = await boot();
  await s.call('POST', '/api/auth/login', { username: 'coach', password: 'coach-pass-1' });
  assert.strictEqual((await s.call('PUT', '/api/shooters/sh-anna1', { name: 'Anna', division: 'Production', pf: 'minor' })).status, 200);
  assert.strictEqual((await s.call('PUT', '/api/exercises/ex-bill1', { name: 'Bill Drill', rounds: 6, requiredHits: 6 })).status, 200);
  assert.strictEqual((await s.call('PUT', '/api/sessions/se-tue01', { name: 'Tuesday', date: '2026-11-03', shooterIds: ['sh-anna1'], exerciseIds: ['ex-bill1'] })).status, 200);
  const run = { shooterId: 'sh-anna1', exerciseId: 'ex-bill1', time: 2.48, splits: [1.3, 1.55, 1.78, 2.01, 2.25, 2.48], A: 5, C: 0, D: 0, M: 1, NS: 0, P: 0, pf: 'minor', source: 'mic' };
  const c1 = await s.call('PUT', '/api/sessions/se-tue01/runs/run-0001', run);
  assert.deepStrictEqual(c1.json, { created: true });
  // a retried request (e.g. flaky range Wi-Fi) must not create a duplicate
  assert.deepStrictEqual((await s.call('PUT', '/api/sessions/se-tue01/runs/run-0001', run)).json, { created: false });
  const up = await s.call('PATCH', '/api/sessions/se-tue01/runs/run-0001', { time: 2.6, A: 6, M: 0 });
  assert.deepStrictEqual(up.json, { changed: true });
  assert.deepStrictEqual((await s.call('PATCH', '/api/sessions/se-tue01/runs/run-0001', { time: 2.6 })).json, { changed: false });
  await s.call('PUT', '/api/settings', { sensitivity: 70 });
  await s.close();

  s = await boot(); // fresh process view of the same database file
  await s.call('POST', '/api/auth/login', { username: 'coach', password: 'coach-pass-1' });
  const b = (await s.call('GET', '/api/bootstrap')).json;
  assert.strictEqual(b.sessions.length, 1);
  const r = b.sessions[0].runs[0];
  assert.strictEqual(b.sessions[0].runs.length, 1);
  assert.strictEqual(r.time, 2.6); assert.strictEqual(r.A, 6); assert.strictEqual(r.M, 0);
  assert.deepStrictEqual(r.splits, run.splits);
  assert.strictEqual(r.createdBy, 'coach');
  assert.strictEqual(r.history.length, 1);
  assert.deepStrictEqual(r.history[0].changes.time, [2.48, 2.6]);
  assert.deepStrictEqual(b.sessions[0].shooterIds, ['sh-anna1']);
  assert.strictEqual(b.settings.sensitivity, 70);
  await s.close();
});

test('integrity: validation, referential checks, protected deletes', async () => {
  const s = await boot();
  await s.call('POST', '/api/auth/login', { username: 'coach', password: 'coach-pass-1' });
  assert.strictEqual((await s.call('PUT', '/api/sessions/se-tue01/runs/run-bad1', { shooterId: 'sh-anna1', exerciseId: 'ex-bill1', time: 0 })).status, 400);
  assert.strictEqual((await s.call('PUT', '/api/sessions/se-tue01/runs/run-bad2', { shooterId: 'nobody-1', exerciseId: 'ex-bill1', time: 2 })).status, 422);
  assert.strictEqual((await s.call('PUT', '/api/sessions/se-tue01/runs/run-bad3', { shooterId: 'sh-anna1', exerciseId: 'ex-bill1', time: 2, A: -1 })).status, 400);
  assert.strictEqual((await s.call('DELETE', '/api/shooters/sh-anna1')).status, 409); // has runs
  assert.strictEqual((await s.call('DELETE', '/api/exercises/ex-bill1')).status, 409);
  // deleting a session removes its runs
  assert.strictEqual((await s.call('DELETE', '/api/sessions/se-tue01')).status, 200);
  assert.strictEqual((await s.call('DELETE', '/api/shooters/sh-anna1')).status, 200);
  const b = (await s.call('GET', '/api/bootstrap')).json;
  assert.strictEqual(b.sessions.length, 0); assert.strictEqual(b.shooters.length, 0);
  await s.close();
});

test('admin: create users, disable them, read the audit log; import backups', async () => {
  const s = await boot();
  await s.call('POST', '/api/auth/login', { username: 'admin', password: 'admin-pass-1' });
  const nu = await s.call('POST', '/api/admin/users', { username: 'greta', name: 'Greta', password: 'greta-pass-1', role: 'coach' });
  assert.strictEqual(nu.status, 200);
  assert.strictEqual((await s.call('POST', '/api/admin/users', { username: 'greta', name: 'Dup', password: 'whatever-1' })).status, 409);
  assert.strictEqual((await s.call('POST', '/api/admin/users', { username: 'weak', name: 'Weak', password: 'short' })).status, 400);
  const { demoData } = require('../server/seed.js');
  const imp = await s.call('POST', '/api/import', demoData('admin'));
  assert.strictEqual(imp.json.runs, 24);
  const audit = (await s.call('GET', '/api/admin/audit')).json.entries;
  assert.ok(audit.some(e => e.action === 'import') && audit.some(e => e.action === 'delete' && e.entity === 'session'));
  await s.call('POST', `/api/admin/users/${nu.json.user.id}/disable`, { disabled: true });
  const s2 = await boot();
  assert.strictEqual((await s2.call('POST', '/api/auth/login', { username: 'greta', password: 'greta-pass-1' })).status, 401);
  await s2.close();
  await s.close();
});

test('static: serves the app, api-mode config, and never exposes server files', async () => {
  const s = await boot();
  const cfg = await fetch(s.base + '/config.js').then(r => r.text());
  assert.match(cfg, /"mode":"api"/);
  const html = await fetch(s.base + '/').then(r => r.text());
  assert.match(html, /<title>HitCore<\/title>/);
  const leak = await fetch(s.base + '/server/db.js').then(r => r.text());
  assert.doesNotMatch(leak, /DatabaseSync/);
  assert.doesNotMatch(await fetch(s.base + '/data/test.db').then(r => r.text()), /SQLite format/);
  await s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
