// Sign-in.
//  api mode  – server-side accounts (scrypt-hashed passwords, HttpOnly session cookie).
//              The profile is remembered on the device so the app also opens offline.
//  demo mode – a client-side gate for the public demo only.
const Auth = (() => {
  const MODE = (window.HITCORE && window.HITCORE.mode) === 'api' ? 'api' : 'demo';
  const DEMO_USERS = [{ u: 'coach', name: 'Head Coach', role: 'Coach', hash: '42536a9f0632f68f35da1d37617f867504b2c7f4f2cef8b2233e65d201853749' }];
  const KEY = 'hitcore.auth', PROFILE = 'hitcore.profile';
  const TTL = { remember: 30 * 864e5, session: 12 * 36e5 };
  let me = null;

  const hdrs = { 'Content-Type': 'application/json', 'X-HitCore': '1' };
  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: hdrs, body: JSON.stringify(body || {}) });
    let j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error((j && j.error) || 'Sign-in failed'), { status: res.status });
    return j;
  }
  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const readDemo = () => {
    for (const st of [localStorage, sessionStorage]) { try { const a = JSON.parse(st.getItem(KEY)); if (a && a.exp > Date.now()) return a; } catch (e) {} }
    return null;
  };

  return {
    MODE,
    current: () => me,
    // Resolve the signed-in user on startup.
    async restore() {
      if (MODE === 'demo') { const a = readDemo(), u = a && DEMO_USERS.find(x => x.u === a.u); me = u ? { u: u.u, name: u.name, role: u.role, since: new Date(a.at).toISOString() } : null; return me; }
      try {
        const res = await fetch('api/auth/me', { credentials: 'same-origin' });
        if (res.status === 401) { localStorage.removeItem(PROFILE); me = null; return null; }
        if (!res.ok) throw new Error('server');
        me = (await res.json()).user; localStorage.setItem(PROFILE, JSON.stringify(me));
      } catch (e) {
        // offline: trust the remembered profile; the server re-checks the cookie on every sync
        try { me = JSON.parse(localStorage.getItem(PROFILE)); if (me) me.offline = true; } catch (x) { me = null; }
      }
      return me;
    },
    async login(username, password, remember) {
      if (MODE === 'api') {
        const { user } = await post('api/auth/login', { username: String(username).trim(), password, remember: !!remember });
        me = user; localStorage.setItem(PROFILE, JSON.stringify(me)); return me;
      }
      const u = DEMO_USERS.find(x => x.u === String(username).trim().toLowerCase());
      if (!crypto.subtle) throw new Error('Sign-in needs HTTPS');
      const h = await sha256(`hitcore|${u ? u.u : '-'}|${password}`);
      if (!u || h !== u.hash) { await new Promise(r => setTimeout(r, 600)); throw new Error('Invalid username or password'); }
      const rec = JSON.stringify({ u: u.u, at: Date.now(), exp: Date.now() + (remember ? TTL.remember : TTL.session) });
      (remember ? localStorage : sessionStorage).setItem(KEY, rec);
      me = { u: u.u, name: u.name, role: u.role, since: new Date().toISOString() };
      return me;
    },
    async changePassword(current, next) { return post('api/auth/password', { current, next }); },
    async logout() {
      if (MODE === 'api') { try { await post('api/auth/logout'); } catch (e) {} localStorage.removeItem(PROFILE); }
      localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); me = null;
    },
  };
})();
