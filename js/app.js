(() => {
  'use strict';
  // ======================================================================
  // helpers
  // ======================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = $('#view');
  const today = () => new Date().toISOString().slice(0, 10);
  const fdate = d => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const ftime = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const pct = x => x == null ? '—' : (x * 100).toFixed(0) + '%';
  const DIVISIONS = ['Production', 'Production Optics', 'Standard', 'Open', 'Classic', 'Revolver', 'PCC'];

  const ICONS = {
    sessions: '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
    exercises: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    shooters: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    reports: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
    chev: '<path d="M9 18l6-6-6-6"/>',
  };
  const icon = n => `<svg class="i" viewBox="0 0 24 24">${ICONS[n]}</svg>`;

  function toast(msg, kind) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', 2200);
  }

  // Generic modal form. onSubmit(values, form) may return false to keep it open.
  function modal({ title, body, submit = 'Save', cancel = 'Cancel', danger = false, onSubmit, onOpen }) {
    const dlg = $('#modal'), form = $('#modalForm');
    form.innerHTML = `<div class="dh">${esc(title)}</div><div class="db">${body}</div>
      <div class="df">${cancel ? `<button type="button" class="btn ghost" data-close>${esc(cancel)}</button>` : ''}<button type="submit" class="btn ${danger ? 'solid-danger' : 'primary'}">${esc(submit)}</button></div>`;
    return new Promise(resolve => {
      const close = v => { dlg.close(); resolve(v); };
      $$('[data-close]', form).forEach(b => b.addEventListener('click', () => close(null)));
      form.onsubmit = e => {
        e.preventDefault();
        const vals = {};
        new FormData(form).forEach((v, k) => { if (k in vals) vals[k] = [].concat(vals[k], v); else vals[k] = v; });
        if (onSubmit && onSubmit(vals, form) === false) return;
        close(vals);
      };
      dlg.oncancel = () => resolve(null);
      dlg.showModal();
      onOpen && onOpen(form);
      setTimeout(() => $('input:not([type=checkbox]),select,textarea', form)?.focus(), 50);
    });
  }
  const confirmBox = (msg, ok = 'Confirm', danger = true) => modal({ title: 'Please confirm', body: `<p>${msg}</p>`, submit: ok, danger }).then(v => !!v);
  const checkList = (name, items, checked) => `<div class="checklist">${items.map(it => `<label class="check"><input type="checkbox" name="${name}" value="${it.id}" ${checked.includes(it.id) ? 'checked' : ''}> ${esc(it.name)}</label>`).join('') || '<span class="muted small">Nothing here yet</span>'}</div>`;
  const arr = v => v == null ? [] : [].concat(v);

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const file = new File([blob], name, { type });
    if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

  // ======================================================================
  // auth & shell
  // ======================================================================
  let me = null;
  const NAV = [
    ['sessions', 'Sessions', '#/sessions'], ['exercises', 'Exercises', '#/exercises'], ['shooters', 'Shooters', '#/shooters'],
    ['reports', 'Reports', '#/reports'], ['settings', 'Settings', '#/settings'],
  ];
  function showLogin() {
    $('#shell').hidden = true; $('#login').hidden = false; $('#loginErr').textContent = '';
    setTimeout(() => $('#loginForm [name=username]').focus(), 50);
  }
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('button[type=submit]', f);
    btn.disabled = true; $('#loginErr').textContent = '';
    try {
      await Auth.login(f.username.value, f.password.value, f.remember.checked);
      f.password.value = ''; start();
    } catch (err) { $('#loginErr').textContent = err.message; }
    btn.disabled = false;
  };
  async function logout() {
    if (!(await confirmBox('Sign out of HitCore?', 'Sign out', false))) return;
    if (timer.det) timer.reset();
    Auth.logout(); me = null; location.hash = ''; showLogin();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) logout(); });
  $('#topAvatar').onclick = () => location.hash = '#/settings';
  $('#backBtn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/sessions');

  function start() {
    me = Auth.current();
    if (!me) return showLogin();
    Store.load(me.u);
    $('#login').hidden = true; $('#shell').hidden = false;
    const initials = me.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    $('#sideAvatar').textContent = $('#topAvatar').textContent = initials;
    $('#sideName').textContent = me.name; $('#sideRole').textContent = me.role + ' · ' + me.u;
    const links = NAV.map(([k, label, href]) => `<a href="${href}" data-nav="${k}">${icon(k)}<span>${label}</span></a>`).join('');
    $('#sidenav').innerHTML = links; $('#tabs').innerHTML = links;
    timerApplySettings();
    if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/sessions'; else route();
  }

  // ======================================================================
  // router
  // ======================================================================
  const routes = [
    [/^#\/sessions$/, viewSessions, 'sessions'],
    [/^#\/s\/([\w-]+)$/, viewSession, 'sessions'],
    [/^#\/s\/([\w-]+)\/run\/([\w-]+)\/([\w-]+)$/, viewRunLive, 'sessions'],
    [/^#\/s\/([\w-]+)\/edit\/([\w-]+)$/, viewRunEdit, 'sessions'],
    [/^#\/exercises$/, viewExercises, 'exercises'],
    [/^#\/shooters$/, viewShooters, 'shooters'],
    [/^#\/reports$/, viewReports, 'reports'],
    [/^#\/reports\/s\/([\w-]+)$/, viewSessionReport, 'reports'],
    [/^#\/reports\/p\/([\w-]+)$/, viewShooterReport, 'reports'],
    [/^#\/settings$/, viewSettings, 'settings'],
  ];
  let leaveGuard = null;
  function setTitle(t, back) { $('#viewTitle').textContent = t; $('#backBtn').hidden = !back; document.title = t + ' · HitCore'; }
  function route() {
    if (!me || !Auth.current()) return showLogin();
    if (leaveGuard) { leaveGuard(); leaveGuard = null; }
    const h = location.hash;
    for (const [re, fn, nav] of routes) {
      const m = h.match(re);
      if (m) {
        $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
        view.innerHTML = ''; window.scrollTo(0, 0);
        fn(...m.slice(1));
        return;
      }
    }
    location.hash = '#/sessions';
  }
  window.addEventListener('hashchange', route);
  const go = h => { if (location.hash === h) route(); else location.hash = h; };

  // ======================================================================
  // sessions
  // ======================================================================
  function viewSessions() {
    setTitle('Training sessions');
    const D = Store.data;
    const list = [...D.sessions].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    view.innerHTML = `
      <div class="page-h"><div><h1>Training sessions</h1><div class="sub">${list.length} sessions · ${D.shooters.filter(s => s.active !== false).length} active shooters · ${D.exercises.length} exercises</div></div>
        <button class="btn primary" id="newSess">${icon('plus')} New session</button></div>
      <div class="card tight list">${list.map(s => {
        const shooters = s.shooterIds.length, runs = s.runs.length;
        const isToday = s.date === today();
        return `<a class="item" href="#/s/${s.id}"><div class="grow"><div class="t">${esc(s.name)} ${isToday ? '<span class="badge accent">today</span>' : ''}</div>
          <div class="s">${fdate(s.date)}${s.location ? ' · ' + esc(s.location) : ''} · ${shooters} shooters · ${s.exerciseIds.length} exercises · ${runs} runs</div></div>${icon('chev')}</a>`;
      }).join('') || '<div class="empty">No sessions yet. Create the first one to start logging.</div>'}</div>`;
    $('#newSess').onclick = () => editSession(null);
  }

  async function editSession(sess) {
    const D = Store.data;
    const shooters = D.shooters.filter(s => s.active !== false || sess?.shooterIds.includes(s.id));
    const vals = await modal({
      title: sess ? 'Edit session' : 'New training session',
      submit: sess ? 'Save' : 'Create session',
      body: `
        <label class="f">Name<input name="name" required value="${esc(sess ? sess.name : 'Training ' + fdate(today()))}"></label>
        <div class="row"><label class="f grow">Date<input name="date" type="date" required value="${sess ? sess.date : today()}"></label>
        <label class="f grow">Location<input name="location" value="${esc(sess?.location || '')}" placeholder="Range / bay"></label></div>
        <div class="f">Participants ${checkList('shooterIds', shooters, sess ? sess.shooterIds : shooters.map(s => s.id))}</div>
        <div class="row"><input id="quickShooter" placeholder="Quick add participant…"><button type="button" class="btn" id="quickShooterBtn">Add</button></div>
        <div class="f">Exercises ${checkList('exerciseIds', D.exercises, sess ? sess.exerciseIds : D.exercises.map(e => e.id))}</div>
        <label class="f">Notes<textarea name="notes" placeholder="Goals, conditions…">${esc(sess?.notes || '')}</textarea></label>`,
      onOpen: form => {
        const add = () => {
          const name = $('#quickShooter', form).value.trim(); if (!name) return;
          const s = Store.upsert('shooters', { name, division: 'Production', pf: 'minor', active: true, notes: '' });
          $$('.checklist', form)[0].insertAdjacentHTML('beforeend', `<label class="check"><input type="checkbox" name="shooterIds" value="${s.id}" checked> ${esc(s.name)}</label>`);
          $('#quickShooter', form).value = '';
        };
        $('#quickShooterBtn', form).onclick = add;
        $('#quickShooter', form).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      },
    });
    if (!vals) return;
    const rec = { name: vals.name.trim(), date: vals.date, location: vals.location.trim(), notes: vals.notes.trim(), shooterIds: arr(vals.shooterIds), exerciseIds: arr(vals.exerciseIds) };
    if (sess) { Store.upsert('sessions', { id: sess.id, ...rec }); toast('Session updated'); route(); }
    else { const s = Store.upsert('sessions', { ...rec, runs: [], createdAt: new Date().toISOString(), createdBy: me.u }); go('#/s/' + s.id); }
  }

  const sessUI = {}; // selected exercise per session
  function attemptsOf(sess, shooterId, exId) {
    return sess.runs.filter(r => r.shooterId === shooterId && r.exerciseId === exId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  function viewSession(id) {
    const sess = Store.session(id); if (!sess) return go('#/sessions');
    setTitle(sess.name, true);
    const exs = sess.exerciseIds.map(Store.exercise).filter(Boolean);
    const shooters = sess.shooterIds.map(Store.shooter).filter(Boolean);
    let exId = sessUI[id] && sess.exerciseIds.includes(sessUI[id]) ? sessUI[id] : exs[0]?.id;
    sessUI[id] = exId;
    const ex = Store.exercise(exId);
    const rep = Reports.session(sess, Store);
    const exRep = rep.exercises.find(e => e.exercise.id === exId);

    view.innerHTML = `
      <div class="page-h"><div><h1>${esc(sess.name)}</h1><div class="sub">${fdate(sess.date)}${sess.location ? ' · ' + esc(sess.location) : ''} · ${sess.runs.length} runs</div></div>
        <div class="row wrap"><button class="btn" id="editSess">${icon('edit')} Edit</button><a class="btn" href="#/reports/s/${sess.id}">${icon('reports')} Report</a></div></div>
      ${sess.notes ? `<p class="muted small">${esc(sess.notes)}</p>` : ''}
      <div class="card">
        <div class="card-h"><h2>Exercise</h2><button class="btn sm" id="addEx">${icon('plus')} Exercise</button></div>
        <div class="chips">${exs.map(e => `<button class="chip ${e.id === exId ? 'on' : ''}" data-ex="${e.id}">${esc(e.name)}</button>`).join('') || '<span class="muted small">No exercises in this session – add one.</span>'}</div>
        ${ex ? `<div class="muted small">${ex.rounds} rounds · ${ex.requiredHits} required hits · max ${Reports.maxPoints(ex)} pts${ex.notes ? ' · ' + esc(ex.notes) : ''}</div>` : ''}
      </div>
      ${ex ? `
      <div class="card tight">
        <div class="card-h" style="padding:14px 16px"><h2>Shooters</h2><button class="btn sm" id="addSh">${icon('plus')} Participant</button></div>
        <div>${shooters.map(sh => {
          const atts = attemptsOf(sess, sh.id, ex.id);
          const best = atts.reduce((b, r) => { const hf = Reports.runStats(r).hf || 0; return hf > (b?.hf || -1) ? { id: r.id, hf } : b; }, null);
          return `<div class="srow"><div><div class="t" style="font-weight:600">${esc(sh.name)}</div><div class="xs muted">${esc(sh.division || '')} · ${sh.pf}${atts.length ? ` · ${atts.length} attempt${atts.length > 1 ? 's' : ''}` : ''}</div></div>
            <button class="btn ${atts.length ? '' : 'primary'} sm" data-run="${sh.id}">${icon(atts.length ? 'repeat' : 'play')} ${atts.length ? 'Repeat' : 'Start'}</button>
            ${atts.length ? `<div class="att">${atts.map((r, i) => { const st = Reports.runStats(r); return `<button data-edit="${r.id}" class="${best && best.id === r.id ? 'best' : ''}" title="Edit attempt">#${i + 1} · ${r.time.toFixed(2)}s · <b>${fmt(st.hf, 2)}</b></button>`; }).join('')}</div>` : ''}
          </div>`;
        }).join('') || '<div class="empty">No participants yet.</div>'}</div>
      </div>
      <div class="card tight">
        <div class="card-h" style="padding:14px 16px"><h2>Ranking · ${esc(ex.name)}</h2><span class="muted xs">best attempt counts</span></div>
        ${exRep && exRep.ranked.length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th class="l">Shooter</th><th>HF</th><th>Time</th><th>Pts</th><th>A/C/D/M</th><th>Stage pts</th><th>%</th></tr></thead><tbody>
          ${exRep.ranked.map(x => `<tr class="${x.place === 1 ? 'top' : ''}"><td>${x.place}</td><td class="l">${esc(x.shooter.name)}</td><td class="hf">${fmt(x.hf, 4)}</td><td>${x.run.time.toFixed(2)}</td><td>${x.score}</td><td>${x.run.A}/${x.run.C}/${x.run.D}/${x.run.M}</td><td>${x.stagePoints.toFixed(1)}</td><td>${x.pct.toFixed(1)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">No runs for this exercise yet.</div>'}
      </div>` : ''}`;

    $('#editSess').onclick = () => editSession(sess);
    $$('[data-ex]').forEach(b => b.onclick = () => { sessUI[id] = b.dataset.ex; viewSession(id); });
    $$('[data-run]').forEach(b => b.onclick = () => go(`#/s/${id}/run/${exId}/${b.dataset.run}`));
    $$('[data-edit]').forEach(b => b.onclick = () => go(`#/s/${id}/edit/${b.dataset.edit}`));
    $('#addEx').onclick = async () => {
      const others = Store.data.exercises.filter(e => !sess.exerciseIds.includes(e.id));
      const v = await modal({ title: 'Add exercise to session', submit: 'Add', body: `${checkList('ids', others, [])}<div class="muted small">Need a new drill? <a href="#/exercises" data-close>Create it in Exercises</a>.</div>` });
      if (v) { sess.exerciseIds.push(...arr(v.ids)); if (arr(v.ids)[0]) sessUI[id] = arr(v.ids)[0]; Store.save(); viewSession(id); }
    };
    $('#addSh') && ($('#addSh').onclick = async () => {
      const others = Store.data.shooters.filter(s => !sess.shooterIds.includes(s.id) && s.active !== false);
      const v = await modal({ title: 'Add participants', submit: 'Add', body: `${checkList('ids', others, [])}<label class="f">Or new participant<input name="newName" placeholder="Full name"></label>` });
      if (!v) return;
      sess.shooterIds.push(...arr(v.ids));
      if (v.newName && v.newName.trim()) sess.shooterIds.push(Store.upsert('shooters', { name: v.newName.trim(), division: 'Production', pf: 'minor', active: true, notes: '' }).id);
      Store.save(); viewSession(id);
    });
  }

  // ======================================================================
  // live run & edit run
  // ======================================================================
  const timer = new ShotTimer();
  let live = null;      // state of the run being recorded / edited
  let timerState = 'off';
  let overtimeTimer = null, wakeLock = null;

  function timerApplySettings() {
    const S = Store.data?.settings; if (!S || !timer.det) return;
    timer.det.setSensitivity(S.sensitivity); timer.det.beep = S.beepSig; timer.det.firstShotStart = S.firstShotStart;
  }
  async function enableMic() {
    const S = Store.data.settings;
    await timer.enable({ sensitivity: S.sensitivity, beep: S.beepSig });
    timerApplySettings(); timerState = 'idle';
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && timer.ctx) { timer.ctx.resume(); try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {} }
  });
  // global timer events → whichever view is listening
  const hooks = {};
  timer.on('state', s => { timerState = s; hooks.state && hooks.state(s); });
  timer.on('beep', () => { timerState = 'running'; navigator.vibrate?.(40); hooks.beep && hooks.beep(); });
  timer.on('shot', shots => hooks.shot && hooks.shot(shots[shots.length - 1], shots));
  timer.on('learn', sig => hooks.learn && hooks.learn(sig));
  timer.on('level', p => {
    const el = $('#lvl .bar'); if (!el) return;
    const db = 20 * Math.log10(p + 1e-6); el.style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
  });
  const levelMeter = () => {
    const db = -4 - 0.4 * (Store.data.settings.sensitivity - 1);
    return `<div class="level" id="lvl"><div class="bar"></div><div class="th" style="left:${Math.max(0, Math.min(100, (db + 60) / 60 * 100))}%"></div></div>`;
  };

  function viewRunLive(sid, exId, shooterId) {
    const sess = Store.session(sid), ex = Store.exercise(exId), sh = Store.shooter(shooterId);
    if (!sess || !ex || !sh) return go('#/sessions');
    const attempt = attemptsOf(sess, sh.id, ex.id).length + 1;
    live = { mode: 'new', sid, ex, sh, attempt, phase: 'timer', shots: [], time: null, timeManual: false,
      h: { A: 0, C: 0, D: 0, M: 0, NS: 0, P: 0 }, pf: sh.pf || 'minor', notes: '', listening: false };
    setTitle(`${sh.name} · ${ex.name}`, true);
    renderRun();
    if (timer.det) timer.arm(); // mic already on → ready for the coach beep straight away
    leaveGuard = () => { clearTimeout(overtimeTimer); if (timer.det && timerState !== 'idle') timer.reset(); hooks.state = hooks.beep = hooks.shot = null; live = null; };
  }

  function viewRunEdit(sid, runId) {
    const sess = Store.session(sid), r = sess?.runs.find(x => x.id === runId);
    if (!r) return go('#/s/' + sid);
    const ex = Store.exercise(r.exerciseId), sh = Store.shooter(r.shooterId);
    const attempt = attemptsOf(sess, r.shooterId, r.exerciseId).findIndex(x => x.id === r.id) + 1;
    const shots = (r.splits || []).slice();
    live = { mode: 'edit', sid, run: r, ex: ex || { name: '(deleted exercise)', rounds: 0, requiredHits: 0 }, sh: sh || { name: '(deleted shooter)' }, attempt, phase: 'score',
      shots, time: r.time, timeManual: !shots.length || Math.abs(shots[shots.length - 1] - r.time) > 0.005,
      h: { A: r.A, C: r.C, D: r.D, M: r.M, NS: r.NS, P: r.P }, pf: r.pf, notes: r.notes || '' };
    setTitle(`Edit · ${live.sh.name}`, true);
    renderRun();
    leaveGuard = () => { live = null; };
  }

  function runHeader() {
    return `<div class="run-h"><div><h1>${esc(live.sh.name)}</h1><div class="muted small">${esc(live.ex.name)} · attempt #${live.attempt} · ${live.ex.rounds || '?'} rounds</div></div>
      <span class="badge ${live.mode === 'edit' ? 'warn' : 'accent'}">${live.mode === 'edit' ? 'Editing saved run' : 'Live'}</span></div>`;
  }

  function renderRun() {
    if (!live) return;
    if (live.phase === 'timer') return renderTimerPhase();
    renderScorePhase();
  }

  // ---------- phase 1: listen, count shots ----------
  const STATE_TEXT = { off: 'Microphone off', idle: 'Ready', armed: 'Waiting for beep…', standby: 'Stand by…', running: 'Shooting', stopped: 'Stopped', learn: 'Learning beep' };
  function renderTimerPhase() {
    const n = live.ex.rounds || 0;
    view.innerHTML = `${runHeader()}
      <div class="card clock">
        <div class="state" id="st"></div>
        <div class="time" id="clk">0.00</div>
        <div class="count"><span id="cnt">0</span><small> / ${n || '–'} shots</small></div>
        <div class="progress"><div id="prog"></div></div>
        <div class="row num" style="width:100%;gap:18px;justify-content:center">
          <span class="small muted">Draw <b id="draw" class="num" style="color:var(--text)">—</b></span>
          <span class="small muted">Last split <b id="split" class="num" style="color:var(--text)">—</b></span>
        </div>
        ${levelMeter()}
      </div>
      <div class="stack" id="ctl"></div>
      <div class="card"><div class="card-h"><h3>Shots</h3><span class="xs muted">Scoring opens automatically after shot ${n || 'N'}</span></div><div class="shots" id="liveShots"><span class="muted small">—</span></div></div>`;
    hooks.state = updateTimerUI; hooks.beep = updateTimerUI;
    hooks.shot = (t) => {
      live.shots.push(+t.toFixed(3));
      updateTimerUI();
      if (n && live.shots.length >= n) goScore(true);
    };
    updateTimerUI();
    tick();
  }
  function updateTimerUI() {
    if (!live || live.phase !== 'timer') return;
    const st = $('#st'); if (!st) return;
    const s = timer.det ? timerState : 'off';
    st.textContent = STATE_TEXT[s] || s; st.className = 'state ' + (s === 'running' ? 'running' : ['armed', 'standby'].includes(s) ? 'armed' : '');
    const n = live.ex.rounds || 0, sh = live.shots;
    $('#cnt').textContent = sh.length;
    $('#prog').style.width = n ? Math.min(100, sh.length / n * 100) + '%' : '0';
    $('#draw').textContent = sh.length ? sh[0].toFixed(2) : '—';
    $('#split').textContent = sh.length > 1 ? (sh[sh.length - 1] - sh[sh.length - 2]).toFixed(2) : '—';
    if (s !== 'running') $('#clk').textContent = sh.length ? sh[sh.length - 1].toFixed(2) : '0.00';
    $('#liveShots').innerHTML = sh.length ? sh.map((t, i) => `<span class="shot"><span class="n">${i + 1}</span><b>${t.toFixed(2)}</b></span>`).join('') : '<span class="muted small">—</span>';
    const busy = ['armed', 'standby', 'running'].includes(s);
    $('#ctl').innerHTML = !timer.det
      ? `<button class="btn primary lg block" id="micOn">${icon('mic')} Enable microphone</button>
         <button class="btn ghost block" id="manual">Skip timer – enter time manually</button>`
      : `<div class="row">${busy
          ? `<button class="btn solid-danger lg grow" id="stop">Stop${sh.length ? ' & score' : ''}</button>`
          : `<button class="btn primary lg grow" id="arm">Arm · wait for coach beep</button><button class="btn lg" id="own">Own beep</button>`}</div>
         ${s !== 'running' ? `<button class="btn ghost block" id="manual">${sh.length ? 'Continue to scoring' : 'Skip timer – enter time manually'}</button>` : ''}`;
    $('#micOn') && ($('#micOn').onclick = async () => { try { await enableMic(); timer.arm(); } catch (e) { toast('Microphone unavailable: ' + (e.message || e.name), 'error'); } });
    $('#arm') && ($('#arm').onclick = () => { live.shots = []; timer.arm(); });
    $('#own') && ($('#own').onclick = () => { live.shots = []; timer.ownBeep(Store.data.settings.delayMin, Store.data.settings.delayMax); });
    $('#stop') && ($('#stop').onclick = () => { timer.stop(); if (live.shots.length) goScore(false); });
    $('#manual') && ($('#manual').onclick = () => { if (timer.det) timer.reset(); goScore(false); });
  }
  function tick() {
    if (!live || live.phase !== 'timer') return;
    if (timerState === 'running' && $('#clk')) $('#clk').textContent = timer.elapsed().toFixed(2);
    requestAnimationFrame(tick);
  }

  // Count reached → go to scoring but keep listening a moment for extra (make-up) shots.
  function goScore(keepListening) {
    live.phase = 'score';
    live.listening = keepListening && timerState === 'running';
    if (live.listening) {
      const ot = (Store.data.settings.overtimeSec || 2.5) * 1000;
      const endOT = () => { if (timerState === 'running') timer.stop(); live && (live.listening = false); updateScoreUI(); };
      overtimeTimer = setTimeout(endOT, ot);
      hooks.shot = t => { if (!live) return; live.shots.push(+t.toFixed(3)); clearTimeout(overtimeTimer); overtimeTimer = setTimeout(endOT, ot); updateScoreUI(); };
    } else hooks.shot = null;
    hooks.state = null; hooks.beep = null;
    navigator.vibrate?.([60, 40, 60]);
    renderScorePhase();
  }

  // ---------- phase 2: score & correct ----------
  const COUNTERS = [['A', 'Alpha'], ['C', 'Charlie'], ['D', 'Delta'], ['M', 'Miss', 1], ['NS', 'No-shoot', 1], ['P', 'Procedural', 1]];
  function renderScorePhase() {
    const r = live.run;
    view.innerHTML = `${runHeader()}
      <div id="listenNote"></div>
      <div class="card">
        <div class="card-h"><h2>Time &amp; shots</h2><span class="xs muted">tap a shot time to correct it</span></div>
        <div class="row wrap">
          <label class="f grow">Total time (s)<input id="time" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></label>
          <button class="btn" id="timeAuto" title="Use last shot time">↺ Last shot</button>
        </div>
        <div class="shots" id="shotList"></div>
        <div class="row"><input id="addShot" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Add missed shot (s)"><button class="btn" id="addShotBtn">Add shot</button></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Hits</h2>
          <div class="seg" id="pf"><button data-pf="minor">Minor</button><button data-pf="major">Major</button></div></div>
        <div class="counters">${COUNTERS.map(([k, label, neg]) => `<div class="counter ${neg ? 'neg' : ''}" data-k="${k}"><div class="cname">${label}</div><button type="button" data-d="-1">−</button><input inputmode="numeric" pattern="[0-9]*" value="0"><button type="button" data-d="1">+</button></div>`).join('')}</div>
        <div id="hitCheck"></div>
        <div class="result" id="result"></div>
      </div>
      <div class="card"><label class="f">Notes<textarea id="notes" placeholder="Malfunction, reshoot reason, coaching notes…"></textarea></label>
        ${r && r.history && r.history.length ? `<div class="history"><b>Change history</b>${r.history.slice().reverse().map(hh => `<div>${ftime(hh.at)} · ${esc(hh.by)} · ${Object.entries(hh.changes).map(([k, [a, b]]) => `${k}: ${fmtVal(a)} → ${fmtVal(b)}`).join(', ')}</div>`).join('')}</div>` : ''}
        ${r ? `<div class="xs muted">Recorded ${ftime(r.createdAt)} by ${esc(r.createdBy || me.u)} · source: ${r.source || 'manual'}</div>` : ''}
      </div>
      <div class="actions-bar">${live.mode === 'edit'
        ? `<button class="btn danger" id="del">Delete run</button><button class="btn primary" id="save">Save changes</button>`
        : `<button class="btn" id="discard">Discard</button><button class="btn" id="saveRepeat">${icon('repeat')} Save &amp; repeat</button><button class="btn primary" id="saveNext">Save &amp; next shooter</button>`}</div>`;

    $('#time').value = live.time != null ? (+live.time).toFixed(2) : '';
    $('#notes').value = live.notes;
    $('#time').oninput = e => { live.time = parseFloat(e.target.value) || null; live.timeManual = true; updateScoreUI(true); };
    $('#timeAuto').onclick = () => { live.timeManual = false; updateScoreUI(); };
    $('#notes').oninput = e => live.notes = e.target.value;
    $$('#pf button').forEach(b => b.onclick = () => { live.pf = b.dataset.pf; updateScoreUI(); });
    $$('.counter').forEach(c => {
      const k = c.dataset.k, inp = $('input', c);
      $$('button', c).forEach(b => b.onclick = () => { live.h[k] = Math.max(0, live.h[k] + +b.dataset.d); updateScoreUI(); });
      inp.oninput = () => { live.h[k] = Math.max(0, parseInt(inp.value, 10) || 0); updateScoreUI(true); };
      inp.onfocus = () => inp.select();
    });
    const addShot = () => {
      const v = parseFloat($('#addShot').value); if (!(v > 0)) return;
      live.shots.push(+v.toFixed(3)); live.shots.sort((a, b) => a - b); $('#addShot').value = ''; updateScoreUI();
    };
    $('#addShotBtn').onclick = addShot;
    $('#addShot').onkeydown = e => { if (e.key === 'Enter') addShot(); };
    $('#shotList').onclick = async e => {
      const del = e.target.closest('[data-del]'), ed = e.target.closest('[data-ed]');
      if (del) { live.shots.splice(+del.dataset.del, 1); updateScoreUI(); }
      if (ed) {
        const i = +ed.dataset.ed;
        const v = await modal({ title: `Correct shot ${i + 1}`, submit: 'Update', body: `<label class="f">Time from beep (s)<input name="t" type="number" inputmode="decimal" step="0.01" min="0" value="${live.shots[i].toFixed(2)}" required></label>` });
        if (v && parseFloat(v.t) > 0) { live.shots[i] = +parseFloat(v.t).toFixed(3); live.shots.sort((a, b) => a - b); updateScoreUI(); }
      }
    };
    if (live.mode === 'edit') {
      $('#save').onclick = () => saveRun('back');
      $('#del').onclick = async () => { if (await confirmBox('Delete this run permanently?', 'Delete')) { Store.deleteRun(live.sid, live.run.id); toast('Run deleted'); go('#/s/' + live.sid); } };
    } else {
      $('#discard').onclick = async () => { if (await confirmBox('Discard this run without saving?', 'Discard')) go('#/s/' + live.sid); };
      $('#saveRepeat').onclick = () => saveRun('repeat');
      $('#saveNext').onclick = () => saveRun('next');
    }
    updateScoreUI();
  }
  const fmtVal = v => Array.isArray(v) ? `[${v.length} shots]` : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : esc(v ?? '—');

  function updateScoreUI(fromInput) {
    if (!live || live.phase !== 'score' || !$('#shotList')) return;
    const sh = live.shots, rounds = live.ex.rounds || 0, req = live.ex.requiredHits || rounds;
    if (!live.timeManual && sh.length) { live.time = sh[sh.length - 1]; if (document.activeElement !== $('#time')) $('#time').value = live.time.toFixed(2); }
    if (!fromInput) {
      $$('.counter').forEach(c => { const inp = $('input', c); if (document.activeElement !== inp) inp.value = live.h[c.dataset.k]; });
    }
    $$('#pf button').forEach(b => b.classList.toggle('on', b.dataset.pf === live.pf));
    $('#timeAuto').disabled = !sh.length;
    $('#shotList').innerHTML = sh.length ? sh.map((t, i) => `<span class="shot ${rounds && i >= rounds ? 'extra' : ''}"><span class="n">${i + 1}</span><button class="val" data-ed="${i}">${t.toFixed(2)}</button><span class="sp">${i ? '+' + (t - sh[i - 1]).toFixed(2) : 'draw'}</span><button data-del="${i}" title="Remove shot">✕</button></span>`).join('')
      : '<span class="muted small">No shots recorded – enter the time manually.</span>';
    $('#listenNote').innerHTML = live.listening ? `<div class="notice info"><span>${icon('mic')} ${rounds} shots counted – still listening briefly for extra shots…</span><button class="btn sm" id="stopListen">Stop listening</button></div>`
      : (live.mode === 'new' && rounds && sh.length && sh.length !== rounds ? `<div class="notice warn">Detected ${sh.length} shots, exercise expects ${rounds}. Remove echoes or add missed shots below.</div>` : '');
    $('#stopListen') && ($('#stopListen').onclick = () => { clearTimeout(overtimeTimer); timer.stop(); live.listening = false; updateScoreUI(); });
    const h = live.h, total = h.A + h.C + h.D + h.M;
    const chk = $('#hitCheck');
    if (req && total !== req) {
      const diff = req - total;
      chk.innerHTML = `<div class="notice warn"><span>A+C+D+M = ${total} of ${req} required hits</span>${diff > 0 ? `<button class="btn sm" id="fillM">Set ${diff} remaining as Miss</button>` : ''}</div>`;
      $('#fillM') && ($('#fillM').onclick = () => { live.h.M += diff; updateScoreUI(); });
    } else chk.innerHTML = req ? `<div class="notice good">✓ ${total} of ${req} required hits scored</div>` : '';
    const r = IPSC.score(h, live.pf, live.time || 0);
    $('#result').innerHTML = `<div><div class="k">Points</div><div class="v">${r.points}</div></div><div><div class="k">Penalty</div><div class="v ${r.penalty ? 'bad' : ''}">${r.penalty ? '−' + r.penalty : 0}</div></div>
      <div><div class="k">Score</div><div class="v">${r.score}</div></div><div><div class="k">Time</div><div class="v">${live.time ? (+live.time).toFixed(2) : '—'}</div></div>
      <div class="hfbox"><div class="k">Hit factor</div><div class="v">${fmt(r.hf, 4)}</div></div>`;
  }

  async function saveRun(next) {
    if (!(live.time > 0)) { toast('Enter the total time', 'error'); $('#time').focus(); return; }
    const req = live.ex.requiredHits || live.ex.rounds || 0, h = live.h, total = h.A + h.C + h.D + h.M;
    if (req && total !== req && !(await confirmBox(`Hits total ${total} differs from the ${req} required. Save anyway?`, 'Save anyway', false))) return;
    if (live.listening) { clearTimeout(overtimeTimer); timer.stop(); }
    const rec = { time: +(+live.time).toFixed(3), splits: live.shots.slice(), ...h, pf: live.pf, notes: live.notes.trim() };
    if (live.mode === 'edit') {
      Store.updateRun(live.sid, live.run.id, rec); toast('Changes saved'); history.back(); return;
    }
    const run = Store.addRun(live.sid, { shooterId: live.sh.id, exerciseId: live.ex.id, source: live.shots.length ? 'mic' : 'manual', ...rec });
    const hf = Reports.runStats(run).hf;
    toast(`${live.sh.name}: HF ${fmt(hf, 4)} saved`);
    const sess = Store.session(live.sid), exId = live.ex.id;
    if (next === 'repeat') return go(`#/s/${live.sid}/run/${exId}/${live.sh.id}`);
    const ids = sess.shooterIds, i = ids.indexOf(live.sh.id);
    const nextId = ids[(i + 1) % ids.length];
    if (ids.length > 1 && i < ids.length - 1) go(`#/s/${live.sid}/run/${exId}/${nextId}`);
    else { toast('Round complete – everyone has shot'); sessUI[live.sid] = exId; go('#/s/' + live.sid); }
  }

  // ======================================================================
  // exercises
  // ======================================================================
  function usage(field, id) { return Store.data.sessions.reduce((n, s) => n + s.runs.filter(r => r[field] === id).length, 0); }
  function viewExercises() {
    setTitle('Exercises');
    const D = Store.data;
    view.innerHTML = `
      <div class="page-h"><div><h1>Exercise library</h1><div class="sub">Round count drives the shot counter; required hits drive scoring checks.</div></div>
        <button class="btn primary" id="newEx">${icon('plus')} New exercise</button></div>
      <div class="card tight list">${D.exercises.map(e => `<button class="item" data-id="${e.id}"><div class="grow"><div class="t">${esc(e.name)}</div>
        <div class="s">${e.rounds} rounds · ${e.requiredHits} required hits · max ${Reports.maxPoints(e)} pts · used in ${usage('exerciseId', e.id)} runs${e.notes ? ' · ' + esc(e.notes) : ''}</div></div>${icon('edit')}</button>`).join('') || '<div class="empty">No exercises yet.</div>'}</div>`;
    $('#newEx').onclick = () => editExercise(null);
    $$('[data-id]').forEach(b => b.onclick = () => editExercise(Store.exercise(b.dataset.id)));
  }
  async function editExercise(ex) {
    const used = ex ? usage('exerciseId', ex.id) : 0;
    const v = await modal({
      title: ex ? 'Edit exercise' : 'New exercise', submit: ex ? 'Save' : 'Create',
      body: `<label class="f">Name<input name="name" required value="${esc(ex?.name || '')}" placeholder="e.g. Standard Exercise 16"></label>
        <div class="row"><label class="f grow">Rounds (shots to count)<input name="rounds" type="number" inputmode="numeric" min="1" max="200" required value="${ex?.rounds || 16}"></label>
        <label class="f grow">Required scoring hits<input name="requiredHits" type="number" inputmode="numeric" min="0" max="200" required value="${ex?.requiredHits ?? 16}"></label></div>
        <p class="xs muted">Usually 2 per paper target. Max stage points = 5 × required hits.</p>
        <label class="f">Description / setup<textarea name="notes">${esc(ex?.notes || '')}</textarea></label>
        ${ex ? `<button type="button" class="btn danger" id="delEx" ${used ? 'disabled title="Used in runs"' : ''}>Delete exercise${used ? ` (used in ${used} runs)` : ''}</button>` : ''}`,
      onOpen: form => {
        const r = form.rounds, q = form.requiredHits;
        if (!ex) r.oninput = () => { q.value = r.value; };
        $('#delEx', form) && ($('#delEx', form).onclick = async () => {
          $('#modal').close();
          if (await confirmBox(`Delete exercise “${esc(ex.name)}”?`, 'Delete')) { Store.remove('exercises', ex.id); Store.data.sessions.forEach(s => s.exerciseIds = s.exerciseIds.filter(i => i !== ex.id)); Store.save(); route(); }
        });
      },
    });
    if (!v) return;
    Store.upsert('exercises', { ...(ex ? { id: ex.id } : {}), name: v.name.trim(), rounds: +v.rounds, requiredHits: +v.requiredHits, notes: v.notes.trim() });
    toast(ex ? 'Exercise updated' : 'Exercise created'); route();
  }

  // ======================================================================
  // shooters
  // ======================================================================
  function viewShooters() {
    setTitle('Shooters');
    const D = Store.data;
    const sorted = [...D.shooters].sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));
    view.innerHTML = `
      <div class="page-h"><div><h1>Shooters</h1><div class="sub">Club roster – pick participants per training session.</div></div>
        <button class="btn primary" id="newSh">${icon('plus')} New shooter</button></div>
      <div class="card tight list">${sorted.map(s => `<div class="item"><button class="grow" data-id="${s.id}" style="all:unset;cursor:pointer;flex:1;min-width:0"><div class="t">${esc(s.name)} ${s.active === false ? '<span class="badge">inactive</span>' : ''}</div>
        <div class="s">${esc(s.division || '—')} · ${s.pf} · ${usage('shooterId', s.id)} runs${s.notes ? ' · ' + esc(s.notes) : ''}</div></button>
        <a class="btn sm ghost" href="#/reports/p/${s.id}">${icon('reports')}</a></div>`).join('') || '<div class="empty">No shooters yet.</div>'}</div>`;
    $('#newSh').onclick = () => editShooter(null);
    $$('[data-id]').forEach(b => b.onclick = () => editShooter(Store.shooter(b.dataset.id)));
  }
  async function editShooter(s) {
    const used = s ? usage('shooterId', s.id) : 0;
    const v = await modal({
      title: s ? 'Edit shooter' : 'New shooter', submit: s ? 'Save' : 'Create',
      body: `<label class="f">Full name<input name="name" required value="${esc(s?.name || '')}"></label>
        <div class="row"><label class="f grow">Division<select name="division">${DIVISIONS.map(d => `<option ${s?.division === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="f grow">Power factor<select name="pf"><option value="minor" ${s?.pf !== 'major' ? 'selected' : ''}>Minor</option><option value="major" ${s?.pf === 'major' ? 'selected' : ''}>Major</option></select></label></div>
        <label class="f">Notes<textarea name="notes" placeholder="Equipment, goals…">${esc(s?.notes || '')}</textarea></label>
        <label class="check"><input type="checkbox" name="active" ${s?.active === false ? '' : 'checked'}> Active member</label>
        ${s ? `<button type="button" class="btn danger" id="delSh" ${used ? 'disabled' : ''}>Delete shooter${used ? ` (has ${used} runs – mark inactive instead)` : ''}</button>` : ''}`,
      onOpen: form => {
        $('#delSh', form) && ($('#delSh', form).onclick = async () => {
          $('#modal').close();
          if (await confirmBox(`Delete ${esc(s.name)}?`, 'Delete')) { Store.remove('shooters', s.id); Store.data.sessions.forEach(x => x.shooterIds = x.shooterIds.filter(i => i !== s.id)); Store.save(); route(); }
        });
      },
    });
    if (!v) return;
    Store.upsert('shooters', { ...(s ? { id: s.id } : {}), name: v.name.trim(), division: v.division, pf: v.pf, notes: v.notes.trim(), active: !!v.active });
    toast(s ? 'Shooter updated' : 'Shooter added'); route();
  }

  // ======================================================================
  // reports
  // ======================================================================
  function viewReports() {
    setTitle('Reports');
    const D = Store.data;
    const sessions = [...D.sessions].sort((a, b) => b.date.localeCompare(a.date));
    const allRuns = D.sessions.reduce((n, s) => n + s.runs.length, 0);
    view.innerHTML = `
      <div class="page-h"><div><h1>Reports</h1><div class="sub">Printable / PDF and CSV exports</div></div>
        <button class="btn" id="allCsv">${icon('download')} All runs CSV</button></div>
      <div class="kpis">
        <div class="kpi"><div class="k">Sessions</div><div class="v">${D.sessions.length}</div></div>
        <div class="kpi"><div class="k">Runs logged</div><div class="v">${allRuns}</div></div>
        <div class="kpi"><div class="k">Shooters</div><div class="v">${D.shooters.length}</div></div>
        <div class="kpi"><div class="k">Exercises</div><div class="v">${D.exercises.length}</div></div>
      </div>
      <div class="grid2">
        <div class="card tight"><div class="card-h" style="padding:14px 16px"><h2>Session reports</h2></div><div class="list">${sessions.map(s => `<a class="item" href="#/reports/s/${s.id}"><div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${fdate(s.date)} · ${s.runs.length} runs</div></div>${icon('chev')}</a>`).join('') || '<div class="empty">No sessions</div>'}</div></div>
        <div class="card tight"><div class="card-h" style="padding:14px 16px"><h2>Shooter progress</h2></div><div class="list">${D.shooters.map(s => `<a class="item" href="#/reports/p/${s.id}"><div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.division || '')} · ${usage('shooterId', s.id)} runs</div></div>${icon('chev')}</a>`).join('') || '<div class="empty">No shooters</div>'}</div></div>
      </div>`;
    $('#allCsv').onclick = () => download(`hitcore-all-runs-${today()}.csv`, csv(runsCsv(D.sessions)), 'text/csv');
  }
  function runsCsv(sessions) {
    const rows = [['session', 'date', 'location', 'shooter', 'division', 'exercise', 'attempt', 'power_factor', 'A', 'C', 'D', 'M', 'NS', 'P', 'points', 'penalty', 'score', 'time_s', 'hit_factor', 'draw_s', 'avg_split_s', 'shots', 'splits', 'source', 'recorded_at', 'recorded_by', 'edits', 'notes']];
    sessions.forEach(s => {
      const counter = {};
      [...s.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(r => {
        const sh = Store.shooter(r.shooterId), ex = Store.exercise(r.exerciseId), st = Reports.runStats(r);
        const k = r.shooterId + r.exerciseId; counter[k] = (counter[k] || 0) + 1;
        rows.push([s.name, s.date, s.location, sh?.name, sh?.division, ex?.name, counter[k], r.pf, r.A, r.C, r.D, r.M, r.NS, r.P, st.points, st.penalty, st.score, r.time.toFixed(2), st.hf != null ? st.hf.toFixed(4) : '',
          st.draw != null ? st.draw.toFixed(2) : '', st.avgSplit != null ? st.avgSplit.toFixed(2) : '', (r.splits || []).length, (r.splits || []).map(x => x.toFixed(2)).join(' '), r.source, r.createdAt, r.createdBy || '', (r.history || []).length, r.notes || '']);
      });
    });
    return rows;
  }
  const reportHeader = (title, sub) => `<div class="print-only"><div class="logo"><span class="mark">◎</span>HitCore</div><p class="muted small">Generated ${new Date().toLocaleString()} by ${esc(me.name)}</p><br></div>
    <div class="page-h"><div><h1>${title}</h1><div class="sub">${sub}</div></div>
    <div class="row wrap no-print"><button class="btn" id="csvBtn">${icon('download')} CSV</button><button class="btn primary" onclick="window.print()">${icon('print')} Print / PDF</button></div></div>`;

  function viewSessionReport(id) {
    const sess = Store.session(id); if (!sess) return go('#/reports');
    setTitle('Session report', true);
    const rep = Reports.session(sess, Store);
    const avgHF = Reports.mean(sess.runs.map(r => Reports.runStats(r).hf || 0));
    view.innerHTML = `${reportHeader(esc(sess.name), `${fdate(sess.date)}${sess.location ? ' · ' + esc(sess.location) : ''}`)}
      ${sess.notes ? `<p class="muted small">${esc(sess.notes)}</p>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="k">Participants</div><div class="v">${sess.shooterIds.length}</div></div>
        <div class="kpi"><div class="k">Exercises</div><div class="v">${sess.exerciseIds.length}</div></div>
        <div class="kpi"><div class="k">Runs</div><div class="v">${sess.runs.length}</div></div>
        <div class="kpi"><div class="k">Avg hit factor</div><div class="v">${fmt(avgHF, 2)}</div></div>
      </div>
      <div class="card tight"><div class="card-h" style="padding:14px 16px"><h2>Overall standings</h2><span class="xs muted">stage points: best attempt per exercise, IPSC method</span></div>
        <div class="tablewrap"><table><thead><tr><th>#</th><th class="l">Shooter</th><th class="l">Division</th><th>Stage pts</th><th>%</th><th>Runs</th><th>Avg HF</th><th>Best HF</th><th>Alpha %</th><th>Avg draw</th><th>Avg split</th><th>M / NS / P</th></tr></thead><tbody>
        ${rep.overall.map(o => `<tr class="${o.place === 1 && o.stagePoints ? 'top' : ''}"><td>${o.place}</td><td class="l">${esc(o.shooter.name)}</td><td class="l">${esc(o.shooter.division || '')}</td><td>${o.stagePoints.toFixed(1)}</td><td>${o.pct.toFixed(1)}</td><td>${o.runs}</td><td>${fmt(o.avgHF, 2)}</td><td class="hf">${fmt(o.bestHF, 2)}</td><td>${pct(o.accuracy)}</td><td>${fmt(o.avgDraw)}</td><td>${fmt(o.avgSplit)}</td><td>${o.totals.M} / ${o.totals.NS} / ${o.totals.P}</td></tr>`).join('')}
        </tbody></table></div></div>
      ${rep.exercises.map(e => `<div class="card tight"><div class="card-h" style="padding:14px 16px"><h2>${esc(e.exercise.name)}</h2><span class="xs muted">${e.exercise.rounds} rounds · max ${e.maxPoints} pts · ${e.runs} runs</span></div>
        ${e.ranked.length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th class="l">Shooter</th><th>HF</th><th>Time</th><th>A</th><th>C</th><th>D</th><th>M</th><th>NS</th><th>P</th><th>Score</th><th>Draw</th><th>Attempts</th><th>Stage pts</th><th>%</th></tr></thead><tbody>
        ${e.ranked.map(x => `<tr class="${x.place === 1 ? 'top' : ''}"><td>${x.place}</td><td class="l">${esc(x.shooter.name)}</td><td class="hf">${fmt(x.hf, 4)}</td><td>${x.run.time.toFixed(2)}</td><td>${x.run.A}</td><td>${x.run.C}</td><td>${x.run.D}</td><td>${x.run.M}</td><td>${x.run.NS}</td><td>${x.run.P}</td><td>${x.score}</td><td>${fmt(x.draw)}</td><td>${x.attempts}</td><td>${x.stagePoints.toFixed(1)}</td><td>${x.pct.toFixed(1)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No runs</div>'}</div>`).join('')}`;
    $('#csvBtn').onclick = () => download(`hitcore-${sess.date}-${sess.name.replace(/[^\w-]+/g, '_')}.csv`, csv(runsCsv([sess])), 'text/csv');
  }

  function viewShooterReport(id) {
    const sh = Store.shooter(id); if (!sh) return go('#/reports');
    setTitle('Shooter report', true);
    const rep = Reports.shooter(sh, Store);
    const allHF = rep.rows.map(x => x.hf || 0);
    view.innerHTML = `${reportHeader(esc(sh.name), `${esc(sh.division || '')} · ${sh.pf} · ${rep.sessions} sessions`)}
      <div class="kpis">
        <div class="kpi"><div class="k">Runs</div><div class="v">${rep.rows.length}</div></div>
        <div class="kpi"><div class="k">Avg hit factor</div><div class="v">${fmt(Reports.mean(allHF), 2)}</div></div>
        <div class="kpi"><div class="k">Alpha %</div><div class="v">${pct(Reports.mean(rep.rows.map(x => x.accuracy).filter(x => x != null)))}</div></div>
        <div class="kpi"><div class="k">Avg draw</div><div class="v">${fmt(Reports.mean(rep.rows.map(x => x.draw).filter(x => x != null)))}</div></div>
      </div>
      <div class="card tight"><div class="card-h" style="padding:14px 16px"><h2>By exercise</h2><span class="xs muted">trend = last vs first attempt</span></div>
        ${rep.exercises.length ? `<div class="tablewrap"><table><thead><tr><th class="l">Exercise</th><th>Attempts</th><th>Best HF</th><th>Avg HF</th><th>Trend</th><th>Best time</th><th>Alpha %</th><th>Avg draw</th><th>Avg split</th></tr></thead><tbody>
        ${rep.exercises.map(e => { const d = e.lastHF - e.firstHF; return `<tr><td class="l">${esc(e.exercise.name)}</td><td>${e.attempts}</td><td class="hf">${fmt(e.bestHF, 4)}</td><td>${fmt(e.avgHF, 2)}</td><td class="${e.attempts > 1 ? (d >= 0 ? 'ok' : 'bad') : ''}">${e.attempts > 1 ? (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(2) : '—'}</td><td>${e.bestTime.toFixed(2)}</td><td>${pct(e.accuracy)}</td><td>${fmt(e.avgDraw)}</td><td>${fmt(e.avgSplit)}</td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="empty">No runs yet</div>'}</div>
      <div class="card tight"><div class="card-h" style="padding:14px 16px"><h2>Run history</h2></div>
        ${rep.rows.length ? `<div class="tablewrap"><table><thead><tr><th class="l">Date</th><th class="l">Session</th><th class="l">Exercise</th><th>HF</th><th>Time</th><th>A/C/D/M</th><th>NS/P</th><th>Draw</th><th>Avg split</th><th class="no-print"></th></tr></thead><tbody>
        ${rep.rows.slice().reverse().map(x => `<tr><td class="l">${fdate(x.sess.date)}</td><td class="l">${esc(x.sess.name)}</td><td class="l">${esc(x.ex?.name || '—')}</td><td class="hf">${fmt(x.hf, 4)}</td><td>${x.r.time.toFixed(2)}</td><td>${x.r.A}/${x.r.C}/${x.r.D}/${x.r.M}</td><td>${x.r.NS}/${x.r.P}</td><td>${fmt(x.draw)}</td><td>${fmt(x.avgSplit)}</td><td class="no-print"><a href="#/s/${x.sess.id}/edit/${x.r.id}">edit</a></td></tr>`).join('')}
        </tbody></table></div>` : ''}</div>`;
    $('#csvBtn').onclick = () => {
      const all = runsCsv(Store.data.sessions), head = all[0], col = head.indexOf('shooter');
      download(`hitcore-${sh.name.replace(/[^\w-]+/g, '_')}.csv`, csv([head, ...all.slice(1).filter(r => r[col] === sh.name)]), 'text/csv');
    };
  }

  // ======================================================================
  // settings
  // ======================================================================
  function viewSettings() {
    setTitle('Settings');
    const S = Store.data.settings;
    const beepTxt = () => S.beepSig ? `${S.beepSig.freq} Hz · ${S.beepSig.dur} ms · learned ×${S.beepCount || 1}` : 'Not learned – accepts any steady 1.5–4.5 kHz tone';
    view.innerHTML = `
      <div class="page-h"><div><h1>Settings</h1><div class="sub">Shot detection, data and account</div></div></div>
      <div class="grid2">
      <div class="card">
        <div class="card-h"><h2>Shot detection</h2><span class="badge ${timer.det ? 'good' : ''}" id="micBadge">${timer.det ? 'mic on' : 'mic off'}</span></div>
        ${levelMeter()}
        <button class="btn" id="micBtn" ${timer.det ? 'disabled' : ''}>${icon('mic')} ${timer.det ? 'Microphone enabled' : 'Enable microphone'}</button>
        <label class="f">Sensitivity <span id="sensV">${S.sensitivity}</span><input type="range" id="sens" min="1" max="100" value="${S.sensitivity}"></label>
        <p class="xs muted">The orange mark on the meter is the trigger level. Shots must cross it; lower the sensitivity if neighbouring bays get counted.</p>
        <label class="check"><input type="checkbox" id="fss" ${S.firstShotStart ? 'checked' : ''}> Start clock on the first shot if no beep is heard</label>
        <div class="row"><label class="f grow">Own beep delay min (s)<input id="dmin" type="number" step="0.5" min="0" value="${S.delayMin}"></label><label class="f grow">max (s)<input id="dmax" type="number" step="0.5" min="0" value="${S.delayMax}"></label></div>
        <label class="f">Keep listening after last expected shot (s)<input id="ot" type="number" step="0.5" min="0" max="10" value="${S.overtimeSec}"></label>
      </div>
      <div class="card">
        <div class="card-h"><h2>Coach beep</h2></div>
        <p class="small muted" id="beepTxt">${beepTxt()}</p>
        <p class="xs muted">Press <b>Learn</b>, then trigger the coach's timer once near the phone. Its pitch and length are stored, so the clock starts only on that beep – not on shots from other bays. Repeat to refine.</p>
        <div class="row"><button class="btn primary grow" id="learn">Learn beep</button><button class="btn ghost" id="forget">Forget</button></div>
        <div id="learnState" class="small"></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Data</h2></div>
        <p class="xs muted">All data is stored on this device for user <b>${esc(me.u)}</b>. Back up regularly or move data between devices with export / import.</p>
        <div class="row wrap"><button class="btn" id="exp">${icon('download')} Backup (JSON)</button><button class="btn" id="imp">Import backup</button><input type="file" id="impFile" accept="application/json,.json" hidden></div>
        <button class="btn danger" id="reset">Reset to demo data</button>
      </div>
      <div class="card">
        <div class="card-h"><h2>Account</h2></div>
        <div class="row"><div class="avatar">${esc(me.name.split(' ').map(w => w[0]).join(''))}</div><div class="grow"><div>${esc(me.name)}</div><div class="xs muted">${esc(me.role)} · ${esc(me.u)} · signed in ${ftime(me.since)}</div></div></div>
        <button class="btn" data-logout>Sign out</button>
        <p class="xs muted">HitCore demo · IPSC scoring (Comstock), minor/major power factor.</p>
      </div></div>`;
    $('#micBtn').onclick = async () => { try { await enableMic(); viewSettings(); } catch (e) { toast('Microphone unavailable: ' + (e.message || e.name), 'error'); } };
    $('#sens').oninput = e => { Store.setting('sensitivity', +e.target.value); $('#sensV').textContent = e.target.value; timerApplySettings();
      const db = -4 - 0.4 * (e.target.value - 1); $('#lvl .th').style.left = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%'; };
    $('#fss').onchange = e => { Store.setting('firstShotStart', e.target.checked); timerApplySettings(); };
    $('#dmin').onchange = e => Store.setting('delayMin', Math.max(0, +e.target.value || 0));
    $('#dmax').onchange = e => Store.setting('delayMax', Math.max(0, +e.target.value || 0));
    $('#ot').onchange = e => Store.setting('overtimeSec', Math.max(0, +e.target.value || 0));
    $('#learn').onclick = async () => {
      if (!timer.det) { try { await enableMic(); } catch (e) { return toast('Microphone unavailable', 'error'); } }
      timer.learn(); $('#learnState').innerHTML = '<span class="warn">Listening… trigger the coach beep now.</span>';
    };
    hooks.learn = sig => {
      const el = $('#learnState');
      if (!sig || !sig.ok) { el && (el.innerHTML = '<span class="bad">No clean tone heard – move closer to the timer and try again.</span>'); return; }
      const prev = S.beepSig, n = S.beepCount || 0, fresh = !prev || Math.abs(prev.freq - sig.freq) > 150;
      const merged = fresh ? { freq: sig.freq, dur: sig.dur } : { freq: Math.round((prev.freq * n + sig.freq) / (n + 1)), dur: Math.round((prev.dur * n + sig.dur) / (n + 1)) };
      Store.setting('beepSig', merged); Store.setting('beepCount', fresh ? 1 : n + 1); timerApplySettings();
      el && (el.innerHTML = `<span class="ok">✓ Learned ${sig.freq} Hz, ${sig.dur} ms</span>`); $('#beepTxt') && ($('#beepTxt').textContent = beepTxt());
    };
    leaveGuard = () => { hooks.learn = null; if (timerState === 'learn') timer.reset(); };
    $('#forget').onclick = () => { Store.setting('beepSig', null); Store.setting('beepCount', 0); timerApplySettings(); $('#beepTxt').textContent = beepTxt(); };
    $('#exp').onclick = () => download(`hitcore-backup-${me.u}-${today()}.json`, Store.exportJSON(), 'application/json');
    $('#imp').onclick = () => $('#impFile').click();
    $('#impFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { Store.importJSON(JSON.parse(await f.text())); toast('Backup imported'); } catch (err) { toast('Import failed: ' + err.message, 'error'); }
      e.target.value = '';
    };
    $('#reset').onclick = async () => { if (await confirmBox('Erase all sessions, shooters and exercises and restore the demo data?', 'Reset')) { Store.resetDemo(); toast('Demo data restored'); go('#/sessions'); } };
  }

  // ======================================================================
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  start();
})();
