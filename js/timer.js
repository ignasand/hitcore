// Shot timer: pure DSP detector + browser audio wiring.
// All timestamps are in samples since capture started, so timing precision is
// independent of main-thread jitter.

function goertzelPower(x, start, n, freq, sr) {
  const w = 2 * Math.PI * freq / sr, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    // Hann window
    const s0 = x[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))) + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

// Fraction of window energy concentrated at `freq` (≈1 for a pure tone, ≈0 for noise / gunshot).
function tonalRatio(x, start, n, freq, sr) {
  let e = 0;
  for (let i = 0; i < n; i++) e += x[start + i] * x[start + i];
  if (e < 1e-9) return { ratio: 0, rms: 0 };
  // Hann window: tone power ≈ (A·n/4)², energy ≈ n·A²/2  ->  normalise by e·n/8 (3/8 for window energy loss)
  const bin = sr / n;
  const p = Math.max(goertzelPower(x, start, n, freq, sr), goertzelPower(x, start, n, freq - bin / 2, sr), goertzelPower(x, start, n, freq + bin / 2, sr));
  return { ratio: Math.min(1, p / (e * n / 8)), rms: Math.sqrt(e / n) };
}

const dbToAmp = db => Math.pow(10, db / 20);

class Detector {
  constructor(sr, opts = {}) {
    this.sr = sr;
    this.win = 512;
    this.historyLen = this.win * Math.ceil(sr * 0.5 / this.win);
    this.proc = 0;
    this.holdoff = Math.round(sr * (opts.holdoffMs || 60) / 1000);
    this.setSensitivity(opts.sensitivity ?? 55);
    this.beep = opts.beep || null;           // {freq, dur}
    this.genericFreqs = [];
    for (let f = 1500; f <= 4500; f += 100) this.genericFreqs.push(f);
    this.buf = new Float32Array(0);
    this.bufStart = 0;                       // sample index of buf[0]
    this.total = 0;
    this.slow = 1e-4;
    this.lastShot = -1e12;
    this.tonalRun = 0; this.tonalRunStart = 0; this.tonalFreq = 0; this.toneActive = false;
    this.pendingFirst = null;
    this.mode = 'idle';                      // idle | armed | running | learn
    this.onBeep = null; this.onShot = null; this.onLevel = null; this.onLearn = null;
    this.peakLevel = 0;
  }
  setSensitivity(s) {
    this.sensitivity = s;
    // 1 -> -4 dBFS (very insensitive), 100 -> -44 dBFS
    this.threshold = dbToAmp(-4 - 0.4 * (s - 1));
  }
  minToneWindows() {
    const durMs = this.beep ? Math.min(80, this.beep.dur * 0.5) : 80;
    return Math.max(2, Math.round(durMs / 1000 * this.sr / this.win));
  }
  push(chunk) {
    const nb = new Float32Array(this.buf.length + chunk.length);
    nb.set(this.buf); nb.set(chunk, this.buf.length);
    this.buf = nb; this.total += chunk.length;
    let off = this.proc || 0;
    while (this.buf.length - off >= this.win) { this.processWindow(off); off += this.win; }
    if (this.mode === 'learn') this.learnBuf.push(chunk.slice());
    // keep ~0.5 s of already-processed history for onset refinement
    const drop = Math.max(0, off - this.historyLen);
    this.buf = this.buf.slice(drop); this.bufStart += drop; this.proc = off - drop;
  }
  processWindow(off) {
    const x = this.buf, n = this.win, sr = this.sr, start = this.bufStart + off;
    let peak = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(x[off + i]); if (a > peak) peak = a; }
    this.peakLevel = Math.max(this.peakLevel * 0.8, peak);

    // --- tone (beep) detection ---
    let tonal = false, freq = 0;
    if (this.mode === 'armed' || this.mode === 'running') {
      const freqs = this.overrideFreq ? [this.overrideFreq] : this.beep ? [this.beep.freq] : this.genericFreqs;
      let best = 0, rms = 0;
      for (const f of freqs) { const r = tonalRatio(x, off, n, f, sr); if (r.ratio > best) { best = r.ratio; freq = f; rms = r.rms; } }
      tonal = best > 0.35 && rms > dbToAmp(-55);
    }
    if (tonal && (!this.tonalRun || Math.abs(freq - this.tonalFreq) <= 150)) {
      if (!this.tonalRun) { this.tonalRunStart = start; this.tonalFreq = freq; this.tonalStartOff = off; }
      this.tonalRun++;
    } else { this.tonalRun = tonal ? 1 : 0; if (tonal) { this.tonalRunStart = start; this.tonalFreq = freq; } }
    this.toneActive = this.tonalRun > 0;

    if (this.mode === 'armed' && this.tonalRun >= this.minToneWindows()) {
      // refine onset: the first tonal window may start mid-beep (partial windows aren't tonal enough).
      // Walk back in 0.5 ms blocks while the level stays near the tone amplitude.
      const t0 = this.tonalRunStart, o = Math.max(0, t0 - this.bufStart);
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(x[o + i]));
      const blk = Math.round(sr / 2000), lim = pk * 0.3;
      const blockMax = b => { let m = 0; for (let i = b; i < b + blk; i++) m = Math.max(m, Math.abs(x[i])); return m; };
      let b = o;
      while (b - blk >= 0 && o - b < n && blockMax(b - blk) > lim) b -= blk;
      if (b < o) b -= blk; // the block that straddles the onset
      b = Math.max(0, b);
      let onsetOff = b;
      for (let i = b; i < o + n; i++) if (Math.abs(x[i]) > lim) { onsetOff = i; break; }
      const onset = this.bufStart + onsetOff;
      this.mode = 'running'; this.beepAt = onset; this.lastShot = onset; this.pendingFirst = null; // no shots right on the beep
      this.onBeep && this.onBeep(onset, this.tonalFreq);
    }

    // "first shot starts the clock": wait 150 ms to make sure the loud sound wasn't a beep
    if (this.mode === 'armed' && this.pendingFirst != null && this.tonalRun === 0 && start - this.pendingFirst > this.sr * 0.15) {
      const s0 = this.pendingFirst; this.pendingFirst = null;
      this.mode = 'running'; this.beepAt = s0; this.onBeep && this.onBeep(s0, 0); this.onShot && this.onShot(s0);
    }
    // --- impulse (shot) detection, sample-accurate ---
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[off + i]);
      const idx = start + i;
      if (a > this.threshold && a > this.slow * 4 && idx - this.lastShot > this.holdoff) {
        this.lastShot = idx;
        if (this.mode === 'running' && !this.toneActive) this.onShot && this.onShot(idx);
        else if (this.mode === 'armed' && this.firstShotStart && !this.toneActive && this.pendingFirst == null) this.pendingFirst = idx; else if (this.mode === 'learn' && this.learnOnset == null) this.learnOnset = idx;
      }
      // slow background envelope (~150 ms)
      this.slow += (a - this.slow) * (a > this.slow ? 0.0005 : 0.0002);
    }
    if (this.mode === 'learn' && this.learnOnset != null && this.total - this.learnOnset > this.sr * 0.8) this.finishLearn();
  }
  startLearn() {
    this.mode = 'learn'; this.learnOnset = null; this.learnBuf = [this.buf.slice(this.proc)]; this.learnBufStart = this.bufStart + this.proc;
  }
  finishLearn() {
    const all = new Float32Array(this.learnBuf.reduce((s, c) => s + c.length, 0));
    let p = 0; for (const c of this.learnBuf) { all.set(c, p); p += c.length; }
    const onset = this.learnOnset - this.learnBufStart;
    this.mode = 'idle'; this.learnBuf = null;
    const sig = analyzeBeep(all, Math.max(0, onset), this.sr);
    this.onLearn && this.onLearn(sig);
  }
}

// Find the dominant frequency of the sound starting at `onset` and how long it lasts.
function analyzeBeep(x, onset, sr) {
  const n = 2048, start = Math.min(onset + Math.round(sr * 0.02), Math.max(0, x.length - n));
  if (x.length < n) return null;
  let best = 0, bestF = 0;
  for (let f = 400; f <= 6000; f += 20) { const p = goertzelPower(x, start, n, f, sr); if (p > best) { best = p; bestF = f; } }
  for (let f = bestF - 20; f <= bestF + 20; f += 2) { const p = goertzelPower(x, start, n, f, sr); if (p > best) { best = p; bestF = f; } }
  const w = 512, r0 = tonalRatio(x, start, w, bestF, sr).ratio;
  if (r0 < 0.3) return { ok: false, freq: bestF, ratio: r0 };
  let k = onset, dur = 0;
  while (k + w <= x.length && tonalRatio(x, k, w, bestF, sr).ratio > 0.3) { dur += w; k += w; }
  return { ok: true, freq: Math.round(bestF), dur: Math.round(dur / sr * 1000), ratio: r0 };
}

// ---------------- Browser wiring ----------------
class ShotTimer {
  constructor() { this.ctx = null; this.det = null; this.shots = []; this.beepAt = null; this.listeners = {}; }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }

  async enable(opts) {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.det = new Detector(this.ctx.sampleRate, opts);
    const d = this.det;
    d.onBeep = (s, f) => { this.beepAt = s; this.shots = []; this.emit('beep', s, f); };
    d.onShot = s => { if (this.beepAt == null) return; this.shots.push((s - this.beepAt) / d.sr); this.emit('shot', this.shots); };
    d.onLearn = sig => this.emit('learn', sig);
    const feed = chunk => { d.push(chunk); };
    if (this.ctx.audioWorklet) {
      await this.ctx.audioWorklet.addModule('js/worklet.js');
      this.node = new AudioWorkletNode(this.ctx, 'capture-processor');
      this.node.port.onmessage = e => feed(e.data);
    } else {
      this.node = this.ctx.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = e => feed(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    const mute = this.ctx.createGain(); mute.gain.value = 0;
    src.connect(this.node); this.node.connect(mute); mute.connect(this.ctx.destination);
    this.levelTimer = setInterval(() => this.emit('level', d.peakLevel), 60);
  }
  get now() { return this.det ? this.det.total / this.det.sr : 0; }
  elapsed() { return this.beepAt == null ? 0 : (this.det.total - this.beepAt) / this.det.sr; }
  arm() { this.reset(); this.det.mode = 'armed'; this.det.overrideFreq = null; this.emit('state', 'armed'); }
  ownBeep(min, max) {
    this.reset();
    const delay = min + Math.random() * Math.max(0, max - min);
    const f = 3000, t = this.ctx.currentTime + delay;
    this.det.mode = 'armed'; this.det.overrideFreq = f;
    this.emit('state', 'standby');
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.005);
    g.gain.setValueAtTime(0.9, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.31);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.35);
    // Fallback if the mic doesn't pick up our own speaker (e.g. headphones)
    this.fallback = setTimeout(() => {
      if (this.det.mode === 'armed') { const s = this.det.total; this.det.mode = 'running'; this.det.lastShot = s; this.det.onBeep(s, f); }
    }, (delay + 0.45) * 1000);
  }
  stop() { clearTimeout(this.fallback); if (this.det) { this.det.mode = 'idle'; this.det.overrideFreq = null; } this.emit('state', 'stopped'); }
  reset() { clearTimeout(this.fallback); this.shots = []; this.beepAt = null; if (this.det) { this.det.mode = 'idle'; this.det.pendingFirst = null; } this.emit('state', 'idle'); }
  learn() { this.reset(); this.det.startLearn(); this.emit('state', 'learn'); }
}

if (typeof module !== 'undefined') module.exports = { Detector, analyzeBeep, tonalRatio, goertzelPower };
