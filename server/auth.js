'use strict';
// Password hashing (scrypt) and opaque session tokens. Only a SHA-256 of each
// token is stored, so a leaked database can't be used to hijack sessions.
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw Object.assign(new Error('password must be at least 8 characters'), { status: 400 });
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, salt, key] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const want = Buffer.from(key, 'base64');
    const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(want, got);
  } catch (e) { return false; }
}
// Constant-ish time path for unknown users so response timing doesn't reveal usernames.
const DUMMY = hashPassword('not-a-real-password');

const newToken = () => crypto.randomBytes(32).toString('base64url');
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const newId = () => crypto.randomBytes(6).toString('base64url').replace(/[^\w]/g, 'x') + Date.now().toString(36).slice(-4);

// Simple fixed-window limiter for login attempts (per IP + username).
class Limiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.hits = new Map(); }
  check(key) {
    const t = Date.now(), h = this.hits.get(key);
    if (!h || t > h.reset) { this.hits.set(key, { n: 1, reset: t + this.windowMs }); return true; }
    h.n++; return h.n <= this.max;
  }
  clear(key) { this.hits.delete(key); }
}

module.exports = { hashPassword, verifyPassword, DUMMY, newToken, tokenHash, newId, Limiter };
