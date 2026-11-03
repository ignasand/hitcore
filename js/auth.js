// Demo sign-in. This is a client-side gate for the demo build only: a static
// site cannot keep secrets, so real deployments need a server-side identity provider.
const Auth = (() => {
  const USERS = [
    { u: 'coach', name: 'Head Coach', role: 'Coach', hash: '42536a9f0632f68f35da1d37617f867504b2c7f4f2cef8b2233e65d201853749' },
  ];
  const KEY = 'hitcore.auth';
  const TTL = { remember: 30 * 864e5, session: 12 * 36e5 };

  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function read() {
    for (const st of [localStorage, sessionStorage]) {
      try { const a = JSON.parse(st.getItem(KEY)); if (a && a.exp > Date.now()) return a; } catch (e) {}
    }
    return null;
  }
  return {
    current() { const a = read(); return a && USERS.find(u => u.u === a.u) ? { ...USERS.find(u => u.u === a.u), since: a.at } : null; },
    async login(username, password, remember) {
      const u = USERS.find(x => x.u === String(username).trim().toLowerCase());
      if (!crypto.subtle) throw new Error('Sign-in needs HTTPS');
      const h = await sha256(`hitcore|${u ? u.u : '-'}|${password}`);
      if (!u || h !== u.hash) { await new Promise(r => setTimeout(r, 600)); throw new Error('Invalid username or password'); }
      const rec = JSON.stringify({ u: u.u, at: Date.now(), exp: Date.now() + (remember ? TTL.remember : TTL.session) });
      (remember ? localStorage : sessionStorage).setItem(KEY, rec);
      return u;
    },
    logout() { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); },
  };
})();
