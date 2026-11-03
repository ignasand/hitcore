(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = Store.state;
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); };

  // ---------- navigation ----------
  function show(view) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    if (view === 'log') renderLog();
    if (view === 'calc') renderCalcMeta();
    window.scrollTo(0, 0);
  }
  $$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.view));

  // ---------- sessions ----------
  function ensureSession() { return Store.session() || Store.createSession('Training ' + new Date().toLocaleDateString()); }
  function renderSessionPill() { const s = Store.session(); $('#sessionBtn').textContent = s ? s.name : 'No session'; }
  function openSessions() {
    const ul = $('#sessionList');
    ul.innerHTML = Store.state.sessions.map(s => `<li><button type="button" class="pick ${s.id === Store.state.currentSessionId ? 'on' : ''}" data-id="${s.id}">${esc(s.name)}<br><span class="muted small">${new Date(s.date).toLocaleString()} · ${s.runs.length} runs · ${s.participants.length} shooters</span></button><button type="button" class="x" data-del="${s.id}">✕</button></li>`).join('') || '<li class="muted">No sessions yet</li>';
    ul.querySelectorAll('.pick').forEach(b => b.onclick = () => { Store.selectSession(b.dataset.id); refreshAll(); $('#sessionDlg').close(); });
    ul.querySelectorAll('.x').forEach(b => b.onclick = () => { if (confirm('Delete this session and all its runs?')) { Store.deleteSession(b.dataset.del); openSessions(); refreshAll(); } });
    $('#sessionName').value = '';
    if (!$('#sessionDlg').open) $('#sessionDlg').showModal();
  }
  $('#sessionBtn').onclick = openSessions;
  $('#newSessionBtn').onclick = openSessions;
  $('#createSession').onclick = e => { e.preventDefault(); Store.createSession($('#sessionName').value.trim()); refreshAll(); $('#sessionDlg').close(); };

  // ---------- calculator ----------
  const hits = { A: 0, C: 0, D: 0, M: 0, NS: 0, P: 0 };
  let pf = st.pf || 'minor';
  let pendingSplits = null;

  $$('.counter').forEach(c => {
    const k = c.dataset.key;
    c.querySelector('.inc').onclick = () => { hits[k]++; updateCalc(); };
    c.querySelector('.dec').onclick = () => { hits[k] = Math.max(0, hits[k] - 1); updateCalc(); };
  });
  $$('#pfSeg button').forEach(b => b.onclick = () => { pf = b.dataset.pf; Store.set('pf', pf); updateCalc(); });
  $('#runTime').oninput = () => { pendingSplits = null; updateCalc(); };

  function updateCalc() {
    $$('.counter').forEach(c => c.querySelector('.cval').textContent = hits[c.dataset.key]);
    $$('#pfSeg button').forEach(b => b.classList.toggle('on', b.dataset.pf === pf));
    const time = parseFloat($('#runTime').value) || 0;
    const r = IPSC.score(hits, pf, time);
    $('#rHits').textContent = r.hits; $('#rPoints').textContent = r.points; $('#rPen').textContent = r.penalty ? '−' + r.penalty : 0;
    $('#rScore').textContent = r.score; $('#rHF').textContent = fmt(r.hf, 4);
    $('#calcSplits').textContent = pendingSplits ? 'Splits: ' + splitsText(pendingSplits) : '';
  }
  function renderCalcMeta() {
    const s = Store.session(), sel = $('#runShooter'), cur = sel.value;
    const names = s ? s.participants : [];
    sel.innerHTML = names.length ? names.map(n => `<option>${esc(n)}</option>`).join('') : '<option value="">— add shooters in Log —</option>';
    if (names.includes(cur)) sel.value = cur;
    else if (s && s.lastShooter && names.includes(s.lastShooter)) sel.value = s.lastShooter;
    $('#exerciseList').innerHTML = Store.exercises().map(e => `<option value="${esc(e)}">`).join('');
  }
  function clearRun() { Object.keys(hits).forEach(k => hits[k] = 0); $('#runTime').value = ''; pendingSplits = null; updateCalc(); }
  $('#clearRun').onclick = clearRun;
  $('#saveRun').onclick = () => {
    const time = parseFloat($('#runTime').value);
    if (!(time > 0)) return toast('Enter time first');
    const s = ensureSession();
    const shooter = $('#runShooter').value;
    if (!shooter) { show('log'); $('#newParticipant').focus(); return toast('Add a participant first'); }
    const exercise = $('#runExercise').value.trim() || 'Exercise';
    const r = IPSC.score(hits, pf, time);
    Store.addRun({ shooter, exercise, pf, time, ...hits, points: r.points, penalty: r.penalty, score: r.score, hf: r.hf, splits: pendingSplits });
    // advance to next shooter for fast logging of the same exercise
    const i = s.participants.indexOf(shooter);
    s.lastShooter = s.participants[(i + 1) % s.participants.length]; Store.save();
    toast(`${shooter}: HF ${fmt(r.hf, 4)} saved`);
    clearRun(); renderCalcMeta(); renderSessionPill();
  };
  const splitsText = sh => sh.map((t, i) => i ? '+' + (t - sh[i - 1]).toFixed(2) : t.toFixed(2)).join(' ');

  // ---------- log ----------
  let logMode = 'time';
  $$('#logMode button').forEach(b => b.onclick = () => { logMode = b.dataset.mode; renderLog(); });
  function addParticipant() {
    const name = $('#newParticipant').value.trim(); if (!name) return;
    ensureSession(); Store.addParticipant(name); $('#newParticipant').value = ''; renderLog(); renderCalcMeta(); renderSessionPill();
  }
  $('#addParticipantBtn').onclick = addParticipant;
  $('#newParticipant').onkeydown = e => { if (e.key === 'Enter') addParticipant(); };

  function runRow(r, rank, pct) {
    const sub = `${r.time.toFixed(2)}s · A${r.A} C${r.C} D${r.D}` + (r.M ? ` M${r.M}` : '') + (r.NS ? ` NS${r.NS}` : '') + (r.P ? ` P${r.P}` : '') +
      ` · ${r.score} pts · ${r.pf}` + (r.splits ? `<br>splits ${splitsText(r.splits)}` : '');
    return `<div class="run"><div class="main">${rank ? `<span class="rank">#${rank}</span>` : ''}${esc(logMode === 'shooter' ? r.exercise : logMode === 'exercise' ? r.shooter : r.shooter + ' · ' + r.exercise)}${pct != null ? ` <span class="muted small">${fmt(pct, 1)}%</span>` : ''}</div>
      <div class="hf">${fmt(r.hf, 4)}</div><button class="del" data-del="${r.id}" title="Delete">✕</button><div class="sub">${sub}</div></div>`;
  }
  function renderLog() {
    const s = Store.session();
    $('#logSessionName').textContent = s ? s.name : 'No session';
    $('#logSessionDate').textContent = s ? new Date(s.date).toLocaleString() : 'Create one, or just add a participant';
    $('#participantChips').innerHTML = (s ? s.participants : []).map(p => `<span class="chip">${esc(p)}<button data-rm="${esc(p)}">✕</button></span>`).join('');
    $$('#participantChips [data-rm]').forEach(b => b.onclick = () => { if (confirm(`Remove ${b.dataset.rm}? (runs are kept)`)) { Store.removeParticipant(b.dataset.rm); renderLog(); renderCalcMeta(); } });
    $$('#logMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === logMode));
    const runs = s ? s.runs : [];
    let html = '';
    if (!runs.length) html = '<div class="empty">No runs logged yet.<br>Score a run and press “Save run to log”.</div>';
    else if (logMode === 'time') html = `<div class="group">${[...runs].reverse().map(r => runRow(r)).join('')}</div>`;
    else {
      const key = logMode === 'shooter' ? 'shooter' : 'exercise';
      const groups = {};
      runs.forEach(r => (groups[r[key]] ||= []).push(r));
      html = Object.entries(groups).map(([g, rs]) => {
        let head = '';
        if (key === 'shooter') {
          const avg = rs.reduce((a, r) => a + r.hf, 0) / rs.length, best = Math.max(...rs.map(r => r.hf));
          head = `<span class="muted small"> · ${rs.length} run${rs.length > 1 ? 's' : ''} · avg HF ${fmt(avg, 2)} · best ${fmt(best, 2)}</span>`;
          return `<div class="group"><h4>${esc(g)}${head}</h4>${rs.map(r => runRow(r)).join('')}</div>`;
        }
        const sorted = [...rs].sort((a, b) => b.hf - a.hf), top = sorted[0].hf;
        return `<div class="group"><h4>${esc(g)}<span class="muted small"> · ${rs.length} run${rs.length > 1 ? 's' : ''}</span></h4>${sorted.map((r, i) => runRow(r, i + 1, top ? r.hf / top * 100 : 0)).join('')}</div>`;
      }).join('');
    }
    $('#logBody').innerHTML = html;
    $$('#logBody [data-del]').forEach(b => b.onclick = () => { if (confirm('Delete this run?')) { Store.deleteRun(b.dataset.del); renderLog(); } });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#exportCsvBtn').onclick = () => {
    const s = Store.session(); if (!s || !s.runs.length) return toast('Nothing to export');
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['session', 'date', 'time_logged', 'shooter', 'exercise', 'power_factor', 'A', 'C', 'D', 'M', 'NS', 'P', 'points', 'penalty', 'score', 'time_s', 'hit_factor', 'splits']];
    s.runs.forEach(r => rows.push([s.name, s.date.slice(0, 10), new Date(r.ts).toLocaleTimeString(), r.shooter, r.exercise, r.pf, r.A, r.C, r.D, r.M, r.NS, r.P, r.points, r.penalty, r.score, r.time.toFixed(2), r.hf.toFixed(4), (r.splits || []).map(x => x.toFixed(2)).join(' ')]));
    download(`hitcore-${s.name.replace(/[^\w-]+/g, '_')}.csv`, rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  };
  $('#exportJsonBtn').onclick = () => download(`hitcore-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Store.state, null, 1), 'application/json');
  $('#importJsonBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.sessions)) throw new Error('bad file');
      if (!confirm(`Import ${data.sessions.length} sessions? Sessions with the same id are replaced.`)) return;
      const byId = new Map(Store.state.sessions.map(s => [s.id, s]));
      data.sessions.forEach(s => byId.set(s.id, s));
      Store.state.sessions = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
      if (data.beepSig && !Store.state.beepSig) Store.state.beepSig = data.beepSig;
      Store.save(); refreshAll(); toast('Imported');
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  };

  // ---------- timer ----------
  const timer = new ShotTimer();
  let raf = null, timerState = 'off';
  const sens = $('#sensitivity');
  sens.value = st.sensitivity; $('#firstShotStart').checked = !!st.firstShotStart;
  $('#delayMin').value = st.delayMin; $('#delayMax').value = st.delayMax;

  function renderBeepStatus() {
    const b = Store.state.beepSig;
    $('#beepStatus').textContent = b ? `${b.freq} Hz · ${b.dur} ms (learned ×${Store.state.beepCount || 1})` : 'not learned — any 1.5–4.5 kHz tone';
  }
  function renderThreshold() {
    $('#sensVal').textContent = sens.value;
    const db = -4 - 0.4 * (sens.value - 1); // mirror of Detector.setSensitivity
    $('#threshLine').style.left = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
  }
  sens.oninput = () => { Store.set('sensitivity', +sens.value); timer.det && timer.det.setSensitivity(+sens.value); renderThreshold(); };
  $('#firstShotStart').onchange = e => { Store.set('firstShotStart', e.target.checked); if (timer.det) timer.det.firstShotStart = e.target.checked; };
  $('#delayMin').onchange = e => Store.set('delayMin', +e.target.value || 0);
  $('#delayMax').onchange = e => Store.set('delayMax', +e.target.value || 0);

  function setButtons() {
    const on = !!timer.det;
    $('#micBtn').textContent = on ? 'Mic on' : 'Enable mic';
    $('#micBtn').disabled = on;
    $('#armBtn').disabled = !on || timerState === 'armed' || timerState === 'running';
    $('#goBtn').disabled = $('#armBtn').disabled;
    $('#learnBeepBtn').disabled = !on || timerState === 'armed' || timerState === 'running';
    $('#stopBtn').disabled = !(timerState === 'armed' || timerState === 'running' || timerState === 'learn');
    $('#useTimeBtn').disabled = !timer.shots.length || timerState === 'running';
  }
  function renderShots() {
    const sh = timer.shots;
    $('#tShots').textContent = sh.length;
    $('#tFirst').textContent = sh.length ? sh[0].toFixed(2) : '—';
    $('#tSplit').textContent = sh.length > 1 ? (sh[sh.length - 1] - sh[sh.length - 2]).toFixed(2) : '—';
    if (timerState !== 'running') $('#tTime').textContent = sh.length ? sh[sh.length - 1].toFixed(2) : '0.00';
    $('#splitList').innerHTML = sh.map((t, i) => `<li><b>${t.toFixed(2)}</b><span>${i ? '+' + (t - sh[i - 1]).toFixed(2) : 'draw'}</span></li>`).join('');
  }
  function tick() {
    if (timerState === 'running') $('#tTime').textContent = timer.elapsed().toFixed(2);
    raf = requestAnimationFrame(tick);
  }
  const statusText = { off: 'Mic off', idle: 'Ready', armed: 'Waiting for beep…', standby: 'Standby…', running: 'Shooting', stopped: 'Stopped', learn: 'Learning: trigger the beep now' };
  function setState(s) {
    timerState = s;
    const el = $('#tStatus'); el.textContent = statusText[s] || s;
    el.className = 'tstatus ' + (s === 'running' ? 'running' : s === 'armed' || s === 'learn' || s === 'standby' ? 'armed' : '');
    setButtons(); renderShots();
  }
  timer.on('state', setState);
  timer.on('beep', () => { setState('running'); if (navigator.vibrate) navigator.vibrate(30); });
  timer.on('shot', renderShots);
  timer.on('level', p => { const db = 20 * Math.log10(p + 1e-6); $('#levelBar').style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%'; });
  timer.on('learn', sig => {
    setState('idle');
    if (!sig || !sig.ok) return toast('No clean tone heard — try again closer to the timer');
    const prev = Store.state.beepSig, n = Store.state.beepCount || 0;
    // average repeated learnings, but restart if the frequency is clearly different (new timer)
    const fresh = !prev || Math.abs(prev.freq - sig.freq) > 150;
    const merged = fresh ? { freq: sig.freq, dur: sig.dur } : { freq: Math.round((prev.freq * n + sig.freq) / (n + 1)), dur: Math.round((prev.dur * n + sig.dur) / (n + 1)) };
    Store.set('beepSig', merged); Store.set('beepCount', fresh ? 1 : n + 1);
    timer.det.beep = merged; renderBeepStatus();
    toast(`Beep learned: ${sig.freq} Hz, ${sig.dur} ms`);
  });

  let wakeLock = null;
  async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {} }

  $('#micBtn').onclick = async () => {
    try {
      await timer.enable({ sensitivity: +sens.value, beep: Store.state.beepSig });
      timer.det.firstShotStart = $('#firstShotStart').checked;
      setState('idle'); keepAwake();
      if (!raf) tick();
    } catch (e) { toast('Microphone unavailable: ' + (e.message || e.name)); console.error(e); }
  };
  $('#armBtn').onclick = () => timer.arm();
  $('#goBtn').onclick = () => timer.ownBeep(+$('#delayMin').value || 0, +$('#delayMax').value || 0);
  $('#stopBtn').onclick = () => timer.stop();
  $('#resetTimerBtn').onclick = () => { if (timer.det) timer.reset(); else { timer.shots = []; renderShots(); } };
  $('#learnBeepBtn').onclick = () => timer.learn();
  $('#forgetBeepBtn').onclick = () => { Store.set('beepSig', null); Store.set('beepCount', 0); if (timer.det) timer.det.beep = null; renderBeepStatus(); };
  $('#splitList').onclick = e => {
    // tap a shot to remove it (echo / neighbour bay)
    const li = e.target.closest('li'); if (!li || timerState === 'running') return;
    const i = [...li.parentNode.children].indexOf(li);
    if (confirm(`Remove shot ${i + 1} (${timer.shots[i].toFixed(2)}s)?`)) { timer.shots.splice(i, 1); renderShots(); setButtons(); }
  };
  $('#useTimeBtn').onclick = () => {
    const sh = timer.shots; if (!sh.length) return;
    $('#runTime').value = sh[sh.length - 1].toFixed(2);
    pendingSplits = sh.map(t => +t.toFixed(3));
    show('calc'); updateCalc();
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && timer.det) { timer.ctx.resume(); keepAwake(); } });

  // ---------- init ----------
  function refreshAll() { renderSessionPill(); renderCalcMeta(); renderLog(); updateCalc(); }
  renderBeepStatus(); renderThreshold(); setButtons(); refreshAll();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
