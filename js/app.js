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
  const arr = v => v == null ? [] : [].concat(v);
  const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const DIVISIONS = ['Production', 'Production Optics', 'Standard', 'Open', 'Classic', 'Revolver', 'PCC'];

  const ICONS = {
    sessions: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
    exercises: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    shooters: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    repeat: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    print: '<path d="M6 9V3h12v6M6 18H4V10h16v8h-2"/><rect x="6" y="14" width="12" height="7"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
    alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  // Split grade glyphs – each grade has its own shape so meaning never relies on colour.
  const GRADE = {
    fast: { label: 'Fast', svg: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.3l2.2 2.2 4.2-4.6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    ok: { label: 'OK', svg: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5 8h6" stroke="#0b0b0b" stroke-width="1.8" stroke-linecap="round"/></svg>' },
    slow: { label: 'Slow', svg: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l7 12.6H1z" fill="currentColor"/><path d="M8 6v3.6M8 11.6v.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    pause: { label: 'Reload / move', svg: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.4 5.5v5M9.6 5.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
  };
  const gradePill = g => `<span class="gp"><span class="gi-${g}" style="display:inline-flex">${GRADE[g].svg}</span>${GRADE[g].label}</span>`;

  function toast(msg, kind) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast' + (kind ? ' ' + kind : ''), 2400);
  }

  // Generic modal form. onSubmit(values, form) may return false to keep it open.
  function modal({ title, body, submit = 'Save', cancel = 'Cancel', danger = false, onSubmit, onOpen }) {
    const dlg = $('#modal'), form = $('#modalForm');
    form.innerHTML = `<div class="dh">${esc(title)}</div><div class="db">${body}</div>
      <div class="df">${cancel ? `<button type="button" class="btn" data-close>${esc(cancel)}</button>` : ''}<button type="submit" class="btn ${danger ? 'solid-danger' : 'primary'}">${esc(submit)}</button></div>`;
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
      setTimeout(() => $('input:not([type=checkbox]),select,textarea', form)?.focus(), 60);
    });
  }
  const confirmBox = (msg, ok = 'Confirm', danger = true) => modal({ title: msg, body: '<p class="small muted">This can’t be undone.</p>', submit: ok, danger }).then(v => !!v);
  const checkList = (name, items, checked) => items.length ? `<div class="checklist">${items.map(it => `<label class="check"><input type="checkbox" name="${name}" value="${it.id}" ${checked.includes(it.id) ? 'checked' : ''}> ${esc(it.name)}</label>`).join('')}</div>` : '<span class="field-hint">Nothing to add.</span>';
  const emptyState = (ic, text) => `<div class="empty">${icon(ic)}<div>${text}</div></div>`;

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const file = new File([blob], name, { type });
    if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

  // appearance
  function applyTheme(t) {
    try { localStorage.setItem('hitcore.theme', t); } catch (e) {}
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }
  const currentTheme = () => { try { return localStorage.getItem('hitcore.theme') || 'system'; } catch (e) { return 'system'; } };

  // chart tooltip (hover on desktop, tap on touch)
  const tip = $('#tip');
  const showTip = (el, x, y) => { tip.innerHTML = el.dataset.tip; tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px'; tip.style.top = Math.max(8, y - r.height - 12) + 'px'; };
  document.addEventListener('pointerover', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType === 'mouse') showTip(b, e.clientX, b.getBoundingClientRect().top); });
  document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]') && e.pointerType === 'mouse') tip.hidden = true; });
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-tip]');
    if (b && e.pointerType !== 'mouse') { const r = b.getBoundingClientRect(); showTip(b, r.left + r.width / 2, r.top); clearTimeout(tip._h); tip._h = setTimeout(() => tip.hidden = true, 1800); }
    else if (!b) tip.hidden = true;
  });

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
    btn.disabled = true; btn.textContent = 'Signing in…'; $('#loginErr').textContent = '';
    try { await Auth.login(f.username.value, f.password.value, f.remember.checked); f.password.value = ''; start(); }
    catch (err) { $('#loginErr').textContent = err.message; f.password.select(); }
    btn.disabled = false; btn.textContent = 'Sign In';
  };
  async function logout() {
    if (!(await confirmBox('Sign out of HitCore?', 'Sign Out', false))) return;
    if (timer.det) timer.reset();
    Auth.logout(); me = null; history.replaceState(null, '', location.pathname); showLogin();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) logout(); });
  $('#topAvatar').onclick = () => go('#/settings');
  $('#backBtn').onclick = () => history.length > 1 ? history.back() : go('#/sessions');

  function start() {
    me = Auth.current();
    if (!me) return showLogin();
    Store.load(me.u);
    $('#login').hidden = true; $('#shell').hidden = false;
    $('#sideAvatar').textContent = $('#topAvatar').textContent = initials(me.name);
    $('#sideName').textContent = me.name; $('#sideRole').textContent = me.role;
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
  function setTitle(t, back) {
    $('#viewTitle').textContent = t; $('#backBtn').hidden = !back; document.title = t + ' – HitCore';
    $('#backLabel').textContent = typeof back === 'string' ? back : 'Back';
  }
  function route() {
    if (!me || !Auth.current()) return showLogin();
    if (leaveGuard) { leaveGuard(); leaveGuard = null; }
    tip.hidden = true;
    const h = location.hash;
    for (const [re, fn, nav] of routes) {
      const m = h.match(re);
      if (m) {
        $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
        view.style.animation = 'none'; view.offsetHeight; view.style.animation = '';
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
    setTitle('Sessions');
    const D = Store.data;
    const list = [...D.sessions].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    view.innerHTML = `
      <div class="page-h"><div><h1>Training Sessions</h1><div class="sub">${list.length} sessions · ${D.shooters.filter(s => s.active !== false).length} active shooters · ${D.exercises.length} exercises</div></div>
        <button class="btn primary" id="newSess">${icon('plus')} New Session</button></div>
      <div class="card tight list">${list.map(s => {
        const isToday = s.date === today();
        return `<a class="item" href="#/s/${s.id}"><span class="lead-ic">${icon('sessions')}</span><div class="grow"><div class="t">${esc(s.name)} ${isToday ? '<span class="badge accent">Today</span>' : ''}</div>
          <div class="s">${fdate(s.date)}${s.location ? ' · ' + esc(s.location) : ''}</div></div>
          <div class="meta">${s.runs.length} runs<br>${s.shooterIds.length} shooters</div>${icon('chev')}</a>`;
      }).join('') || emptyState('sessions', 'No sessions yet.<br>Create the first one to start logging.')}</div>`;
    $('#newSess').onclick = () => editSession(null);
  }

  async function editSession(sess) {
    const D = Store.data;
    const shooters = D.shooters.filter(s => s.active !== false || sess?.shooterIds.includes(s.id));
    const vals = await modal({
      title: sess ? 'Edit Session' : 'New Training Session',
      submit: sess ? 'Save' : 'Create',
      body: `
        <label class="f">Name<input name="name" required value="${esc(sess ? sess.name : 'Training ' + fdate(today()))}"></label>
        <div class="row"><label class="f grow">Date<input name="date" type="date" required value="${sess ? sess.date : today()}"></label>
        <label class="f grow">Location<input name="location" value="${esc(sess?.location || '')}" placeholder="Range, bay"></label></div>
        <div class="f">Participants ${checkList('shooterIds', shooters, sess ? sess.shooterIds : shooters.map(s => s.id))}</div>
        <div class="row"><input id="quickShooter" placeholder="Add a new participant"><button type="button" class="btn" id="quickShooterBtn">Add</button></div>
        <div class="f">Exercises ${checkList('exerciseIds', D.exercises, sess ? sess.exerciseIds : D.exercises.map(e => e.id))}</div>
        <label class="f">Notes<textarea name="notes" placeholder="Goals, conditions…">${esc(sess?.notes || '')}</textarea></label>`,
      onOpen: form => {
        const add = () => {
          const name = $('#quickShooter', form).value.trim(); if (!name) return;
          const s = Store.upsert('shooters', { name, division: 'Production', pf: 'minor', active: true, notes: '' });
          const list = $$('.checklist', form)[0];
          const html = `<label class="check"><input type="checkbox" name="shooterIds" value="${s.id}" checked> ${esc(s.name)}</label>`;
          if (list) list.insertAdjacentHTML('beforeend', html); else $('#quickShooter', form).closest('.row').insertAdjacentHTML('beforebegin', `<div class="checklist">${html}</div>`);
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
  const attemptsOf = (sess, shooterId, exId) => sess.runs.filter(r => r.shooterId === shooterId && r.exerciseId === exId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function viewSession(id) {
    const sess = Store.session(id); if (!sess) return go('#/sessions');
    setTitle(sess.name, 'Sessions');
    const exs = sess.exerciseIds.map(Store.exercise).filter(Boolean);
    const shooters = sess.shooterIds.map(Store.shooter).filter(Boolean);
    const exId = sessUI[id] && sess.exerciseIds.includes(sessUI[id]) ? sessUI[id] : exs[0]?.id;
    sessUI[id] = exId;
    const ex = Store.exercise(exId);
    const rep = Reports.session(sess, Store);
    const exRep = rep.exercises.find(e => e.exercise.id === exId);
    const done = ex ? shooters.filter(sh => attemptsOf(sess, sh.id, ex.id).length).length : 0;

    view.innerHTML = `
      <div class="page-h"><div><h1>${esc(sess.name)}</h1><div class="sub">${fdate(sess.date)}${sess.location ? ' · ' + esc(sess.location) : ''} · ${sess.runs.length} runs</div></div>
        <div class="row wrap"><button class="btn" id="editSess">${icon('edit')} Edit</button><a class="btn" href="#/reports/s/${sess.id}">${icon('reports')} Report</a></div></div>
      ${sess.notes ? `<p class="small muted">${esc(sess.notes)}</p>` : ''}
      <div class="card">
        <div class="card-h"><h2>Exercise</h2><button class="btn ghost sm" id="addEx">${icon('plus')} Add</button></div>
        <div class="chips" role="tablist">${exs.map(e => `<button class="chip ${e.id === exId ? 'on' : ''}" role="tab" aria-selected="${e.id === exId}" data-ex="${e.id}">${esc(e.name)}</button>`).join('') || '<span class="small muted">No exercises in this session yet.</span>'}</div>
        ${ex ? `<div class="small muted">${ex.rounds} rounds · ${ex.requiredHits} required hits · max ${Reports.maxPoints(ex)} points${ex.notes ? ' — ' + esc(ex.notes) : ''}</div>` : ''}
      </div>
      ${ex ? `
      <div class="grid2 wide-l">
      <div class="card tight">
        <div class="card-h"><h2>Shooters <span class="faint" style="font-weight:400">· ${done} of ${shooters.length} shot</span></h2><button class="btn ghost sm" id="addSh">${icon('plus')} Add</button></div>
        <div>${shooters.map(sh => {
          const atts = attemptsOf(sess, sh.id, ex.id);
          const best = atts.reduce((b, r) => { const hf = Reports.runStats(r).hf || 0; return hf > (b?.hf ?? -1) ? { id: r.id, hf } : b; }, null);
          return `<div class="srow"><div style="display:flex;gap:10px;align-items:center;min-width:0"><span class="avatar" style="cursor:default">${esc(initials(sh.name))}</span><div style="min-width:0"><div class="name">${esc(sh.name)}</div><div class="xs muted">${esc(sh.division || '')} · ${sh.pf === 'major' ? 'Major' : 'Minor'}</div></div></div>
            <button class="btn ${atts.length ? '' : 'primary'} sm" data-run="${sh.id}">${icon(atts.length ? 'repeat' : 'play')} ${atts.length ? 'Repeat' : 'Start'}</button>
            ${atts.length ? `<div class="att">${atts.map((r, i) => { const st = Reports.runStats(r); return `<button data-edit="${r.id}" class="${best && best.id === r.id ? 'best' : ''}" title="Open attempt ${i + 1}"><span class="n">#${i + 1}</span>${r.time.toFixed(2)}s · HF <b>${fmt(st.hf, 2)}</b></button>`; }).join('')}</div>` : ''}
          </div>`;
        }).join('') || emptyState('shooters', 'No participants yet.')}</div>
      </div>
      <div class="card tight">
        <div class="card-h"><h2>Ranking</h2><span class="xs faint">best attempt counts</span></div>
        ${exRep && exRep.ranked.length ? `<div class="tablewrap"><table><thead><tr><th class="l">#</th><th class="l">Shooter</th><th>HF</th><th>Time</th><th>%</th></tr></thead><tbody>
          ${exRep.ranked.map(x => `<tr class="${x.place === 1 ? 'top' : ''}"><td class="l"><span class="place">${x.place}</span></td><td class="l">${esc(x.shooter.name)}</td><td class="hf">${fmt(x.hf, 4)}</td><td>${x.run.time.toFixed(2)}</td><td>${x.pct.toFixed(1)}</td></tr>`).join('')}
          </tbody></table></div>` : emptyState('reports', 'No runs for this exercise yet.')}
      </div></div>` : ''}`;

    $('#editSess').onclick = () => editSession(sess);
    $$('[data-ex]').forEach(b => b.onclick = () => { sessUI[id] = b.dataset.ex; viewSession(id); });
    $$('[data-run]').forEach(b => b.onclick = () => go(`#/s/${id}/run/${exId}/${b.dataset.run}`));
    $$('[data-edit]').forEach(b => b.onclick = () => go(`#/s/${id}/edit/${b.dataset.edit}`));
    $('#addEx').onclick = async () => {
      const others = Store.data.exercises.filter(e => !sess.exerciseIds.includes(e.id));
      const v = await modal({ title: 'Add Exercises', submit: 'Add', body: `${checkList('ids', others, [])}<div class="small muted">Need a new drill? <a href="#/exercises" data-close>Create it in Exercises</a>.</div>` });
      if (v && arr(v.ids).length) { sess.exerciseIds.push(...arr(v.ids)); sessUI[id] = arr(v.ids)[0]; Store.save(); viewSession(id); }
    };
    $('#addSh') && ($('#addSh').onclick = async () => {
      const others = Store.data.shooters.filter(s => !sess.shooterIds.includes(s.id) && s.active !== false);
      const v = await modal({ title: 'Add Participants', submit: 'Add', body: `${checkList('ids', others, [])}<label class="f">New participant<input name="newName" placeholder="Full name"></label>` });
      if (!v) return;
      sess.shooterIds.push(...arr(v.ids));
      if (v.newName && v.newName.trim()) sess.shooterIds.push(Store.upsert('shooters', { name: v.newName.trim(), division: 'Production', pf: 'minor', active: true, notes: '' }).id);
      Store.save(); viewSession(id);
    });
  }

  // ======================================================================
  // splits panel – shared by live run, scoring and editing
  // ======================================================================
  const gradeCfg = () => Store.data.settings.grade;
  function liveBaseline() {
    if (!live || gradeCfg().mode !== 'personal' || !live.sh.id) return null;
    return Reports.baseline(Store, live.sh.id, live.ex.id, live.run?.id, gradeCfg().pause);
  }
  function splitPanel(shots, { editable = false, rounds = 0, flashLast = false, base = null } = {}) {
    const cfg = gradeCfg();
    const graded = Reports.gradeSplits(shots, cfg, base);
    const sum = Reports.splitSummary(graded);
    const target = base ? base.split : cfg.splitFast;
    // chart: one bar per split (draw shown as a stat – it would dwarf the splits)
    const sp = graded.filter(g => g.kind === 'split');
    const maxV = Math.max(cfg.splitOk * 1.6, ...sp.filter(g => g.grade !== 'pause').map(g => g.split));
    const bars = sp.map(g => {
      const capped = g.split > maxV, h = Math.max(4, Math.min(1, g.split / maxV) * 100);
      return `<span class="b g-${g.grade} ${capped ? 'capped' : ''}" style="height:${h}%" data-tip="Shot ${g.i + 1} · <b>+${g.split.toFixed(2)}s</b><br>${GRADE[g.grade].label}"></span>`;
    }).join('');
    const refTop = 100 - Math.min(1, target / maxV) * 100;
    const modeNote = gradeCfg().mode === 'personal'
      ? (base ? `vs. personal median ${base.split.toFixed(2)}s (${base.runs} runs)` : 'not enough history – using fixed targets')
      : `targets: split ≤ ${cfg.splitFast.toFixed(2)}s fast, ≤ ${cfg.splitOk.toFixed(2)}s OK`;
    const rows = graded.map(g => `<tr class="${rounds && g.i >= rounds ? 'extra' : ''} ${flashLast && g.i === shots.length - 1 ? 'new' : ''}">
        <td>${g.i + 1}${rounds && g.i >= rounds ? '+' : ''}</td>
        <td class="t">${editable ? `<button class="val" data-ed="${g.i}" title="Correct this shot">${g.t.toFixed(2)}</button>` : g.t.toFixed(2)}</td>
        <td class="sp">${g.kind === 'draw' ? '<span class="faint">draw</span> ' + g.split.toFixed(2) : '+' + g.split.toFixed(2)}</td>
        <td class="g">${gradePill(g.grade)}</td>
        ${editable ? `<td class="x"><button class="del" data-del="${g.i}" title="Remove shot" aria-label="Remove shot ${g.i + 1}">✕</button></td>` : ''}
      </tr>`).join('');
    return `
      <div class="sstats">
        <div><div class="k">Draw</div><div class="v">${fmt(sum.draw)}</div></div>
        <div><div class="k">Avg split</div><div class="v">${fmt(sum.avg)}</div></div>
        <div><div class="k">Best split</div><div class="v">${fmt(sum.best)}</div></div>
        <div><div class="k">Fast</div><div class="v">${sum.fastShare == null ? '—' : pct(sum.fastShare)}</div></div>
      </div>
      ${sp.length ? `<div class="splitchart" role="img" aria-label="Split times bar chart, ${sp.length} splits">${bars}<div class="ref" style="top:${refTop}%"><span>${base ? 'your median' : 'fast'} ${target.toFixed(2)}</span></div></div>` : ''}
      <div class="legend">${['fast', 'ok', 'slow', 'pause'].map(g => `<span>${gradePill(g)}${g === 'pause' ? '' : ` <span class="faint tnum">${g === 'fast' ? sum.counts.fast : g === 'ok' ? sum.counts.ok : sum.counts.slow}</span>`}</span>`).join('')}</div>
      <div class="xs faint">Graded ${modeNote}</div>
      ${shots.length ? `<table class="splits"><tbody>${rows}</tbody></table>` : `<div class="small muted">${editable ? 'No shots recorded – enter the total time manually, or add shots below.' : 'Shots appear here as they are detected.'}</div>`}`;
  }

  // ======================================================================
  // live run & edit run
  // ======================================================================
  const timer = new ShotTimer();
  let live = null;
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
  const hooks = {};
  timer.on('state', s => { timerState = s; hooks.state && hooks.state(s); });
  timer.on('beep', () => { timerState = 'running'; navigator.vibrate?.(40); hooks.beep && hooks.beep(); });
  timer.on('shot', shots => hooks.shot && hooks.shot(shots[shots.length - 1], shots));
  timer.on('learn', sig => hooks.learn && hooks.learn(sig));
  timer.on('level', p => {
    const el = $('#lvl .bar'); if (!el) return;
    const db = 20 * Math.log10(p + 1e-6); el.style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
  });
  const threshPos = () => { const db = -4 - 0.4 * (Store.data.settings.sensitivity - 1); return Math.max(0, Math.min(100, (db + 60) / 60 * 100)); };
  const levelMeter = () => `<div class="level-wrap" style="width:min(340px,100%)">${icon('mic')}<div class="level grow" id="lvl" title="Input level – the blue mark is the trigger level"><div class="bar"></div><div class="th" style="left:${threshPos()}%"></div></div></div>`;

  function viewRunLive(sid, exId, shooterId) {
    const sess = Store.session(sid), ex = Store.exercise(exId), sh = Store.shooter(shooterId);
    if (!sess || !ex || !sh) return go('#/sessions');
    const attempt = attemptsOf(sess, sh.id, ex.id).length + 1;
    live = { mode: 'new', sid, ex, sh, attempt, phase: 'timer', shots: [], time: null, timeManual: false,
      h: { A: 0, C: 0, D: 0, M: 0, NS: 0, P: 0 }, pf: sh.pf || 'minor', notes: '', listening: false };
    live.base = liveBaseline();
    setTitle(sh.name, sess.name);
    renderRun();
    if (timer.det) timer.arm();
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
    live.base = liveBaseline();
    setTitle(live.sh.name, sess.name);
    renderRun();
    leaveGuard = () => { live = null; };
  }

  const runHeader = () => `<div class="run-h"><div><h1>${esc(live.sh.name)}</h1><div class="crumb">${esc(live.ex.name)} · Attempt ${live.attempt} · ${live.ex.rounds || '?'} rounds</div></div>
      ${live.mode === 'edit' ? '<span class="badge">Saved run</span>' : '<span class="badge live"><span class="dot"></span>Live</span>'}</div>`;
  const renderRun = () => { if (!live) return; live.phase === 'timer' ? renderTimerPhase() : renderScorePhase(); };

  // ---------- phase 1: listen, count shots ----------
  const STATE_TEXT = { off: 'Microphone off', idle: 'Ready', armed: 'Waiting for beep', standby: 'Stand by', running: 'Shooting', stopped: 'Stopped', learn: 'Learning beep' };
  function renderTimerPhase() {
    const n = live.ex.rounds || 0;
    view.innerHTML = `${runHeader()}
      <div class="grid2">
        <div class="stack" style="gap:16px">
          <div class="card clock">
            <div class="state" id="st"><span class="dot"></span><span id="stT"></span></div>
            <div class="time" id="clk">0.00</div>
            <div class="count"><b id="cnt">0</b> / ${n || '–'} shots</div>
            <div class="progress"><div id="prog"></div></div>
            ${levelMeter()}
          </div>
          <div class="stack" id="ctl"></div>
        </div>
        <div class="card"><div class="card-h"><h2>Splits</h2><span class="xs faint">scoring opens after shot ${n || 'N'}</span></div><div class="stack" id="splitBox"></div></div>
      </div>`;
    hooks.state = updateTimerUI; hooks.beep = updateTimerUI;
    hooks.shot = t => {
      live.shots.push(+t.toFixed(3));
      updateTimerUI(true);
      if (n && live.shots.length >= n) goScore(true);
    };
    updateTimerUI();
    tick();
  }
  function updateTimerUI(newShot) {
    if (!live || live.phase !== 'timer' || !$('#st')) return;
    const s = timer.det ? timerState : 'off';
    $('#stT').textContent = STATE_TEXT[s] || s;
    $('#st').className = 'state ' + (s === 'running' ? 'running' : ['armed', 'standby', 'learn'].includes(s) ? 'armed' : '');
    const n = live.ex.rounds || 0, sh = live.shots;
    $('#cnt').textContent = sh.length;
    $('#prog').style.width = n ? Math.min(100, sh.length / n * 100) + '%' : '0';
    if (s !== 'running') $('#clk').textContent = sh.length ? sh[sh.length - 1].toFixed(2) : '0.00';
    $('#splitBox').innerHTML = splitPanel(sh, { rounds: n, flashLast: newShot === true, base: live.base });
    const busy = ['armed', 'standby', 'running'].includes(s);
    const key = (timer.det ? 1 : 0) + s + (sh.length ? 1 : 0);
    if ($('#ctl').dataset.key === key) return; // keep buttons stable while shooting
    $('#ctl').dataset.key = key;
    $('#ctl').innerHTML = !timer.det
      ? `<button class="btn primary lg block" id="micOn">${icon('mic')} Enable Microphone</button>
         <button class="btn ghost block" id="manual">${icon('keyboard')} Enter time manually</button>`
      : `<div class="row">${busy
          ? `<button class="btn solid-danger lg grow" id="stop">${icon('stop')} ${sh.length ? 'Stop & Score' : 'Stop'}</button>`
          : `<button class="btn primary lg grow" id="arm">Arm – Wait for Beep</button><button class="btn lg" id="own" title="Phone plays a start beep after a random delay">Own Beep</button>`}</div>
         ${s !== 'running' ? `<button class="btn ghost block" id="manual">${sh.length ? 'Continue to scoring' : icon('keyboard') + ' Enter time manually'}</button>` : ''}`;
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

  // Count reached → go to scoring but keep listening briefly for extra (make-up) shots.
  function goScore(keepListening) {
    live.phase = 'score';
    live.listening = keepListening && timerState === 'running';
    if (live.listening) {
      const ot = (Store.data.settings.overtimeSec || 2.5) * 1000;
      const endOT = () => { if (timerState === 'running') timer.stop(); if (live) { live.listening = false; updateScoreUI(); } };
      overtimeTimer = setTimeout(endOT, ot);
      hooks.shot = t => { if (!live) return; live.shots.push(+t.toFixed(3)); clearTimeout(overtimeTimer); overtimeTimer = setTimeout(endOT, ot); updateScoreUI(false, true); };
    } else hooks.shot = null;
    hooks.state = null; hooks.beep = null;
    navigator.vibrate?.([60, 40, 60]);
    renderScorePhase();
  }

  // ---------- phase 2: score & correct ----------
  const COUNTERS = [['A', 'Alpha'], ['C', 'Charlie'], ['D', 'Delta'], ['M', 'Miss', 1], ['NS', 'No-shoot', 1], ['P', 'Procedural', 1]];
  const fmtVal = v => Array.isArray(v) ? `${v.length} shots` : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : esc(v ?? '—');
  const FIELD = { time: 'Time', splits: 'Shots', A: 'A', C: 'C', D: 'D', M: 'M', NS: 'NS', P: 'P', pf: 'Power factor', notes: 'Notes' };

  function renderScorePhase() {
    const r = live.run;
    view.innerHTML = `${runHeader()}
      <div id="listenNote"></div>
      <div class="grid2">
        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-h"><h2>Hits</h2><div class="seg" id="pf" role="radiogroup" aria-label="Power factor"><button data-pf="minor">Minor</button><button data-pf="major">Major</button></div></div>
            <div class="counters">${COUNTERS.map(([k, label, neg]) => `<div class="counter ${neg ? 'neg' : ''}" data-k="${k}"><div class="cname">${label}</div><button type="button" data-d="-1" aria-label="${label} minus">−</button><input inputmode="numeric" pattern="[0-9]*" value="0" aria-label="${label}"><button type="button" data-d="1" aria-label="${label} plus">+</button></div>`).join('')}</div>
            <div id="hitCheck"></div>
          </div>
          <div class="card"><div class="result" id="result"></div></div>
        </div>
        <div class="stack" style="gap:16px">
          <div class="card">
            <div class="card-h"><h2>Time &amp; Splits</h2><span class="xs faint">tap a time to correct it</span></div>
            <div class="row"><label class="f grow">Total time (s)<input id="time" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></label>
              <button class="btn" id="timeAuto" style="align-self:flex-end" title="Use the last shot time">${icon('repeat')} Last shot</button></div>
            <div class="stack" id="shotList"></div>
            <div class="row"><input id="addShot" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Add a missed shot (s)"><button class="btn" id="addShotBtn">Add</button></div>
          </div>
          <div class="card"><label class="f">Notes<textarea id="notes" placeholder="Malfunction, reshoot reason, coaching notes…"></textarea></label>
            ${r && r.history && r.history.length ? `<div class="history"><b style="color:var(--ink)">Change history</b>${r.history.slice().reverse().map(hh => `<div class="h"><div>${ftime(hh.at)} · ${esc(hh.by)} — ${Object.entries(hh.changes).map(([k, [a, b]]) => `${FIELD[k] || k}: ${fmtVal(a)} → ${fmtVal(b)}`).join(', ')}</div></div>`).join('')}</div>` : ''}
            ${r ? `<div class="xs faint">Recorded ${ftime(r.createdAt)} by ${esc(r.createdBy || me.u)} · ${r.source === 'mic' ? 'microphone' : 'manual entry'}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="actions-bar">${live.mode === 'edit'
        ? `<button class="btn danger" id="del">Delete Run</button><button class="btn primary" id="save">Save Changes</button>`
        : `<button class="btn" id="discard">Discard</button><button class="btn" id="saveRepeat">${icon('repeat')} Save &amp; Repeat</button><button class="btn primary" id="saveNext">Save &amp; Next Shooter</button>`}</div>`;

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
        const v = await modal({ title: `Correct Shot ${i + 1}`, submit: 'Update', body: `<label class="f">Time from beep (s)<input name="t" type="number" inputmode="decimal" step="0.01" min="0" value="${live.shots[i].toFixed(2)}" required></label>` });
        if (v && parseFloat(v.t) > 0) { live.shots[i] = +parseFloat(v.t).toFixed(3); live.shots.sort((a, b) => a - b); updateScoreUI(); }
      }
    };
    if (live.mode === 'edit') {
      $('#save').onclick = () => saveRun('back');
      $('#del').onclick = async () => { if (await confirmBox('Delete this run?', 'Delete')) { Store.deleteRun(live.sid, live.run.id); toast('Run deleted'); go('#/s/' + live.sid); } };
    } else {
      $('#discard').onclick = async () => { if (await confirmBox('Discard this run?', 'Discard')) go('#/s/' + live.sid); };
      $('#saveRepeat').onclick = () => saveRun('repeat');
      $('#saveNext').onclick = () => saveRun('next');
    }
    updateScoreUI();
  }

  function updateScoreUI(fromInput, newShot) {
    if (!live || live.phase !== 'score' || !$('#shotList')) return;
    const sh = live.shots, rounds = live.ex.rounds || 0, req = live.ex.requiredHits || rounds;
    if (!live.timeManual && sh.length) { live.time = sh[sh.length - 1]; if (document.activeElement !== $('#time')) $('#time').value = live.time.toFixed(2); }
    if (!fromInput) $$('.counter').forEach(c => { const inp = $('input', c); if (document.activeElement !== inp) inp.value = live.h[c.dataset.k]; });
    $$('#pf button').forEach(b => { b.classList.toggle('on', b.dataset.pf === live.pf); b.setAttribute('aria-checked', b.dataset.pf === live.pf); });
    $('#timeAuto').disabled = !sh.length || !live.timeManual;
    $('#shotList').innerHTML = splitPanel(sh, { editable: true, rounds, flashLast: newShot, base: live.base });
    const note = $('#listenNote');
    note.innerHTML = live.listening
      ? `<div class="notice info"><span class="ic">${icon('mic')} ${rounds} shots counted – listening a moment longer for extra shots…</span><button class="btn sm" id="stopListen">Stop Listening</button></div>`
      : (live.mode === 'new' && rounds && sh.length && sh.length !== rounds ? `<div class="notice warn"><span class="ic">${icon('alert')} Detected ${sh.length} shots, exercise expects ${rounds}. Remove echoes or add missed shots.</span></div>` : '');
    $('#stopListen') && ($('#stopListen').onclick = () => { clearTimeout(overtimeTimer); timer.stop(); live.listening = false; updateScoreUI(); });
    const h = live.h, total = h.A + h.C + h.D + h.M;
    const chk = $('#hitCheck');
    if (req && total !== req) {
      const diff = req - total;
      chk.innerHTML = `<div class="notice warn"><span class="ic">${icon('alert')} A + C + D + M = ${total} of ${req} required hits</span>${diff > 0 ? `<button class="btn sm" id="fillM">Mark ${diff} as Miss</button>` : ''}</div>`;
      $('#fillM') && ($('#fillM').onclick = () => { live.h.M += diff; updateScoreUI(); });
    } else chk.innerHTML = req ? `<div class="notice good"><span class="ic">${icon('check')} All ${req} required hits scored</span></div>` : '';
    const r = IPSC.score(h, live.pf, live.time || 0);
    $('#result').innerHTML = `<div><div class="k">Points</div><div class="v">${r.points}</div></div><div><div class="k">Penalties</div><div class="v">${r.penalty ? '−' + r.penalty : 0}</div></div>
      <div><div class="k">Score</div><div class="v">${r.score}</div></div><div><div class="k">Time</div><div class="v">${live.time ? (+live.time).toFixed(2) : '—'}</div></div>
      <div class="hfbox"><div class="k">Hit Factor</div><div class="v">${fmt(r.hf, 4)}</div></div>`;
  }

  async function saveRun(next) {
    if (!(live.time > 0)) { toast('Enter the total time', 'error'); $('#time').focus(); return; }
    const req = live.ex.requiredHits || live.ex.rounds || 0, h = live.h, total = h.A + h.C + h.D + h.M;
    if (req && total !== req && !(await modal({ title: `Hits total ${total}, ${req} required`, body: '<p class="small muted">The scored hits don’t match the exercise. Save anyway?</p>', submit: 'Save Anyway' }))) return;
    if (live.listening) { clearTimeout(overtimeTimer); timer.stop(); }
    const rec = { time: +(+live.time).toFixed(3), splits: live.shots.slice(), ...h, pf: live.pf, notes: live.notes.trim() };
    if (live.mode === 'edit') { Store.updateRun(live.sid, live.run.id, rec); toast('Changes saved'); history.back(); return; }
    const run = Store.addRun(live.sid, { shooterId: live.sh.id, exerciseId: live.ex.id, source: live.shots.length ? 'mic' : 'manual', ...rec });
    toast(`${live.sh.name} – HF ${fmt(Reports.runStats(run).hf, 4)} saved`);
    const sess = Store.session(live.sid), exId = live.ex.id;
    if (next === 'repeat') return go(`#/s/${live.sid}/run/${exId}/${live.sh.id}`);
    const ids = sess.shooterIds, i = ids.indexOf(live.sh.id);
    if (ids.length > 1 && i < ids.length - 1) go(`#/s/${live.sid}/run/${exId}/${ids[i + 1]}`);
    else { toast('Round complete – everyone has shot'); sessUI[live.sid] = exId; go('#/s/' + live.sid); }
  }

  // ======================================================================
  // exercises
  // ======================================================================
  const usage = (field, id) => Store.data.sessions.reduce((n, s) => n + s.runs.filter(r => r[field] === id).length, 0);
  function viewExercises() {
    setTitle('Exercises');
    const D = Store.data;
    view.innerHTML = `
      <div class="page-h"><div><h1>Exercises</h1><div class="sub">Round count drives the shot counter; required hits drive scoring checks.</div></div>
        <button class="btn primary" id="newEx">${icon('plus')} New Exercise</button></div>
      <div class="card tight list">${D.exercises.map(e => `<button class="item" data-id="${e.id}"><span class="lead-ic">${icon('target')}</span><div class="grow"><div class="t">${esc(e.name)}</div>
        <div class="s">${e.rounds} rounds · ${e.requiredHits} required hits · max ${Reports.maxPoints(e)} pts${e.notes ? ' · ' + esc(e.notes) : ''}</div></div><div class="meta">${usage('exerciseId', e.id)} runs</div>${icon('chev')}</button>`).join('') || emptyState('exercises', 'No exercises yet.')}</div>`;
    $('#newEx').onclick = () => editExercise(null);
    $$('[data-id]').forEach(b => b.onclick = () => editExercise(Store.exercise(b.dataset.id)));
  }
  async function editExercise(ex) {
    const used = ex ? usage('exerciseId', ex.id) : 0;
    const v = await modal({
      title: ex ? 'Edit Exercise' : 'New Exercise', submit: ex ? 'Save' : 'Create',
      body: `<label class="f">Name<input name="name" required value="${esc(ex?.name || '')}" placeholder="e.g. Standard Exercise 16"></label>
        <div class="row"><label class="f grow">Rounds (shots to count)<input name="rounds" type="number" inputmode="numeric" min="1" max="200" required value="${ex?.rounds || 16}"></label>
        <label class="f grow">Required hits<input name="requiredHits" type="number" inputmode="numeric" min="0" max="200" required value="${ex?.requiredHits ?? 16}"></label></div>
        <p class="field-hint">Usually 2 per paper target. Max stage points = 5 × required hits.</p>
        <label class="f">Description<textarea name="notes" placeholder="Targets, distance, start position…">${esc(ex?.notes || '')}</textarea></label>
        ${ex ? `<div><button type="button" class="btn danger" id="delEx" ${used ? 'disabled' : ''}>Delete Exercise</button>${used ? `<div class="field-hint" style="margin-top:6px">Used in ${used} runs, so it can’t be deleted.</div>` : ''}</div>` : ''}`,
      onOpen: form => {
        const r = form.rounds, q = form.requiredHits;
        if (!ex) r.oninput = () => { q.value = r.value; };
        $('#delEx', form) && ($('#delEx', form).onclick = async () => {
          $('#modal').close();
          if (await confirmBox(`Delete “${ex.name}”?`, 'Delete')) { Store.remove('exercises', ex.id); Store.data.sessions.forEach(s => s.exerciseIds = s.exerciseIds.filter(i => i !== ex.id)); Store.save(); route(); }
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
        <button class="btn primary" id="newSh">${icon('plus')} New Shooter</button></div>
      <div class="card tight list">${sorted.map(s => `<div class="item"><span class="avatar" style="cursor:default">${esc(initials(s.name))}</span>
        <button class="grow" data-id="${s.id}" style="all:unset;cursor:pointer;flex:1;min-width:0"><div class="t">${esc(s.name)} ${s.active === false ? '<span class="badge">Inactive</span>' : ''}</div>
        <div class="s">${esc(s.division || '—')} · ${s.pf === 'major' ? 'Major' : 'Minor'}${s.notes ? ' · ' + esc(s.notes) : ''}</div></button>
        <div class="meta">${usage('shooterId', s.id)} runs</div><a class="btn sm" href="#/reports/p/${s.id}" title="Progress report">${icon('reports')}</a></div>`).join('') || emptyState('shooters', 'No shooters yet.')}</div>`;
    $('#newSh').onclick = () => editShooter(null);
    $$('[data-id]').forEach(b => b.onclick = () => editShooter(Store.shooter(b.dataset.id)));
  }
  async function editShooter(s) {
    const used = s ? usage('shooterId', s.id) : 0;
    const v = await modal({
      title: s ? 'Edit Shooter' : 'New Shooter', submit: s ? 'Save' : 'Create',
      body: `<label class="f">Full name<input name="name" required value="${esc(s?.name || '')}"></label>
        <div class="row"><label class="f grow">Division<select name="division">${DIVISIONS.map(d => `<option ${s?.division === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="f grow">Power factor<select name="pf"><option value="minor" ${s?.pf !== 'major' ? 'selected' : ''}>Minor</option><option value="major" ${s?.pf === 'major' ? 'selected' : ''}>Major</option></select></label></div>
        <label class="f">Notes<textarea name="notes" placeholder="Equipment, goals…">${esc(s?.notes || '')}</textarea></label>
        <label class="check"><input type="checkbox" name="active" ${s?.active === false ? '' : 'checked'}> Active member</label>
        ${s ? `<div><button type="button" class="btn danger" id="delSh" ${used ? 'disabled' : ''}>Delete Shooter</button>${used ? `<div class="field-hint" style="margin-top:6px">Has ${used} runs – mark inactive instead.</div>` : ''}</div>` : ''}`,
      onOpen: form => {
        $('#delSh', form) && ($('#delSh', form).onclick = async () => {
          $('#modal').close();
          if (await confirmBox(`Delete ${s.name}?`, 'Delete')) { Store.remove('shooters', s.id); Store.data.sessions.forEach(x => x.shooterIds = x.shooterIds.filter(i => i !== s.id)); Store.save(); route(); }
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
      <div class="page-h"><div><h1>Reports</h1><div class="sub">Print to PDF or export CSV from any report</div></div>
        <button class="btn" id="allCsv">${icon('download')} Export All Runs</button></div>
      <div class="kpis">
        <div class="kpi"><div class="k">Sessions</div><div class="v">${D.sessions.length}</div></div>
        <div class="kpi"><div class="k">Runs logged</div><div class="v">${allRuns}</div></div>
        <div class="kpi"><div class="k">Shooters</div><div class="v">${D.shooters.length}</div></div>
        <div class="kpi"><div class="k">Exercises</div><div class="v">${D.exercises.length}</div></div>
      </div>
      <div class="grid2">
        <div class="card tight"><div class="card-h"><h2>Session Reports</h2></div><div class="list">${sessions.map(s => `<a class="item" href="#/reports/s/${s.id}"><div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${fdate(s.date)} · ${s.runs.length} runs</div></div>${icon('chev')}</a>`).join('') || emptyState('sessions', 'No sessions')}</div></div>
        <div class="card tight"><div class="card-h"><h2>Shooter Progress</h2></div><div class="list">${D.shooters.map(s => `<a class="item" href="#/reports/p/${s.id}"><span class="avatar" style="cursor:default">${esc(initials(s.name))}</span><div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.division || '')} · ${usage('shooterId', s.id)} runs</div></div>${icon('chev')}</a>`).join('') || emptyState('shooters', 'No shooters')}</div></div>
      </div>`;
    $('#allCsv').onclick = () => download(`hitcore-all-runs-${today()}.csv`, csv(runsCsv(D.sessions)), 'text/csv');
  }
  function runsCsv(sessions) {
    const cfg = gradeCfg();
    const rows = [['session', 'date', 'location', 'shooter', 'division', 'exercise', 'attempt', 'power_factor', 'A', 'C', 'D', 'M', 'NS', 'P', 'points', 'penalty', 'score', 'time_s', 'hit_factor', 'draw_s', 'avg_split_s', 'fast_splits_pct', 'shots', 'splits', 'source', 'recorded_at', 'recorded_by', 'edits', 'notes']];
    sessions.forEach(s => {
      const counter = {};
      [...s.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(r => {
        const sh = Store.shooter(r.shooterId), ex = Store.exercise(r.exerciseId), st = Reports.runStats(r);
        const sum = Reports.splitSummary(Reports.gradeSplits(r.splits || [], cfg));
        const k = r.shooterId + r.exerciseId; counter[k] = (counter[k] || 0) + 1;
        rows.push([s.name, s.date, s.location, sh?.name, sh?.division, ex?.name, counter[k], r.pf, r.A, r.C, r.D, r.M, r.NS, r.P, st.points, st.penalty, st.score, r.time.toFixed(2), st.hf != null ? st.hf.toFixed(4) : '',
          st.draw != null ? st.draw.toFixed(2) : '', st.avgSplit != null ? st.avgSplit.toFixed(2) : '', sum.fastShare != null ? Math.round(sum.fastShare * 100) : '', (r.splits || []).length, (r.splits || []).map(x => x.toFixed(2)).join(' '), r.source, r.createdAt, r.createdBy || '', (r.history || []).length, r.notes || '']);
      });
    });
    return rows;
  }
  const reportHeader = (title, sub) => `<div class="print-only"><div class="logo"><span class="mark">◎</span>HitCore</div><p class="muted small">Generated ${new Date().toLocaleString()} by ${esc(me.name)}</p><br></div>
    <div class="page-h"><div><h1>${title}</h1><div class="sub">${sub}</div></div>
    <div class="row wrap no-print"><button class="btn" id="csvBtn">${icon('download')} CSV</button><button class="btn primary" id="printBtn">${icon('print')} Print / PDF</button></div></div>`;
  const bindReportButtons = csvFn => { $('#csvBtn').onclick = csvFn; $('#printBtn').onclick = () => window.print(); };

  function viewSessionReport(id) {
    const sess = Store.session(id); if (!sess) return go('#/reports');
    setTitle('Session Report', 'Reports');
    const rep = Reports.session(sess, Store);
    const avgHF = Reports.mean(sess.runs.map(r => Reports.runStats(r).hf || 0));
    view.innerHTML = `${reportHeader(esc(sess.name), `${fdate(sess.date)}${sess.location ? ' · ' + esc(sess.location) : ''}`)}
      ${sess.notes ? `<p class="small muted">${esc(sess.notes)}</p>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="k">Participants</div><div class="v">${sess.shooterIds.length}</div></div>
        <div class="kpi"><div class="k">Exercises</div><div class="v">${sess.exerciseIds.length}</div></div>
        <div class="kpi"><div class="k">Runs</div><div class="v">${sess.runs.length}</div></div>
        <div class="kpi"><div class="k">Average hit factor</div><div class="v">${fmt(avgHF, 2)}</div></div>
      </div>
      <div class="card tight"><div class="card-h"><h2>Overall Standings</h2><span class="xs faint">IPSC stage points · best attempt per exercise</span></div>
        <div class="tablewrap"><table><thead><tr><th class="l">#</th><th class="l">Shooter</th><th class="l">Division</th><th>Stage pts</th><th>%</th><th>Runs</th><th>Avg HF</th><th>Best HF</th><th>Alpha</th><th>Avg draw</th><th>Avg split</th><th>M / NS / P</th></tr></thead><tbody>
        ${rep.overall.map(o => `<tr class="${o.place === 1 && o.stagePoints ? 'top' : ''}"><td class="l"><span class="place">${o.place}</span></td><td class="l">${esc(o.shooter.name)}</td><td class="l muted">${esc(o.shooter.division || '')}</td><td>${o.stagePoints.toFixed(1)}</td><td>${o.pct.toFixed(1)}</td><td>${o.runs}</td><td>${fmt(o.avgHF, 2)}</td><td class="hf">${fmt(o.bestHF, 2)}</td><td>${pct(o.accuracy)}</td><td>${fmt(o.avgDraw)}</td><td>${fmt(o.avgSplit)}</td><td>${o.totals.M} / ${o.totals.NS} / ${o.totals.P}</td></tr>`).join('')}
        </tbody></table></div></div>
      ${rep.exercises.map(e => `<div class="card tight"><div class="card-h"><h2>${esc(e.exercise.name)}</h2><span class="xs faint">${e.exercise.rounds} rounds · max ${e.maxPoints} pts · ${e.runs} runs</span></div>
        ${e.ranked.length ? `<div class="tablewrap"><table><thead><tr><th class="l">#</th><th class="l">Shooter</th><th>HF</th><th>Time</th><th>A</th><th>C</th><th>D</th><th>M</th><th>NS</th><th>P</th><th>Score</th><th>Draw</th><th>Tries</th><th>Stage pts</th><th>%</th></tr></thead><tbody>
        ${e.ranked.map(x => `<tr class="${x.place === 1 ? 'top' : ''}"><td class="l"><span class="place">${x.place}</span></td><td class="l">${esc(x.shooter.name)}</td><td class="hf">${fmt(x.hf, 4)}</td><td>${x.run.time.toFixed(2)}</td><td>${x.run.A}</td><td>${x.run.C}</td><td>${x.run.D}</td><td>${x.run.M}</td><td>${x.run.NS}</td><td>${x.run.P}</td><td>${x.score}</td><td>${fmt(x.draw)}</td><td>${x.attempts}</td><td>${x.stagePoints.toFixed(1)}</td><td>${x.pct.toFixed(1)}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('reports', 'No runs')}</div>`).join('')}`;
    bindReportButtons(() => download(`hitcore-${sess.date}-${sess.name.replace(/[^\w-]+/g, '_')}.csv`, csv(runsCsv([sess])), 'text/csv'));
  }

  function viewShooterReport(id) {
    const sh = Store.shooter(id); if (!sh) return go('#/reports');
    setTitle('Shooter Report', 'Reports');
    const rep = Reports.shooter(sh, Store), cfg = gradeCfg();
    const allHF = rep.rows.map(x => x.hf || 0);
    const counts = { fast: 0, ok: 0, slow: 0 };
    rep.rows.forEach(x => { const s = Reports.splitSummary(Reports.gradeSplits(x.r.splits || [], cfg)); counts.fast += s.counts.fast; counts.ok += s.counts.ok; counts.slow += s.counts.slow; });
    const totalSp = counts.fast + counts.ok + counts.slow;
    view.innerHTML = `${reportHeader(esc(sh.name), `${esc(sh.division || '')} · ${sh.pf === 'major' ? 'Major' : 'Minor'} · ${rep.sessions} sessions`)}
      <div class="kpis">
        <div class="kpi"><div class="k">Runs</div><div class="v">${rep.rows.length}</div></div>
        <div class="kpi"><div class="k">Average hit factor</div><div class="v">${fmt(Reports.mean(allHF), 2)}</div></div>
        <div class="kpi"><div class="k">Alpha rate</div><div class="v">${pct(Reports.mean(rep.rows.map(x => x.accuracy).filter(x => x != null)))}</div></div>
        <div class="kpi"><div class="k">Fast splits</div><div class="v">${totalSp ? pct(counts.fast / totalSp) : '—'}</div><div class="d">${counts.fast} fast · ${counts.ok} OK · ${counts.slow} slow</div></div>
      </div>
      <div class="card tight"><div class="card-h"><h2>By Exercise</h2><span class="xs faint">trend = last vs. first attempt</span></div>
        ${rep.exercises.length ? `<div class="tablewrap"><table><thead><tr><th class="l">Exercise</th><th>Attempts</th><th>Best HF</th><th>Avg HF</th><th>Trend</th><th>Best time</th><th>Alpha</th><th>Avg draw</th><th>Avg split</th></tr></thead><tbody>
        ${rep.exercises.map(e => { const d = e.lastHF - e.firstHF; return `<tr><td class="l">${esc(e.exercise.name)}</td><td>${e.attempts}</td><td class="hf">${fmt(e.bestHF, 4)}</td><td>${fmt(e.avgHF, 2)}</td><td class="${e.attempts > 1 ? (d >= 0 ? 'ok' : 'bad') : ''}">${e.attempts > 1 ? (d >= 0 ? '▲ +' : '▼ −') + Math.abs(d).toFixed(2) : '—'}</td><td>${e.bestTime.toFixed(2)}</td><td>${pct(e.accuracy)}</td><td>${fmt(e.avgDraw)}</td><td>${fmt(e.avgSplit)}</td></tr>`; }).join('')}
        </tbody></table></div>` : emptyState('reports', 'No runs yet')}</div>
      <div class="card tight"><div class="card-h"><h2>Run History</h2></div>
        ${rep.rows.length ? `<div class="tablewrap"><table><thead><tr><th class="l">Date</th><th class="l">Session</th><th class="l">Exercise</th><th>HF</th><th>Time</th><th>A/C/D/M</th><th>NS/P</th><th>Draw</th><th>Avg split</th><th class="no-print"></th></tr></thead><tbody>
        ${rep.rows.slice().reverse().map(x => `<tr><td class="l">${fdate(x.sess.date)}</td><td class="l">${esc(x.sess.name)}</td><td class="l">${esc(x.ex?.name || '—')}</td><td class="hf">${fmt(x.hf, 4)}</td><td>${x.r.time.toFixed(2)}</td><td>${x.r.A}/${x.r.C}/${x.r.D}/${x.r.M}</td><td>${x.r.NS}/${x.r.P}</td><td>${fmt(x.draw)}</td><td>${fmt(x.avgSplit)}</td><td class="no-print"><a href="#/s/${x.sess.id}/edit/${x.r.id}">Open</a></td></tr>`).join('')}
        </tbody></table></div>` : ''}</div>`;
    bindReportButtons(() => {
      const all = runsCsv(Store.data.sessions), head = all[0], col = head.indexOf('shooter');
      download(`hitcore-${sh.name.replace(/[^\w-]+/g, '_')}.csv`, csv([head, ...all.slice(1).filter(r => r[col] === sh.name)]), 'text/csv');
    });
  }

  // ======================================================================
  // settings
  // ======================================================================
  function viewSettings() {
    setTitle('Settings');
    const S = Store.data.settings, G = S.grade;
    const beepTxt = () => S.beepSig ? `${S.beepSig.freq} Hz · ${S.beepSig.dur} ms · learned ${S.beepCount || 1}×` : 'Not learned – accepts any steady 1.5–4.5 kHz tone';
    const num = (id, v, step = 0.01) => `<input id="${id}" type="number" inputmode="decimal" step="${step}" min="0" value="${v}">`;
    view.innerHTML = `
      <div class="page-h"><div><h1>Settings</h1><div class="sub">Shot detection, split grading, appearance and data</div></div></div>
      <div class="grid2">
      <div class="stack" style="gap:16px">
        <div class="card">
          <div class="card-h"><h2>Shot Detection</h2><span class="badge ${timer.det ? 'good' : ''}"><span class="dot"></span>${timer.det ? 'Mic on' : 'Mic off'}</span></div>
          ${levelMeter()}
          ${timer.det ? '' : `<button class="btn" id="micBtn">${icon('mic')} Enable Microphone</button>`}
          <label class="f">Sensitivity · <span id="sensV">${S.sensitivity}</span><input type="range" id="sens" min="1" max="100" value="${S.sensitivity}"></label>
          <p class="field-hint">The blue mark on the meter is the trigger level. Lower the sensitivity if shots from neighbouring bays are counted.</p>
          <label class="check"><input type="checkbox" id="fss" ${S.firstShotStart ? 'checked' : ''}> Start clock on first shot if no beep is heard</label>
          <div class="row"><label class="f grow">Own beep delay, min (s)${num('dmin', S.delayMin, 0.5)}</label><label class="f grow">max (s)${num('dmax', S.delayMax, 0.5)}</label></div>
          <label class="f">Keep listening after the last expected shot (s)${num('ot', S.overtimeSec, 0.5)}</label>
        </div>
        <div class="card">
          <div class="card-h"><h2>Coach Beep</h2></div>
          <p class="small" id="beepTxt">${beepTxt()}</p>
          <p class="field-hint">Press Learn, then trigger the coach’s timer once near the phone. Its pitch and length are stored, so the clock starts only on that beep. Repeat to refine.</p>
          <div class="row"><button class="btn primary grow" id="learn">Learn Beep</button><button class="btn" id="forget">Forget</button></div>
          <div id="learnState" class="small"></div>
        </div>
      </div>
      <div class="stack" style="gap:16px">
        <div class="card">
          <div class="card-h"><h2>Split Grading</h2></div>
          <div class="seg" id="gmode"><button data-m="targets">Fixed targets</button><button data-m="personal">Personal baseline</button></div>
          <p class="field-hint" id="gmodeHint"></p>
          <div class="row"><label class="f grow">Draw fast ≤ (s)${num('gdf', G.drawFast)}</label><label class="f grow">Draw OK ≤ (s)${num('gdo', G.drawOk)}</label></div>
          <div class="row"><label class="f grow">Split fast ≤ (s)${num('gsf', G.splitFast)}</label><label class="f grow">Split OK ≤ (s)${num('gso', G.splitOk)}</label></div>
          <label class="f">Treat gaps longer than (s) as reload / movement${num('gp', G.pause, 0.05)}</label>
          <div class="legend">${['fast', 'ok', 'slow', 'pause'].map(gradePill).join('')}</div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Appearance</h2></div>
          <div class="seg" id="theme"><button data-t="system">System</button><button data-t="light">Light</button><button data-t="dark">Dark</button></div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Data</h2></div>
          <p class="field-hint">Stored on this device for <b>${esc(me.u)}</b>. Back up after each session, or move data between devices with export / import.</p>
          <div class="row wrap"><button class="btn" id="exp">${icon('download')} Back Up (JSON)</button><button class="btn" id="imp">Import Backup…</button><input type="file" id="impFile" accept="application/json,.json" hidden></div>
          <div><button class="btn danger" id="reset">Reset to Demo Data…</button></div>
        </div>
        <div class="card">
          <div class="card-h"><h2>Account</h2></div>
          <div class="row"><span class="avatar" style="cursor:default">${esc(initials(me.name))}</span><div class="grow"><div>${esc(me.name)}</div><div class="xs muted">${esc(me.role)} · ${esc(me.u)} · signed in ${ftime(me.since)}</div></div><button class="btn" data-logout>Sign Out</button></div>
        </div>
      </div></div>`;
    $('#micBtn') && ($('#micBtn').onclick = async () => { try { await enableMic(); viewSettings(); } catch (e) { toast('Microphone unavailable: ' + (e.message || e.name), 'error'); } });
    $('#sens').oninput = e => { Store.setting('sensitivity', +e.target.value); $('#sensV').textContent = e.target.value; timerApplySettings(); $('#lvl .th').style.left = threshPos() + '%'; };
    $('#fss').onchange = e => { Store.setting('firstShotStart', e.target.checked); timerApplySettings(); };
    $('#dmin').onchange = e => Store.setting('delayMin', Math.max(0, +e.target.value || 0));
    $('#dmax').onchange = e => Store.setting('delayMax', Math.max(0, +e.target.value || 0));
    $('#ot').onchange = e => Store.setting('overtimeSec', Math.max(0, +e.target.value || 0));
    const setG = (k, v) => { Store.setting('grade', { ...Store.data.settings.grade, [k]: v }); };
    const renderMode = () => {
      const m = Store.data.settings.grade.mode;
      $$('#gmode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      $('#gmodeHint').textContent = m === 'personal'
        ? 'Each split is compared with the shooter’s own median in that exercise (fast ≤ 92%, OK ≤ 108%). Falls back to the targets below until there are 2+ earlier runs.'
        : 'Every shooter is graded against the same thresholds.';
    };
    $$('#gmode button').forEach(b => b.onclick = () => { setG('mode', b.dataset.m); renderMode(); });
    renderMode();
    [['gdf', 'drawFast'], ['gdo', 'drawOk'], ['gsf', 'splitFast'], ['gso', 'splitOk'], ['gp', 'pause']].forEach(([id, k]) => $('#' + id).onchange = e => { const v = parseFloat(e.target.value); if (v > 0) setG(k, v); });
    const renderTheme = () => $$('#theme button').forEach(b => b.classList.toggle('on', b.dataset.t === currentTheme()));
    $$('#theme button').forEach(b => b.onclick = () => { applyTheme(b.dataset.t); renderTheme(); });
    renderTheme();
    $('#learn').onclick = async () => {
      if (!timer.det) { try { await enableMic(); } catch (e) { return toast('Microphone unavailable', 'error'); } }
      timer.learn(); $('#learnState').innerHTML = `<div class="notice info"><span class="ic">${icon('mic')} Listening… trigger the coach beep now.</span></div>`;
    };
    hooks.learn = sig => {
      const el = $('#learnState');
      if (!sig || !sig.ok) { el && (el.innerHTML = `<div class="notice warn"><span class="ic">${icon('alert')} No clean tone heard – move closer to the timer and try again.</span></div>`); return; }
      const prev = S.beepSig, n = S.beepCount || 0, fresh = !prev || Math.abs(prev.freq - sig.freq) > 150;
      const merged = fresh ? { freq: sig.freq, dur: sig.dur } : { freq: Math.round((prev.freq * n + sig.freq) / (n + 1)), dur: Math.round((prev.dur * n + sig.dur) / (n + 1)) };
      Store.setting('beepSig', merged); Store.setting('beepCount', fresh ? 1 : n + 1); timerApplySettings();
      el && (el.innerHTML = `<div class="notice good"><span class="ic">${icon('check')} Learned ${sig.freq} Hz, ${sig.dur} ms</span></div>`); $('#beepTxt') && ($('#beepTxt').textContent = beepTxt());
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
    $('#reset').onclick = async () => { if (await confirmBox('Erase all data and restore the demo data?', 'Reset')) { Store.resetDemo(); toast('Demo data restored'); go('#/sessions'); } };
  }

  // ======================================================================
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  start();
})();
