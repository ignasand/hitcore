const test = require('node:test');
const assert = require('node:assert');
const { Detector } = require('../js/timer.js');
const { IPSC } = require('../js/calc.js');

const SR = 48000;
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
function signal(sec, { beepAt, beepF = 3100, beepDur = 0.3, shots = [], noise = 0.005, beepAmp = 0.3 }) {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) x[i] = noise * rnd();
  if (beepAt != null) for (let i = 0; i < beepDur * SR; i++) { const k = Math.round(beepAt * SR) + i; x[k] += beepAmp * Math.sin(2 * Math.PI * beepF * i / SR); }
  for (const t of shots) for (let i = 0; i < 0.05 * SR; i++) { const k = Math.round(t * SR) + i; x[k] += 0.9 * rnd() * Math.exp(-i / (0.006 * SR)); }
  return x;
}
function run(x, det) { for (let i = 0; i < x.length; i += 1024) det.push(x.subarray(i, i + 1024)); }

test('learned beep starts clock, shots measured with ms accuracy', () => {
  const shots = [1.0 + 1.25, 1.0 + 1.53, 1.0 + 1.79, 1.0 + 2.6];
  const x = signal(5, { beepAt: 1.0, shots });
  const det = new Detector(SR, { beep: { freq: 3100, dur: 300 } });
  let beep = null; const got = [];
  det.onBeep = s => (beep = s); det.onShot = s => got.push((s - beep) / SR);
  det.mode = 'armed'; run(x, det);
  assert.ok(Math.abs(beep / SR - 1.0) < 0.003, 'beep onset ' + beep / SR);
  assert.strictEqual(got.length, 4, JSON.stringify(got));
  got.forEach((t, i) => assert.ok(Math.abs(t - (shots[i] - 1)) < 0.003, `${t} vs ${shots[i] - 1}`));
});

test('generic beep detection without learning; shots before beep ignored', () => {
  const x = signal(4, { beepAt: 1.5, beepF: 2700, shots: [0.5, 2.5] });
  const det = new Detector(SR, {});
  let beep = null; const got = [];
  det.onBeep = s => (beep = s); det.onShot = s => got.push((s - beep) / SR);
  det.mode = 'armed'; run(x, det);
  assert.ok(Math.abs(beep / SR - 1.5) < 0.003);
  assert.deepStrictEqual(got.map(t => t.toFixed(2)), ['1.00']);
});

test('learning captures beep frequency and duration', () => {
  const x = signal(2, { beepAt: 0.5, beepF: 2950, beepDur: 0.4 });
  const det = new Detector(SR, {}); let sig = null; det.onLearn = s => (sig = s);
  det.startLearn(); run(x, det);
  assert.ok(sig && sig.ok, JSON.stringify(sig));
  assert.ok(Math.abs(sig.freq - 2950) < 15, 'freq ' + sig.freq);
  assert.ok(Math.abs(sig.dur - 400) < 40, 'dur ' + sig.dur);
});

test('first-shot start does not trigger on the beep', () => {
  const det = new Detector(SR, {}); det.firstShotStart = true;
  let beep = null, freq = null; det.onBeep = (s, f) => { beep = s; freq = f; };
  det.mode = 'armed'; run(signal(3, { beepAt: 1, shots: [2] }), det);
  assert.ok(Math.abs(beep / SR - 1) < 0.003 && freq > 0);
  const d2 = new Detector(SR, {}); d2.firstShotStart = true; let b2 = null; d2.onBeep = s => (b2 = s);
  d2.mode = 'armed'; run(signal(3, { shots: [1.2] }), d2);
  assert.ok(Math.abs(b2 / SR - 1.2) < 0.003);
});

test('IPSC scoring', () => {
  const minor = IPSC.score({ A: 10, C: 1, D: 1, M: 0 }, 'minor', 5);
  assert.strictEqual(minor.points, 54); assert.ok(Math.abs(minor.hf - 10.8) < 1e-9);
  const major = IPSC.score({ A: 8, C: 2, D: 1, M: 1, NS: 1 }, 'major', 4);
  assert.strictEqual(major.points, 50); assert.strictEqual(major.penalty, 20); assert.ok(Math.abs(major.hf - 7.5) < 1e-9);
  assert.strictEqual(IPSC.score({ D: 1, M: 3 }, 'minor', 2).score, 0);
});
