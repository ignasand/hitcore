// IPSC scoring. Comstock: score = max(0, points - penalties); hit factor = score / time.
const IPSC = {
  values: {
    minor: { A: 5, C: 3, D: 1 },
    major: { A: 5, C: 4, D: 2 },
  },
  MISS: 10,
  NO_SHOOT: 10,
  PROCEDURAL: 10,

  score(h, pf = 'minor', time = 0) {
    const v = this.values[pf] || this.values.minor;
    const A = +h.A || 0, C = +h.C || 0, D = +h.D || 0, M = +h.M || 0, NS = +h.NS || 0, P = +h.P || 0;
    const points = A * v.A + C * v.C + D * v.D;
    const penalty = M * this.MISS + NS * this.NO_SHOOT + P * this.PROCEDURAL;
    const score = Math.max(0, points - penalty);
    const hits = A + C + D;
    const hf = time > 0 ? score / time : null;
    return { hits, points, penalty, score, hf };
  },
};

function fmt(n, d = 2) { return n == null || Number.isNaN(n) ? '—' : (+n).toFixed(d); }

if (typeof module !== 'undefined') module.exports = { IPSC, fmt };
