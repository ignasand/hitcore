'use strict';
// SQLite persistence (Node's built-in node:sqlite, no external dependencies).
// All writes go through prepared statements inside transactions.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS = [
  // v1 – initial schema
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'coach' CHECK (role IN ('admin','coach')),
    password_hash TEXT NOT NULL,
    settings      TEXT NOT NULL DEFAULT '{}',
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE auth_sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    user_agent  TEXT
  );
  CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
  CREATE TABLE shooters (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    division   TEXT NOT NULL DEFAULT '',
    pf         TEXT NOT NULL DEFAULT 'minor' CHECK (pf IN ('minor','major')),
    notes      TEXT NOT NULL DEFAULT '',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE exercises (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    rounds        INTEGER NOT NULL CHECK (rounds >= 0),
    required_hits INTEGER NOT NULL CHECK (required_hits >= 0),
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE TABLE trainings (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    date       TEXT NOT NULL,
    location   TEXT NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    created_by TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE training_shooters (
    training_id TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
    shooter_id  TEXT NOT NULL REFERENCES shooters(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (training_id, shooter_id)
  );
  CREATE TABLE training_exercises (
    training_id TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (training_id, exercise_id)
  );
  CREATE TABLE runs (
    id          TEXT PRIMARY KEY,
    training_id TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
    shooter_id  TEXT NOT NULL REFERENCES shooters(id) ON DELETE RESTRICT,
    exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    time        REAL NOT NULL CHECK (time > 0),
    splits      TEXT NOT NULL DEFAULT '[]',
    a  INTEGER NOT NULL DEFAULT 0 CHECK (a  >= 0),
    c  INTEGER NOT NULL DEFAULT 0 CHECK (c  >= 0),
    d  INTEGER NOT NULL DEFAULT 0 CHECK (d  >= 0),
    m  INTEGER NOT NULL DEFAULT 0 CHECK (m  >= 0),
    ns INTEGER NOT NULL DEFAULT 0 CHECK (ns >= 0),
    p  INTEGER NOT NULL DEFAULT 0 CHECK (p  >= 0),
    pf          TEXT NOT NULL DEFAULT 'minor' CHECK (pf IN ('minor','major')),
    notes       TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  TEXT NOT NULL,
    created_by  TEXT,
    updated_at  TEXT
  );
  CREATE INDEX runs_training ON runs(training_id);
  CREATE INDEX runs_shooter_ex ON runs(shooter_id, exercise_id);
  CREATE TABLE run_history (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id  TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    at      TEXT NOT NULL,
    by      TEXT,
    changes TEXT NOT NULL
  );
  CREATE INDEX run_history_run ON run_history(run_id);
  CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL,
    username  TEXT,
    action    TEXT NOT NULL,
    entity    TEXT NOT NULL,
    entity_id TEXT,
    detail    TEXT
  );
  `,
];

const now = () => new Date().toISOString();
const RUN_FIELDS = { time: 'time', splits: 'splits', A: 'a', C: 'c', D: 'd', M: 'm', NS: 'ns', P: 'p', pf: 'pf', notes: 'notes' };

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  const ver = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = ver; v < MIGRATIONS.length; v++) {
    tx(db, () => { db.exec(MIGRATIONS[v]); db.exec(`PRAGMA user_version = ${v + 1}`); });
  }
  return new Repo(db);
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- validation ----------
const str = (v, max = 500, def = '') => (v == null ? def : String(v)).slice(0, max);
const int = (v, name) => { const n = Number(v ?? 0); if (!Number.isInteger(n) || n < 0 || n > 10000) throw new HttpError(400, `${name} must be a non-negative integer`); return n; };
const id = v => { if (typeof v !== 'string' || !/^[\w-]{4,64}$/.test(v)) throw new HttpError(400, 'invalid id'); return v; };
const pf = v => (v === 'major' ? 'major' : 'minor');
const ids = v => (Array.isArray(v) ? v : []).map(id);
function splits(v) {
  if (!Array.isArray(v) || v.length > 500) throw new HttpError(400, 'splits must be an array');
  return v.map(x => { const n = Number(x); if (!(n >= 0 && n < 3600)) throw new HttpError(400, 'invalid split'); return Math.round(n * 1000) / 1000; });
}
function time(v) { const n = Number(v); if (!(n > 0 && n < 3600)) throw new HttpError(400, 'time must be > 0'); return Math.round(n * 1000) / 1000; }

class Repo {
  constructor(db) { this.db = db; }
  close() { this.db.close(); }
  tx(fn) { return tx(this.db, fn); }
  audit(user, action, entity, entityId, detail) {
    this.db.prepare('INSERT INTO audit_log (at, username, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)')
      .run(now(), user || null, action, entity, entityId || null, detail ? JSON.stringify(detail) : null);
  }

  // ---------- users & auth sessions ----------
  userCount() { return this.db.prepare('SELECT COUNT(*) n FROM users').get().n; }
  userByName(username) { return this.db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '')); }
  userById(uid) { return this.db.prepare('SELECT * FROM users WHERE id = ?').get(uid); }
  listUsers() { return this.db.prepare('SELECT id, username, name, role, disabled, created_at FROM users ORDER BY username').all(); }
  createUser({ id: uid, username, name, role = 'coach', passwordHash }) {
    if (!/^[a-z0-9._-]{2,40}$/i.test(username || '')) throw new HttpError(400, 'username: 2-40 chars, letters/digits/._-');
    if (this.userByName(username)) throw new HttpError(409, 'username already exists');
    this.db.prepare('INSERT INTO users (id, username, name, role, password_hash, created_at) VALUES (?,?,?,?,?,?)')
      .run(uid, username.toLowerCase(), str(name, 80) || username, role === 'admin' ? 'admin' : 'coach', passwordHash, now());
    return this.userByName(username);
  }
  setPassword(uid, passwordHash) {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, uid);
    this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(uid);
  }
  setDisabled(uid, disabled) {
    this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, uid);
    if (disabled) this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(uid);
  }
  saveUserSettings(uid, settings) {
    const json = JSON.stringify(settings ?? {});
    if (json.length > 20000) throw new HttpError(413, 'settings too large');
    this.db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(json, uid);
  }
  createAuthSession(tokenHash, uid, ttlMs, ua) {
    const t = now();
    this.db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, last_seen, user_agent) VALUES (?,?,?,?,?,?)')
      .run(tokenHash, uid, t, new Date(Date.now() + ttlMs).toISOString(), t, str(ua, 200));
  }
  authSession(tokenHash) {
    const s = this.db.prepare(`SELECT s.*, u.username, u.name, u.role, u.disabled FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(tokenHash);
    if (!s) return null;
    if (s.expires_at < now() || s.disabled) { this.deleteAuthSession(tokenHash); return null; }
    this.db.prepare('UPDATE auth_sessions SET last_seen = ? WHERE token_hash = ?').run(now(), tokenHash);
    return s;
  }
  deleteAuthSession(tokenHash) { this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash); }
  purgeExpired() { this.db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now()); }

  // ---------- read model (same shape the web client uses) ----------
  bootstrap(uid) {
    const db = this.db;
    const shooters = db.prepare('SELECT * FROM shooters ORDER BY name').all().map(s => ({ id: s.id, name: s.name, division: s.division, pf: s.pf, notes: s.notes, active: !!s.active }));
    const exercises = db.prepare('SELECT * FROM exercises ORDER BY created_at, name').all().map(e => ({ id: e.id, name: e.name, rounds: e.rounds, requiredHits: e.required_hits, notes: e.notes }));
    const ts = db.prepare('SELECT training_id, shooter_id FROM training_shooters ORDER BY position').all();
    const te = db.prepare('SELECT training_id, exercise_id FROM training_exercises ORDER BY position').all();
    const hist = {};
    db.prepare('SELECT * FROM run_history ORDER BY id').all().forEach(h => (hist[h.run_id] ||= []).push({ at: h.at, by: h.by, changes: JSON.parse(h.changes) }));
    const runs = {};
    db.prepare('SELECT * FROM runs ORDER BY created_at').all().forEach(r => (runs[r.training_id] ||= []).push(runOut(r, hist[r.id])));
    const sessions = db.prepare('SELECT * FROM trainings ORDER BY date DESC, created_at DESC').all().map(t => ({
      id: t.id, name: t.name, date: t.date, location: t.location, notes: t.notes, createdAt: t.created_at, createdBy: t.created_by,
      shooterIds: ts.filter(x => x.training_id === t.id).map(x => x.shooter_id),
      exerciseIds: te.filter(x => x.training_id === t.id).map(x => x.exercise_id),
      runs: runs[t.id] || [],
    }));
    const u = this.userById(uid);
    return { version: 2, shooters, exercises, sessions, settings: u ? JSON.parse(u.settings || '{}') : {} };
  }

  // ---------- writes ----------
  upsertShooter(user, s) {
    const t = now(), rec = { id: id(s.id), name: str(s.name, 80).trim(), division: str(s.division, 40), pf: pf(s.pf), notes: str(s.notes, 1000), active: s.active === false ? 0 : 1 };
    if (!rec.name) throw new HttpError(400, 'name is required');
    this.tx(() => {
      this.db.prepare(`INSERT INTO shooters (id, name, division, pf, notes, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, division=excluded.division, pf=excluded.pf, notes=excluded.notes, active=excluded.active, updated_at=excluded.updated_at`)
        .run(rec.id, rec.name, rec.division, rec.pf, rec.notes, rec.active, t, t);
      this.audit(user, 'upsert', 'shooter', rec.id, { name: rec.name });
    });
  }
  upsertExercise(user, e) {
    const t = now(), rec = { id: id(e.id), name: str(e.name, 80).trim(), rounds: int(e.rounds, 'rounds'), required: int(e.requiredHits, 'requiredHits'), notes: str(e.notes, 1000) };
    if (!rec.name) throw new HttpError(400, 'name is required');
    this.tx(() => {
      this.db.prepare(`INSERT INTO exercises (id, name, rounds, required_hits, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, rounds=excluded.rounds, required_hits=excluded.required_hits, notes=excluded.notes, updated_at=excluded.updated_at`)
        .run(rec.id, rec.name, rec.rounds, rec.required, rec.notes, t, t);
      this.audit(user, 'upsert', 'exercise', rec.id, { name: rec.name });
    });
  }
  deleteEntity(user, table, entity, eid) {
    id(eid);
    this.tx(() => {
      try { this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(eid); }
      catch (e) { if (/FOREIGN KEY/i.test(e.message)) throw new HttpError(409, `${entity} has recorded runs and can't be deleted`); throw e; }
      this.audit(user, 'delete', entity, eid);
    });
  }
  upsertSession(user, s) {
    const t = now();
    const rec = { id: id(s.id), name: str(s.name, 120).trim(), date: str(s.date, 10), location: str(s.location, 120), notes: str(s.notes, 2000) };
    if (!rec.name) throw new HttpError(400, 'name is required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
    const shooterIds = ids(s.shooterIds), exerciseIds = ids(s.exerciseIds);
    this.tx(() => {
      this.db.prepare(`INSERT INTO trainings (id, name, date, location, notes, created_at, created_by, updated_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, date=excluded.date, location=excluded.location, notes=excluded.notes, updated_at=excluded.updated_at`)
        .run(rec.id, rec.name, rec.date, rec.location, rec.notes, s.createdAt || t, user || null, t);
      this.db.prepare('DELETE FROM training_shooters WHERE training_id = ?').run(rec.id);
      this.db.prepare('DELETE FROM training_exercises WHERE training_id = ?').run(rec.id);
      const insS = this.db.prepare('INSERT OR IGNORE INTO training_shooters (training_id, shooter_id, position) VALUES (?,?,?)');
      const insE = this.db.prepare('INSERT OR IGNORE INTO training_exercises (training_id, exercise_id, position) VALUES (?,?,?)');
      try {
        shooterIds.forEach((x, i) => insS.run(rec.id, x, i));
        exerciseIds.forEach((x, i) => insE.run(rec.id, x, i));
      } catch (e) { if (/FOREIGN KEY/i.test(e.message)) throw new HttpError(422, 'unknown shooter or exercise'); throw e; }
      this.audit(user, 'upsert', 'session', rec.id, { name: rec.name });
    });
  }
  // Idempotent create: retrying the same request (e.g. after a dropped connection) is a no-op.
  createRun(user, sessionId, r) {
    const t = now();
    const rec = { id: id(r.id), shooter: id(r.shooterId), exercise: id(r.exerciseId), time: time(r.time), splits: splits(r.splits || []),
      a: int(r.A, 'A'), c: int(r.C, 'C'), d: int(r.D, 'D'), m: int(r.M, 'M'), ns: int(r.NS, 'NS'), p: int(r.P, 'P'),
      pf: pf(r.pf), notes: str(r.notes, 2000), source: r.source === 'mic' ? 'mic' : 'manual' };
    id(sessionId);
    return this.tx(() => {
      if (!this.db.prepare('SELECT 1 FROM trainings WHERE id = ?').get(sessionId)) throw new HttpError(404, 'session not found');
      try {
        const res = this.db.prepare(`INSERT INTO runs (id, training_id, shooter_id, exercise_id, time, splits, a, c, d, m, ns, p, pf, notes, source, created_at, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
          .run(rec.id, sessionId, rec.shooter, rec.exercise, rec.time, JSON.stringify(rec.splits), rec.a, rec.c, rec.d, rec.m, rec.ns, rec.p, rec.pf, rec.notes, rec.source, r.createdAt || t, user || null);
        if (res.changes) this.audit(user, 'create', 'run', rec.id, { session: sessionId, time: rec.time });
        return { created: !!res.changes };
      } catch (e) { if (/FOREIGN KEY/i.test(e.message)) throw new HttpError(422, 'unknown shooter or exercise'); throw e; }
    });
  }
  // Field-level update; every actual change is written to run_history.
  updateRun(user, sessionId, runId, patch) {
    id(runId);
    return this.tx(() => {
      const cur = this.db.prepare('SELECT * FROM runs WHERE id = ? AND training_id = ?').get(runId, sessionId);
      if (!cur) throw new HttpError(404, 'run not found');
      const before = runOut(cur), changes = {}, set = {};
      for (const [k, col] of Object.entries(RUN_FIELDS)) {
        if (!(k in patch)) continue;
        let v = patch[k];
        if (k === 'time') v = time(v); else if (k === 'splits') v = splits(v); else if (k === 'pf') v = pf(v); else if (k === 'notes') v = str(v, 2000); else v = int(v, k);
        if (JSON.stringify(before[k]) !== JSON.stringify(v)) { changes[k] = [before[k], v]; set[col] = k === 'splits' ? JSON.stringify(v) : v; }
      }
      if (!Object.keys(changes).length) return { changed: false };
      const t = now(), cols = Object.keys(set);
      this.db.prepare(`UPDATE runs SET ${cols.map(c => c + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map(c => set[c]), t, runId);
      this.db.prepare('INSERT INTO run_history (run_id, at, by, changes) VALUES (?,?,?,?)').run(runId, patch.at || t, user || null, JSON.stringify(changes));
      this.audit(user, 'update', 'run', runId, changes);
      return { changed: true };
    });
  }
  deleteRun(user, sessionId, runId) {
    id(runId);
    this.tx(() => { this.db.prepare('DELETE FROM runs WHERE id = ? AND training_id = ?').run(runId, sessionId); this.audit(user, 'delete', 'run', runId); });
  }
  importData(user, data) {
    if (!data || !Array.isArray(data.sessions)) throw new HttpError(400, 'not a HitCore backup');
    return this.tx(() => {
      (data.shooters || []).forEach(s => this.upsertShooterRaw(s));
      (data.exercises || []).forEach(e => this.upsertExerciseRaw(e));
      let runs = 0;
      data.sessions.forEach(s => {
        this.upsertSessionRaw(user, s);
        (s.runs || []).forEach(r => { this.createRunRaw(user, s.id, r); runs++; });
      });
      this.audit(user, 'import', 'backup', null, { sessions: data.sessions.length, runs });
      return { sessions: data.sessions.length, runs };
    });
  }
  // "raw" variants run inside an outer transaction
  upsertShooterRaw(s) { const t = now(); this.db.prepare(`INSERT INTO shooters (id, name, division, pf, notes, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, division=excluded.division, pf=excluded.pf, notes=excluded.notes, active=excluded.active, updated_at=excluded.updated_at`).run(id(s.id), str(s.name, 80) || 'Unnamed', str(s.division, 40), pf(s.pf), str(s.notes, 1000), s.active === false ? 0 : 1, t, t); }
  upsertExerciseRaw(e) { const t = now(); this.db.prepare(`INSERT INTO exercises (id, name, rounds, required_hits, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, rounds=excluded.rounds, required_hits=excluded.required_hits, notes=excluded.notes, updated_at=excluded.updated_at`).run(id(e.id), str(e.name, 80) || 'Exercise', int(e.rounds, 'rounds'), int(e.requiredHits, 'requiredHits'), str(e.notes, 1000), t, t); }
  upsertSessionRaw(user, s) {
    const t = now();
    this.db.prepare(`INSERT INTO trainings (id, name, date, location, notes, created_at, created_by, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, date=excluded.date, location=excluded.location, notes=excluded.notes, updated_at=excluded.updated_at`)
      .run(id(s.id), str(s.name, 120) || 'Session', str(s.date, 10) || t.slice(0, 10), str(s.location, 120), str(s.notes, 2000), s.createdAt || t, s.createdBy || user || null, t);
    ids(s.shooterIds).forEach((x, i) => this.db.prepare('INSERT OR IGNORE INTO training_shooters (training_id, shooter_id, position) VALUES (?,?,?)').run(s.id, x, i));
    ids(s.exerciseIds).forEach((x, i) => this.db.prepare('INSERT OR IGNORE INTO training_exercises (training_id, exercise_id, position) VALUES (?,?,?)').run(s.id, x, i));
  }
  createRunRaw(user, sid, r) {
    this.db.prepare(`INSERT INTO runs (id, training_id, shooter_id, exercise_id, time, splits, a, c, d, m, ns, p, pf, notes, source, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
      .run(id(r.id), sid, id(r.shooterId), id(r.exerciseId), time(r.time), JSON.stringify(splits(r.splits || [])), int(r.A, 'A'), int(r.C, 'C'), int(r.D, 'D'), int(r.M, 'M'), int(r.NS, 'NS'), int(r.P, 'P'), pf(r.pf), str(r.notes, 2000), r.source === 'mic' ? 'mic' : 'manual', r.createdAt || now(), r.createdBy || user || null);
    (r.history || []).forEach(h => this.db.prepare('INSERT INTO run_history (run_id, at, by, changes) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM run_history WHERE run_id = ? AND at = ?)').run(r.id, h.at, h.by || null, JSON.stringify(h.changes || {}), r.id, h.at));
  }
  auditLog(limit = 200) { return this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit); }
}

function runOut(r, history) {
  return { id: r.id, shooterId: r.shooter_id, exerciseId: r.exercise_id, time: r.time, splits: JSON.parse(r.splits || '[]'),
    A: r.a, C: r.c, D: r.d, M: r.m, NS: r.ns, P: r.p, pf: r.pf, notes: r.notes, source: r.source,
    createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at || undefined, history: history || [] };
}

module.exports = { open, HttpError };
