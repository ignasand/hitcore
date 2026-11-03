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

  return { runStats, session, shooter, maxPoints, mean };
})();

if (typeof module !== 'undefined') module.exports = { Reports };
