// Pure report computations (no DOM). Uses IPSC from calc.js.
const Reports = (() => {
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

  function runStats(r) {
    const s = IPSC.score(r, r.pf, r.time);
    const shots = r.A + r.C + r.D + r.M;
    const sp = r.splits || [];
    return {
      ...s,
      accuracy: shots ? r.A / shots : null,           // share of Alphas among required hits
      draw: sp.length ? sp[0] : null,
      avgSplit: sp.length > 1 ? (sp[sp.length - 1] - sp[0]) / (sp.length - 1) : null,
    };
  }

  // IPSC convention: stage max points = 5 × required hits.
  const maxPoints = ex => (ex.requiredHits || ex.rounds || 0) * 5;

  // Match-style results for one training session (best attempt per shooter counts).
  function session(sess, store) {
    const exercises = sess.exerciseIds.map(store.exercise).filter(Boolean);
    const shooters = sess.shooterIds.map(store.shooter).filter(Boolean);
    const byEx = exercises.map(ex => {
      const runs = sess.runs.filter(r => r.exerciseId === ex.id);
      const best = new Map();
      runs.forEach(r => { const st = runStats(r); const b = best.get(r.shooterId); if (!b || (st.hf || 0) > (b.st.hf || 0)) best.set(r.shooterId, { r, st }); });
      const ranked = [...best.entries()].map(([sid, v]) => ({ shooter: store.shooter(sid), run: v.r, ...v.st, attempts: runs.filter(r => r.shooterId === sid).length }))
        .filter(x => x.shooter).sort((a, b) => (b.hf || 0) - (a.hf || 0));
      const top = ranked[0] ? ranked[0].hf || 0 : 0, mp = maxPoints(ex);
      ranked.forEach((x, i) => { x.place = i + 1; x.pct = top ? (x.hf || 0) / top * 100 : 0; x.stagePoints = mp ? (x.pct / 100) * mp : 0; });
      return { exercise: ex, maxPoints: mp, runs: runs.length, ranked };
    });
    const overall = shooters.map(sh => {
      const mine = sess.runs.filter(r => r.shooterId === sh.id).map(runStats);
      const all = sess.runs.filter(r => r.shooterId === sh.id);
      const totals = all.reduce((t, r) => (['A', 'C', 'D', 'M', 'NS', 'P'].forEach(k => t[k] += r[k] || 0), t), { A: 0, C: 0, D: 0, M: 0, NS: 0, P: 0 });
      const hits = totals.A + totals.C + totals.D + totals.M;
      return {
        shooter: sh,
        runs: all.length,
        stagePoints: byEx.reduce((s, e) => s + (e.ranked.find(x => x.shooter.id === sh.id)?.stagePoints || 0), 0),
        avgHF: mean(mine.map(s => s.hf || 0)),
        bestHF: mine.length ? Math.max(...mine.map(s => s.hf || 0)) : null,
        accuracy: hits ? totals.A / hits : null,
        totals,
        avgDraw: mean(mine.map(s => s.draw).filter(x => x != null)),
        avgSplit: mean(mine.map(s => s.avgSplit).filter(x => x != null)),
      };
    }).sort((a, b) => b.stagePoints - a.stagePoints);
    const topPts = overall[0]?.stagePoints || 0;
    overall.forEach((o, i) => { o.place = i + 1; o.pct = topPts ? o.stagePoints / topPts * 100 : 0; });
    return { exercises: byEx, overall, totalRuns: sess.runs.length };
  }

  // Progress of one shooter across all sessions.
  function shooter(sh, store) {
    const rows = [];
    store.data.sessions.forEach(sess => sess.runs.filter(r => r.shooterId === sh.id).forEach(r => rows.push({ sess, r, ex: store.exercise(r.exerciseId), ...runStats(r) })));
    rows.sort((a, b) => (a.sess.date + a.r.createdAt).localeCompare(b.sess.date + b.r.createdAt));
    const perEx = {};
    rows.forEach(x => (perEx[x.r.exerciseId] ||= []).push(x));
    const exercises = Object.values(perEx).map(list => ({
      exercise: list[0].ex,
      attempts: list.length,
      bestHF: Math.max(...list.map(x => x.hf || 0)),
      avgHF: mean(list.map(x => x.hf || 0)),
      firstHF: list[0].hf || 0,
      lastHF: list[list.length - 1].hf || 0,
      bestTime: Math.min(...list.map(x => x.r.time)),
      accuracy: mean(list.map(x => x.accuracy).filter(x => x != null)),
      avgDraw: mean(list.map(x => x.draw).filter(x => x != null)),
      avgSplit: mean(list.map(x => x.avgSplit).filter(x => x != null)),
    })).filter(e => e.exercise);
    return { rows, exercises, sessions: new Set(rows.map(x => x.sess.id)).size };
  }

  // ---------- split grading ----------
  // Grades: fast | ok | slow, plus 'pause' for long gaps (reload / movement) which
  // are graded neutrally instead of being punished as slow splits.
  const GRADE_DEFAULTS = { drawFast: 1.2, drawOk: 1.6, splitFast: 0.25, splitOk: 0.40, pause: 0.9 };
  const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // Personal reference: median draw / median split of the shooter's earlier runs in the same exercise.
  function baseline(store, shooterId, exerciseId, excludeRunId, pause = GRADE_DEFAULTS.pause) {
    const draws = [], splits = [];
    store.data.sessions.forEach(s => s.runs.forEach(r => {
      if (r.shooterId !== shooterId || r.exerciseId !== exerciseId || r.id === excludeRunId || !(r.splits && r.splits.length)) return;
      draws.push(r.splits[0]);
      for (let i = 1; i < r.splits.length; i++) { const d = r.splits[i] - r.splits[i - 1]; if (d < pause) splits.push(d); }
    }));
    return draws.length >= 2 && splits.length >= 3 ? { draw: median(draws), split: median(splits), runs: draws.length } : null;
  }

  function gradeSplits(shots, cfg = {}, base = null) {
    const c = { ...GRADE_DEFAULTS, ...cfg };
    const lim = base
      ? { drawFast: base.draw * 0.92, drawOk: base.draw * 1.08, splitFast: base.split * 0.92, splitOk: base.split * 1.08 }
      : c;
    return shots.map((t, i) => {
      if (i === 0) return { i, t, split: t, kind: 'draw', grade: t <= lim.drawFast ? 'fast' : t <= lim.drawOk ? 'ok' : 'slow' };
      const d = t - shots[i - 1];
      if (d >= c.pause) return { i, t, split: d, kind: 'split', grade: 'pause' };
      return { i, t, split: d, kind: 'split', grade: d <= lim.splitFast ? 'fast' : d <= lim.splitOk ? 'ok' : 'slow' };
    });
  }
  function splitSummary(graded) {
    const sp = graded.filter(g => g.kind === 'split' && g.grade !== 'pause').map(g => g.split);
    const n = { fast: 0, ok: 0, slow: 0, pause: 0 };
    graded.forEach(g => { if (g.kind === 'split') n[g.grade]++; });
    return { draw: graded[0]?.split ?? null, avg: mean(sp), best: sp.length ? Math.min(...sp) : null, counts: n, fastShare: sp.length ? n.fast / sp.length : null };
  }

  return { runStats, session, shooter, maxPoints, mean, median, baseline, gradeSplits, splitSummary, GRADE_DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { Reports };
