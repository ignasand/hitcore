'use strict';
// Demo content for a fresh database (HITCORE_SEED_DEMO=1 or `manage.js seed-demo`).
const { newId } = require('./auth');

function demoData(user) {
  const sh = [['Anna Kovalenko', 'Production', 'minor'], ['Tomas Berg', 'Standard', 'major'], ['Lukas Petrauskas', 'Open', 'major'], ['Greta Mills', 'Production Optics', 'minor']]
    .map(([name, division, pf]) => ({ id: newId(), name, division, pf, active: true, notes: '' }));
  const ex = [
    { name: 'Bill Drill', rounds: 6, requiredHits: 6, notes: '1 target, 7 m, 6 rounds from holster.' },
    { name: 'El Presidente', rounds: 12, requiredHits: 12, notes: '3 targets, 10 m, turn, 2 each – reload – 2 each.' },
    { name: 'Standard Exercise 16', rounds: 16, requiredHits: 16, notes: '8 paper targets, 2 hits each, freestyle.' },
  ].map(e => ({ id: newId(), ...e }));
  let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const day = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);
  const sess = { id: newId(), name: 'Tuesday club training', date: day, location: 'Indoor range, bay 2', notes: 'Sample data – feel free to delete.', shooterIds: sh.map(s => s.id), exerciseIds: ex.map(e => e.id), runs: [], createdAt: new Date(day).toISOString(), createdBy: user };
  sh.forEach((s, si) => ex.forEach(e => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const skill = 0.75 + si * 0.06 + attempt * 0.03;
      const n = e.rounds, splits = []; let t = 1.0 + rnd() * 0.5 + (1 - skill) * 0.8;
      for (let i = 0; i < n; i++) { if (i) t += (e.name === 'El Presidente' && i === 6 ? 1.6 : 0.22 + rnd() * 0.25) * (1.6 - skill); if (e.name === 'Standard Exercise 16' && i % 2 === 0 && i) t += 0.25; splits.push(+t.toFixed(2)); }
      let A = 0, C = 0, D = 0, M = 0;
      for (let i = 0; i < e.requiredHits; i++) { const x = rnd(); if (x < skill * 0.85) A++; else if (x < 0.93) C++; else if (x < 0.985) D++; else M++; }
      sess.runs.push({ id: newId(), shooterId: s.id, exerciseId: e.id, time: splits[n - 1], splits, A, C, D, M, NS: rnd() < 0.08 ? 1 : 0, P: 0, pf: s.pf, source: 'mic', createdAt: new Date(new Date(day).getTime() + 3600e3 * (18 + attempt) + si * 60e3).toISOString(), createdBy: user, history: [] });
    }
  }));
  return { version: 2, shooters: sh, exercises: ex, sessions: [sess] };
}

module.exports = { demoData };
