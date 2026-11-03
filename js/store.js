// Data layer.
//  demo mode – in-memory sample data, nothing is saved (GitHub Pages).
//  api mode  – server database is the source of truth. Every change is applied locally
//              at once, written to a durable outbox on the device and synced to the
//              server in order with retries, so results recorded offline at the range
//              are never lost. Requests are idempotent (client-generated ids).
const Store = (() => {
  const MODE = (window.HITCORE && window.HITCORE.mode) === 'api' ? 'api' : 'demo';
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const DEFAULT_SETTINGS = { beepSig: null, beepCount: 0, sensitivity: 55, firstShotStart: false, delayMin: 1, delayMax: 4, overtimeSec: 2.5,
    grade: { mode: 'targets', drawFast: 1.2, drawOk: 1.6, splitFast: 0.25, splitOk: 0.40, pause: 0.9 } };
  const blank = () => ({ version: 2, shooters: [], exercises: [], sessions: [], settings: clone(DEFAULT_SETTINGS) });
  const clone = o => JSON.parse(JSON.stringify(o));

  let user = null, data = null;
  let outbox = [], flushing = false, retryTimer = null, backoff = 2000, lastSync = null, lastError = null, online = true;
  const listeners = {};
  const emit = (ev, ...a) => (listeners[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } });

  // ---------- local durable storage (api mode only) ----------
  const k = name => `hitcore.${name}.${user}`;
  const readLS = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  const writeLS = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { console.warn('storage failed', e); return false; } };
  const persistCache = () => { if (MODE === 'api') writeLS(k('cache'), data); };
  const persistOutbox = () => { if (MODE === 'api') writeLS(k('outbox'), outbox); };

  function normalize(d) {
    d = d || blank();
    d.settings = { ...clone(DEFAULT_SETTINGS), ...(d.settings || {}), grade: { ...DEFAULT_SETTINGS.grade, ...((d.settings || {}).grade || {}) } };
    d.shooters ||= []; d.exercises ||= []; d.sessions ||= [];
    d.sessions.forEach(s => { s.runs ||= []; s.shooterIds ||= []; s.exerciseIds ||= []; s.runs.forEach(r => r.history ||= []); });
    return d;
  }

  // ---------- server sync ----------
  async function request(method, path, body) {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-HitCore': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null; try { json = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error((json && json.error) || res.statusText || 'request failed'); err.status = res.status; throw err; }
    return json;
  }
  function status() {
    if (MODE === 'demo') return { mode: MODE, state: 'demo', pending: 0 };
    const state = lastError === 'auth' ? 'auth' : !online ? 'offline' : (flushing || outbox.length) ? 'saving' : lastError ? 'error' : 'saved';
    return { mode: MODE, state, pending: outbox.length, lastSync, error: lastError };
  }
  const notify = () => emit('status', status());

  function enqueue(op) {
    if (MODE !== 'api') return;
    // coalesce settings writes: keep only the newest queued one (never touch the in-flight head)
    if (op.coalesce) outbox = outbox.filter((o, i) => o.coalesce !== op.coalesce || (i === 0 && flushing));
    outbox.push({ id: uid(), at: new Date().toISOString(), ...op });
    persistOutbox(); notify(); flush();
  }
  async function flush() {
    if (MODE !== 'api' || flushing || !outbox.length || lastError === 'auth') return;
    flushing = true; clearTimeout(retryTimer); notify();
    try {
      while (outbox.length) {
        const op = outbox[0];
        try {
          await request(op.method, op.path, op.body);
          online = true; lastError = null; backoff = 2000;
        } catch (e) {
          if (!e.status || e.status >= 500 || e.status === 429) {          // network / server trouble → retry later
            online = !!e.status; lastError = e.status ? 'server' : null;
            retryTimer = setTimeout(flush, backoff); backoff = Math.min(backoff * 2, 60000);
            break;
          }
          if (e.status === 401) { lastError = 'auth'; emit('auth'); break; } // keep the queue, ask to sign in again
          emit('rejected', `${op.label || 'Change'} was rejected by the server: ${e.message}`); // 4xx: drop, then reconcile
          outbox.shift(); persistOutbox(); scheduleRefresh();
          continue;
        }
        outbox.shift(); persistOutbox(); lastSync = new Date().toISOString();
      }
    } finally { flushing = false; notify(); }
  }
  let refreshTimer = null;
  const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => api.refresh(), 800); };
  window.addEventListener('online', () => { online = true; backoff = 2000; flush(); });
  window.addEventListener('offline', () => { online = false; notify(); });

  // ---------- demo seed ----------
  function seed(d) {
    const sh = [['Anna Kovalenko', 'Production', 'minor'], ['Tomas Berg', 'Standard', 'major'], ['Lukas Petrauskas', 'Open', 'major'], ['Greta Mills', 'Production Optics', 'minor']]
      .map(([name, division, pf]) => ({ id: uid(), name, division, pf, active: true, notes: '' }));
    const ex = [
      { name: 'Bill Drill', rounds: 6, requiredHits: 6, notes: '1 target, 7 m, 6 rounds from holster.' },
      { name: 'El Presidente', rounds: 12, requiredHits: 12, notes: '3 targets, 10 m, turn, 2 each – reload – 2 each.' },
      { name: 'Standard Exercise 16', rounds: 16, requiredHits: 16, notes: '8 paper targets, 2 hits each, freestyle.' },
    ].map(e => ({ id: uid(), ...e }));
    d.shooters = sh; d.exercises = ex;
    let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const day = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);
    const sess = { id: uid(), name: 'Tuesday club training', date: day, location: 'Indoor range, bay 2', notes: 'Sample data – feel free to delete.', shooterIds: sh.map(s => s.id), exerciseIds: ex.map(e => e.id), runs: [], createdAt: new Date(day).toISOString() };
    sh.forEach((s, si) => ex.forEach(e => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const skill = 0.75 + si * 0.06 + attempt * 0.03;
        const n = e.rounds, splits = []; let t = 1.0 + rnd() * 0.5 + (1 - skill) * 0.8;
        for (let i = 0; i < n; i++) { if (i) t += (e.name === 'El Presidente' && i === 6 ? 1.6 : 0.22 + rnd() * 0.25) * (1.6 - skill); if (e.name === 'Standard Exercise 16' && i % 2 === 0 && i) t += 0.25; splits.push(+t.toFixed(2)); }
        let A = 0, C = 0, D = 0, M = 0;
        for (let i = 0; i < e.requiredHits; i++) { const x = rnd(); if (x < skill * 0.85) A++; else if (x < 0.93) C++; else if (x < 0.985) D++; else M++; }
        sess.runs.push({ id: uid(), shooterId: s.id, exerciseId: e.id, time: splits[n - 1], splits, A, C, D, M, NS: rnd() < 0.08 ? 1 : 0, P: 0, pf: s.pf, source: 'mic', createdAt: new Date(new Date(day).getTime() + 3600e3 * (18 + attempt) + si * 60e3).toISOString(), history: [] });
      }
    }));
    d.sessions.push(sess);
  }

  const sessionBody = s => ({ name: s.name, date: s.date, location: s.location || '', notes: s.notes || '', shooterIds: s.shooterIds, exerciseIds: s.exerciseIds, createdAt: s.createdAt });
  const COLL = { shooters: 'shooters', exercises: 'exercises', sessions: 'sessions' };
  const LABEL = { shooters: 'Shooter', exercises: 'Exercise', sessions: 'Session' };

  const api = {
    MODE, uid,
    get data() { return data; },
    get user() { return user; },
    get status() { return status(); },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },

    // Load data for a signed-in user. In api mode: show cached data instantly if the
    // server can't be reached, otherwise sync pending changes and fetch fresh data.
    async init(u) {
      user = u; lastError = null; outbox = []; data = null;
      if (MODE === 'demo') { data = blank(); seed(data); return data; }
      outbox = readLS(k('outbox')) || [];
      const cached = readLS(k('cache'));
      try {
        if (outbox.length) await flush();
        if (outbox.length && cached) throw Object.assign(new Error('pending'), { keepCache: true });
        data = normalize(await request('GET', 'api/bootstrap'));
        online = true; lastSync = new Date().toISOString(); persistCache();
      } catch (e) {
        if (e.status === 401) { lastError = 'auth'; throw e; }
        if (!cached) throw new Error('Can’t reach the HitCore server and there is no offline copy on this device yet.');
        data = normalize(cached); online = !!e.keepCache;
      }
      notify();
      return data;
    },
    // Re-read from the server (other coaches' changes). Skipped while changes are pending.
    async refresh() {
      if (MODE !== 'api' || outbox.length || flushing) return false;
      try { data = normalize(await request('GET', 'api/bootstrap')); online = true; lastSync = new Date().toISOString(); persistCache(); notify(); emit('changed'); return true; }
      catch (e) { if (e.status === 401) { lastError = 'auth'; emit('auth'); } else if (!e.status) { online = false; } notify(); return false; }
    },
    syncNow() { backoff = 2000; if (lastError === 'server') lastError = null; return flush(); },
    resumeAfterLogin() { if (lastError === 'auth') lastError = null; flush(); },
    request,
    discardLocal() { if (user) { try { localStorage.removeItem(k('cache')); localStorage.removeItem(k('outbox')); } catch (e) {} } outbox = []; },

    shooter: id => data.shooters.find(s => s.id === id),
    exercise: id => data.exercises.find(e => e.id === id),
    session: id => data.sessions.find(s => s.id === id),

    upsert(coll, obj) {
      const arr = data[coll], i = obj.id ? arr.findIndex(x => x.id === obj.id) : -1;
      let rec;
      if (i >= 0) rec = arr[i] = { ...arr[i], ...obj };
      else { rec = { id: uid(), ...obj }; if (coll === 'sessions') { rec.runs ||= []; rec.createdAt ||= new Date().toISOString(); rec.createdBy ||= user; } arr.push(rec); }
      persistCache();
      const body = coll === 'sessions' ? sessionBody(rec) : { ...rec };
      enqueue({ method: 'PUT', path: `api/${COLL[coll]}/${rec.id}`, body, label: `${LABEL[coll]} “${rec.name}”` });
      return rec;
    },
    remove(coll, id) {
      data[coll] = data[coll].filter(x => x.id !== id);
      if (coll === 'shooters') data.sessions.forEach(s => s.shooterIds = s.shooterIds.filter(x => x !== id));
      if (coll === 'exercises') data.sessions.forEach(s => s.exerciseIds = s.exerciseIds.filter(x => x !== id));
      persistCache();
      enqueue({ method: 'DELETE', path: `api/${COLL[coll]}/${id}`, label: `Deleting ${LABEL[coll].toLowerCase()}` });
    },
    addRun(sessionId, run) {
      const s = api.session(sessionId);
      const r = { id: uid(), createdAt: new Date().toISOString(), createdBy: user, history: [], ...run };
      s.runs.push(r); persistCache();
      const { history, ...body } = r;
      enqueue({ method: 'PUT', path: `api/sessions/${sessionId}/runs/${r.id}`, body, label: 'Run result' });
      return r;
    },
    // Field-level audit trail for every correction (the server keeps its own authoritative copy).
    updateRun(sessionId, runId, patch) {
      const s = api.session(sessionId), r = s.runs.find(x => x.id === runId); if (!r) return;
      const changes = {};
      Object.keys(patch).forEach(key => { if (JSON.stringify(r[key]) !== JSON.stringify(patch[key])) changes[key] = [r[key], patch[key]]; });
      if (!Object.keys(changes).length) return r;
      const at = new Date().toISOString();
      Object.assign(r, patch); r.updatedAt = at;
      (r.history ||= []).push({ at, by: user, changes });
      persistCache();
      enqueue({ method: 'PATCH', path: `api/sessions/${sessionId}/runs/${runId}`, body: { ...Object.fromEntries(Object.keys(changes).map(key => [key, patch[key]])), at }, label: 'Run correction' });
      return r;
    },
    deleteRun(sessionId, runId) {
      const s = api.session(sessionId); s.runs = s.runs.filter(r => r.id !== runId); persistCache();
      enqueue({ method: 'DELETE', path: `api/sessions/${sessionId}/runs/${runId}`, label: 'Deleting run' });
    },
    setting(key, v) {
      data.settings[key] = v; persistCache();
      clearTimeout(api._st); api._st = setTimeout(() => enqueue({ method: 'PUT', path: 'api/settings', body: data.settings, coalesce: 'settings', label: 'Settings' }), 500);
    },
    exportJSON() { return JSON.stringify(data, null, 1); },
    importJSON(obj) {
      if (!obj || obj.version !== 2 || !Array.isArray(obj.sessions)) throw new Error('Not a HitCore backup');
      const merge = coll => { const m = new Map(data[coll].map(x => [x.id, x])); (obj[coll] || []).forEach(x => m.set(x.id, x)); data[coll] = [...m.values()]; };
      ['shooters', 'exercises', 'sessions'].forEach(merge); normalize(data); persistCache();
      enqueue({ method: 'POST', path: 'api/import', body: { shooters: obj.shooters || [], exercises: obj.exercises || [], sessions: obj.sessions }, label: 'Backup import' });
    },
    resetDemo() { if (MODE === 'demo') { data = blank(); seed(data); } },
    // Data saved by older builds in this browser (before the server existed).
    legacyData() {
      const found = [];
      try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (/^hitcore\.(data\.|v1$)/.test(key)) found.push(key); } } catch (e) {}
      return found.map(key => ({ key, data: readLS(key) })).filter(x => x.data && Array.isArray(x.data.sessions) && x.data.sessions.some(s => (s.runs || []).length));
    },
  };
  return api;
})();
