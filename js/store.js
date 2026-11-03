// Per-user persistent data (localStorage). Schema v2.
const Store = (() => {
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  let user = null, data = null;
  const key = () => 'hitcore.data.' + user;

  const DEFAULT_SETTINGS = { beepSig: null, beepCount: 0, sensitivity: 55, firstShotStart: false, delayMin: 1, delayMax: 4, overtimeSec: 2.5 };
  const blank = () => ({ version: 2, shooters: [], exercises: [], sessions: [], settings: { ...DEFAULT_SETTINGS } });

  function load(u) {
    user = u;
    try { data = JSON.parse(localStorage.getItem(key())); } catch (e) { data = null; }
    if (!data || data.version !== 2) { data = blank(); seed(data); migrateV1(data); save(); }
    data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    return data;
  }
  function save() { try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) { console.warn('save failed', e); } }

  // Pull in anything recorded with the first (v1) version of the app.
  function migrateV1(d) {
    let v1; try { v1 = JSON.parse(localStorage.getItem('hitcore.v1')); } catch (e) { return; }
    if (!v1 || !Array.isArray(v1.sessions)) return;
    const shooterId = name => (d.shooters.find(s => s.name === name) || addTo(d.shooters, { id: uid(), name, division: 'Production', pf: 'minor', active: true })).id;
    const exId = name => (d.exercises.find(e => e.name === name) || addTo(d.exercises, { id: uid(), name, rounds: 0, requiredHits: 0, notes: '' })).id;
    v1.sessions.forEach(s => {
      const sess = { id: s.id, name: s.name, date: s.date.slice(0, 10), location: '', notes: 'Imported from v1', shooterIds: s.participants.map(shooterId), exerciseIds: [], runs: [], createdAt: s.date };
      s.runs.forEach(r => {
        const e = exId(r.exercise); if (!sess.exerciseIds.includes(e)) sess.exerciseIds.push(e);
        sess.runs.push({ id: r.id, shooterId: shooterId(r.shooter), exerciseId: e, time: r.time, splits: r.splits || [], A: r.A, C: r.C, D: r.D, M: r.M, NS: r.NS, P: r.P, pf: r.pf, source: r.splits ? 'mic' : 'manual', createdAt: new Date(r.ts).toISOString(), history: [] });
      });
      d.sessions.push(sess);
    });
    if (v1.beepSig) { d.settings.beepSig = v1.beepSig; d.settings.beepCount = v1.beepCount || 1; }
  }
  const addTo = (arr, o) => (arr.push(o), o);

  // Demo content so a fresh login has something to explore.
  function seed(d) {
    const sh = [['Anna Kovalenko', 'Production', 'minor'], ['Tomas Berg', 'Standard', 'major'], ['Lukas Petrauskas', 'Open', 'major'], ['Greta Mills', 'Production Optics', 'minor']]
      .map(([name, division, pf]) => ({ id: uid(), name, division, pf, active: true, notes: '' }));
    const ex = [
      { name: 'Bill Drill', rounds: 6, requiredHits: 6, notes: '1 target, 7 m, 6 rounds from holster.' },
      { name: 'El Presidente', rounds: 12, requiredHits: 12, notes: '3 targets, 10 m, turn, 2 each – reload – 2 each.' },
      { name: 'Standard Exercise 16', rounds: 16, requiredHits: 16, notes: '8 paper targets, 2 hits each, freestyle.' },
    ].map(e => ({ id: uid(), ...e }));
    d.shooters = sh; d.exercises = ex;
    // a sample past session
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

  const api = {
    uid, load, save,
    get data() { return data; },
    get user() { return user; },
    shooter: id => data.shooters.find(s => s.id === id),
    exercise: id => data.exercises.find(e => e.id === id),
    session: id => data.sessions.find(s => s.id === id),
    upsert(coll, obj) {
      const arr = data[coll], i = arr.findIndex(x => x.id === obj.id);
      if (i >= 0) arr[i] = { ...arr[i], ...obj }; else arr.push({ id: uid(), ...obj });
      save(); return i >= 0 ? arr[i] : arr[arr.length - 1];
    },
    remove(coll, id) { data[coll] = data[coll].filter(x => x.id !== id); save(); },
    addRun(sessionId, run) {
      const s = api.session(sessionId);
      const r = { id: uid(), createdAt: new Date().toISOString(), createdBy: user, history: [], ...run };
      s.runs.push(r); save(); return r;
    },
    // Field-level audit trail for every correction.
    updateRun(sessionId, runId, patch) {
      const s = api.session(sessionId), r = s.runs.find(x => x.id === runId); if (!r) return;
      const changes = {};
      Object.keys(patch).forEach(k => { if (JSON.stringify(r[k]) !== JSON.stringify(patch[k])) changes[k] = [r[k], patch[k]]; });
      if (!Object.keys(changes).length) return r;
      Object.assign(r, patch); r.updatedAt = new Date().toISOString();
      (r.history ||= []).push({ at: r.updatedAt, by: user, changes });
      save(); return r;
    },
    deleteRun(sessionId, runId) { const s = api.session(sessionId); s.runs = s.runs.filter(r => r.id !== runId); save(); },
    setting(k, v) { data.settings[k] = v; save(); },
    exportJSON() { return JSON.stringify(data, null, 1); },
    importJSON(obj) {
      if (!obj || obj.version !== 2) throw new Error('Not a HitCore v2 backup');
      const merge = (coll) => { const m = new Map(data[coll].map(x => [x.id, x])); obj[coll].forEach(x => m.set(x.id, x)); data[coll] = [...m.values()]; };
      ['shooters', 'exercises', 'sessions'].forEach(merge); save();
    },
    resetDemo() { data = blank(); seed(data); save(); },
  };
  return api;
})();
