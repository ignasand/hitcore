// Persistent state in localStorage.
const Store = (() => {
  const KEY = 'hitcore.v1';
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const blank = () => ({
    sessions: [], currentSessionId: null,
    beepSig: null, beepCount: 0, sensitivity: 55, firstShotStart: false,
    delayMin: 1, delayMax: 4, pf: 'minor',
  });

  let state = blank();
  try { const raw = localStorage.getItem(KEY); if (raw) state = Object.assign(blank(), JSON.parse(raw)); } catch (e) {}

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); } };

  const api = {
    get state() { return state; },
    save,
    uid,
    session() { return state.sessions.find(s => s.id === state.currentSessionId) || null; },
    createSession(name) {
      const s = { id: uid(), name: name || new Date().toLocaleDateString(), date: new Date().toISOString(), participants: [], runs: [] };
      state.sessions.unshift(s); state.currentSessionId = s.id; save(); return s;
    },
    selectSession(id) { state.currentSessionId = id; save(); },
    deleteSession(id) {
      state.sessions = state.sessions.filter(s => s.id !== id);
      if (state.currentSessionId === id) state.currentSessionId = state.sessions[0]?.id || null;
      save();
    },
    addParticipant(name) {
      const s = api.session(); if (!s || !name) return;
      if (!s.participants.includes(name)) s.participants.push(name);
      save();
    },
    removeParticipant(name) { const s = api.session(); if (!s) return; s.participants = s.participants.filter(p => p !== name); save(); },
    addRun(run) { const s = api.session(); if (!s) return null; run.id = uid(); run.ts = Date.now(); s.runs.push(run); save(); return run; },
    deleteRun(id) { const s = api.session(); if (!s) return; s.runs = s.runs.filter(r => r.id !== id); save(); },
    exercises() {
      const set = new Set();
      state.sessions.forEach(s => s.runs.forEach(r => r.exercise && set.add(r.exercise)));
      return [...set];
    },
    set(k, v) { state[k] = v; save(); },
    replace(obj) { state = Object.assign(blank(), obj); save(); },
  };
  return api;
})();
