'use strict';
// HitCore API + static web server. Zero dependencies (Node >= 22.13).
//
//   PORT=8080 HITCORE_DB=./data/hitcore.db node server/server.js
//
// First start with an empty database: set HITCORE_ADMIN_USER / HITCORE_ADMIN_PASSWORD
// (and optionally HITCORE_SEED_DEMO=1), or create users with `node server/manage.js`.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open, HttpError } = require('./db');
const A = require('./auth');
const { demoData } = require('./seed');

const ROOT = path.resolve(__dirname, '..');
const STATIC = new Set(['index.html', 'manifest.webmanifest', 'sw.js']);
const STATIC_DIRS = ['css/', 'js/', 'icons/'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const COOKIE = 'hc_session';
const TTL = { remember: 30 * 864e5, session: 12 * 36e5 };

function createServer({ dbFile = process.env.HITCORE_DB || path.join(ROOT, 'data', 'hitcore.db'), log = console } = {}) {
  const repo = open(dbFile);
  const limiter = new A.Limiter(10, 10 * 60e3);

  // ---------- first-run bootstrap ----------
  if (repo.userCount() === 0 && process.env.HITCORE_ADMIN_USER && process.env.HITCORE_ADMIN_PASSWORD) {
    repo.createUser({ id: A.newId(), username: process.env.HITCORE_ADMIN_USER, name: process.env.HITCORE_ADMIN_NAME || 'Administrator', role: 'admin', passwordHash: A.hashPassword(process.env.HITCORE_ADMIN_PASSWORD) });
    log.info?.(`created admin user "${process.env.HITCORE_ADMIN_USER}"`);
  }
  if (process.env.HITCORE_SEED_DEMO === '1' && repo.bootstrap(null).sessions.length === 0) { repo.importData('seed', demoData('seed')); log.info?.('seeded demo data'); }
  const purge = setInterval(() => repo.purgeExpired(), 3600e3); purge.unref();

  // ---------- helpers ----------
  const send = (res, status, body, headers = {}) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(data);
  };
  const readJson = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 5e6) { reject(new HttpError(413, 'payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'invalid JSON')); } });
    req.on('error', reject);
  });
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const isHttps = req => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  const sessionCookie = (req, token, maxAgeMs) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${isHttps(req) ? '; Secure' : ''}${maxAgeMs != null ? `; Max-Age=${Math.floor(maxAgeMs / 1000)}` : ''}`;
  const clientIp = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  function auth(req) {
    const t = cookies(req)[COOKIE]; if (!t) return null;
    const s = repo.authSession(A.tokenHash(t));
    return s ? { id: s.user_id, username: s.username, name: s.name, role: s.role, since: s.created_at, tokenHash: s.token_hash } : null;
  }
  const userOut = u => ({ u: u.username, name: u.name, role: u.role === 'admin' ? 'Administrator' : 'Coach', admin: u.role === 'admin', since: u.since || u.created_at });

  // ---------- API routes ----------
  const routes = [];
  const on = (method, pattern, handler, { pub = false, admin = false } = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[\\w-]+)') + '$'), handler, pub, admin });

  on('GET', '/api/health', () => ({ ok: true, time: new Date().toISOString() }), { pub: true });

  on('POST', '/api/auth/login', async (req, res, { body }) => {
    const key = clientIp(req) + '|' + String(body.username || '').toLowerCase();
    if (!limiter.check(key)) throw new HttpError(429, 'Too many attempts – try again in a few minutes');
    const u = repo.userByName(String(body.username || '').trim());
    const ok = A.verifyPassword(String(body.password || ''), u ? u.password_hash : A.DUMMY);
    if (!u || !ok || u.disabled) throw new HttpError(401, 'Invalid username or password');
    limiter.clear(key);
    const token = A.newToken(), ttl = body.remember ? TTL.remember : TTL.session;
    repo.createAuthSession(A.tokenHash(token), u.id, ttl, req.headers['user-agent']);
    repo.audit(u.username, 'login', 'user', u.id);
    res.setHeader('Set-Cookie', sessionCookie(req, token, body.remember ? ttl : null));
    return { user: userOut({ ...u, since: new Date().toISOString() }) };
  }, { pub: true });
  on('POST', '/api/auth/logout', (req, res, { user }) => { repo.deleteAuthSession(user.tokenHash); res.setHeader('Set-Cookie', sessionCookie(req, '', 0)); return { ok: true }; });
  on('GET', '/api/auth/me', (req, res, { user }) => ({ user: userOut(user) }));
  on('POST', '/api/auth/password', (req, res, { user, body }) => {
    const u = repo.userById(user.id);
    if (!A.verifyPassword(String(body.current || ''), u.password_hash)) throw new HttpError(403, 'Current password is wrong');
    repo.setPassword(user.id, A.hashPassword(String(body.next || '')));
    repo.audit(user.username, 'password', 'user', user.id);
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return { ok: true };
  });

  on('GET', '/api/bootstrap', (req, res, { user }) => repo.bootstrap(user.id));
  on('PUT', '/api/settings', (req, res, { user, body }) => { repo.saveUserSettings(user.id, body); return { ok: true }; });

  on('PUT', '/api/shooters/:id', (req, res, { user, body, p }) => { repo.upsertShooter(user.username, { ...body, id: p.id }); return { ok: true }; });
  on('DELETE', '/api/shooters/:id', (req, res, { user, p }) => { repo.deleteEntity(user.username, 'shooters', 'shooter', p.id); return { ok: true }; });
  on('PUT', '/api/exercises/:id', (req, res, { user, body, p }) => { repo.upsertExercise(user.username, { ...body, id: p.id }); return { ok: true }; });
  on('DELETE', '/api/exercises/:id', (req, res, { user, p }) => { repo.deleteEntity(user.username, 'exercises', 'exercise', p.id); return { ok: true }; });
  on('PUT', '/api/sessions/:id', (req, res, { user, body, p }) => { repo.upsertSession(user.username, { ...body, id: p.id }); return { ok: true }; });
  on('DELETE', '/api/sessions/:id', (req, res, { user, p }) => { repo.deleteEntity(user.username, 'trainings', 'session', p.id); return { ok: true }; });
  on('PUT', '/api/sessions/:sid/runs/:id', (req, res, { user, body, p }) => repo.createRun(user.username, p.sid, { ...body, id: p.id }));
  on('PATCH', '/api/sessions/:sid/runs/:id', (req, res, { user, body, p }) => repo.updateRun(user.username, p.sid, p.id, body));
  on('DELETE', '/api/sessions/:sid/runs/:id', (req, res, { user, p }) => { repo.deleteRun(user.username, p.sid, p.id); return { ok: true }; });
  on('POST', '/api/import', (req, res, { user, body }) => repo.importData(user.username, body));

  on('GET', '/api/admin/users', () => ({ users: repo.listUsers() }), { admin: true });
  on('POST', '/api/admin/users', (req, res, { user, body }) => {
    const u = repo.createUser({ id: A.newId(), username: String(body.username || '').trim(), name: body.name, role: body.role, passwordHash: A.hashPassword(String(body.password || '')) });
    repo.audit(user.username, 'create', 'user', u.id, { username: u.username, role: u.role });
    return { user: { id: u.id, username: u.username, name: u.name, role: u.role } };
  }, { admin: true });
  on('POST', '/api/admin/users/:id/disable', (req, res, { user, p, body }) => {
    if (p.id === user.id) throw new HttpError(400, 'you cannot disable yourself');
    repo.setDisabled(p.id, body.disabled !== false); repo.audit(user.username, body.disabled !== false ? 'disable' : 'enable', 'user', p.id); return { ok: true };
  }, { admin: true });
  on('GET', '/api/admin/audit', () => ({ entries: repo.auditLog(300) }), { admin: true });

  async function api(req, res, pathname) {
    const route = routes.find(r => r.method === req.method && r.re.test(pathname));
    if (!route) { const any = routes.some(r => r.re.test(pathname)); return send(res, any ? 405 : 404, { error: any ? 'method not allowed' : 'not found' }); }
    // CSRF: state-changing requests must be same-origin JSON with our header (plus SameSite=Strict cookie)
    if (req.method !== 'GET' && req.headers['x-hitcore'] !== '1') throw new HttpError(403, 'missing X-HitCore header');
    const user = auth(req);
    if (!route.pub && !user) throw new HttpError(401, 'not signed in');
    if (route.admin && user.role !== 'admin') throw new HttpError(403, 'administrator only');
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
    const p = pathname.match(route.re).groups || {};
    const out = await route.handler(req, res, { user, body, p });
    send(res, 200, out);
  }

  // ---------- static files ----------
  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    if (rel === 'config.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' });
      return res.end(`window.HITCORE = ${JSON.stringify({ mode: 'api', version: require('../package.json').version })};\n`);
    }
    if (rel.includes('..') || !(STATIC.has(rel) || STATIC_DIRS.some(d => rel.startsWith(d)))) rel = 'index.html';
    const file = path.join(ROOT, rel);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag });
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const { pathname } = new URL(req.url, 'http://x');
    try {
      if (pathname.startsWith('/api/')) await api(req, res, pathname);
      else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, pathname);
      else send(res, 405, { error: 'method not allowed' });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) log.error?.(e);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? 'internal error' : e.message });
    }
  });
  server.on('close', () => { clearInterval(purge); repo.close(); });
  return { server, repo };
}

if (require.main === module) {
  const port = +process.env.PORT || 8080;
  const { server, repo } = createServer({ log: { info: m => console.log('[hitcore]', m), error: e => console.error('[hitcore]', e) } });
  server.listen(port, () => {
    console.log(`[hitcore] listening on http://localhost:${port}`);
    if (repo.userCount() === 0) console.log('[hitcore] no users yet – run: node server/manage.js add-user <username> "<Full Name>" --admin');
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

module.exports = { createServer };
