const test = require('node:test');
const assert = require('node:assert');
global.IPSC = require('../js/calc.js').IPSC;
const { Reports } = require('../js/reports.js');

const shooters = [{ id: 'a', name: 'Ann', pf: 'minor' }, { id: 'b', name: 'Bob', pf: 'major' }];
const exercises = [{ id: 'x', name: 'Drill X', rounds: 4, requiredHits: 4 }, { id: 'y', name: 'Drill Y', rounds: 2, requiredHits: 2 }];
const run = (shooterId, exerciseId, time, A, C, extra = {}) => ({ id: Math.random() + '', shooterId, exerciseId, time, A, C, D: 0, M: 0, NS: 0, P: 0, pf: 'minor', splits: [1, 1.3, 1.5, time], createdAt: new Date().toISOString(), ...extra });
const sess = { id: 's', shooterIds: ['a', 'b'], exerciseIds: ['x', 'y'], runs: [
  run('a', 'x', 2, 4, 0),        // 20/2 = 10
  run('a', 'x', 4, 4, 0),        // 5 (worse repeat – best attempt counts)
  run('b', 'x', 2.5, 3, 1),      // 18/2.5 = 7.2
  run('b', 'y', 1, 2, 0),        // 10
] };
const store = { data: { sessions: [sess] }, shooter: id => shooters.find(s => s.id === id), exercise: id => exercises.find(e => e.id === id) };

test('session report ranks best attempt and computes IPSC stage points', () => {
  const rep = Reports.session(sess, store);
  const x = rep.exercises.find(e => e.exercise.id === 'x');
  assert.strictEqual(x.maxPoints, 20);
  assert.deepStrictEqual(x.ranked.map(r => r.shooter.name), ['Ann', 'Bob']);
  assert.strictEqual(x.ranked[0].attempts, 2);
  assert.ok(Math.abs(x.ranked[1].stagePoints - 20 * 7.2 / 10) < 1e-9);
  const ov = rep.overall;
  // Bob: 14.4 (x) + 10 (y, only shooter) = 24.4 ; Ann: 20 + 0
  assert.strictEqual(ov[0].shooter.name, 'Bob');
  assert.ok(Math.abs(ov[0].stagePoints - 24.4) < 1e-9);
  assert.strictEqual(ov[1].runs, 2);
});

test('run stats: draw, average split, accuracy', () => {
  const st = Reports.runStats(run('a', 'x', 2, 3, 1));
  assert.strictEqual(st.draw, 1);
  assert.ok(Math.abs(st.avgSplit - (2 - 1) / 3) < 1e-9);
  assert.strictEqual(st.accuracy, 0.75);
});

test('shooter report summarises progress per exercise', () => {
  const rep = Reports.shooter(shooters[0], store);
  assert.strictEqual(rep.rows.length, 2);
  const x = rep.exercises[0];
  assert.strictEqual(x.bestHF, 10); assert.strictEqual(x.attempts, 2); assert.strictEqual(x.bestTime, 2);
});

test('split grading: fixed targets, pause detection, personal baseline', () => {
  const g = Reports.gradeSplits([1.1, 1.3, 1.65, 2.2, 3.4, 3.62]);
  assert.deepStrictEqual(g.map(x => x.grade), ['fast', 'fast', 'ok', 'slow', 'pause', 'fast']);
  assert.strictEqual(g[0].kind, 'draw');
  const sum = Reports.splitSummary(g);
  assert.deepStrictEqual(sum.counts, { fast: 2, ok: 1, slow: 1, pause: 1 });
  assert.ok(Math.abs(sum.best - 0.2) < 1e-9);
  // personal baseline: median split 0.30 -> 0.25 is fast, 0.30 ok, 0.40 slow
  const p = Reports.gradeSplits([1.0, 1.25, 1.55, 1.95], {}, { draw: 1.0, split: 0.30 });
  assert.deepStrictEqual(p.map(x => x.grade), ['ok', 'fast', 'ok', 'slow']);
});

test('baseline needs history and ignores pauses', () => {
  const runs = [[1.2, 1.5, 1.8, 3.0, 3.3], [1.0, 1.25, 1.5, 1.75]].map((splits, i) => run('a', 'x', splits[splits.length - 1], 4, 0, { id: 'r' + i, splits }));
  const st = { data: { sessions: [{ runs }] } };
  const b = Reports.baseline(st, 'a', 'x');
  assert.strictEqual(b.runs, 2); assert.strictEqual(b.draw, 1.1);
  assert.ok(Math.abs(b.split - 0.25) < 0.051);
  assert.strictEqual(Reports.baseline(st, 'a', 'x', 'r0'), null);
});
