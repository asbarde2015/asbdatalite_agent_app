// App-wide state: the store's settings (baked at build time + refreshed live), sessions, and small caches.
// Everything is kept in localStorage under the "asb_" prefix.

const PREFIX = 'asb_';

export const ls = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* storage full */ }
  },
  del(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ } },
};

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

export const state = {
  cfg: null,        // config.json written at build time: { apiBase, subdomain, store: {...} }
  live: null,       // the latest /storefront answer (fresher than the baked copy)
  settings: null,   // /settings/public: { guest_checkout_enabled, payment_gateways: [...] }
};

/** The store as the app should show it: live data over the baked copy. */
export function store() {
  const baked = state.cfg?.store || {};
  const live = state.live || {};
  const merged = { ...baked, ...live };
  merged.colors = { ...(baked.colors || {}), ...(live.colors || {}) };
  merged.content = deepMerge(baked.content || {}, live.content || {});
  return merged;
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b;
  if (b && typeof b === 'object') {
    const out = { ...(a && typeof a === 'object' ? a : {}) };
    for (const key of Object.keys(b)) out[key] = deepMerge(out[key], b[key]);
    return out;
  }
  return b === undefined ? a : b;
}

/** The store's country (a store sells in its agent's country only): { code, symbol, dial_code, phone_digits, ... }. Ghana until the API says otherwise. */
export function country() {
  const c = store().country || {};
  return {
    code: c.code || 'GH',
    name: c.name || 'Ghana',
    symbol: c.symbol || 'GH\u20B5',
    currency: c.currency || 'GHS',
    dial_code: String(c.dial_code || '233'),
    phone_digits: Number(c.phone_digits) || 10,
  };
}

/** Image address with an offline fallback: the live URL first, the copy baked into the app second. */
export function imageSources(kind) { // 'logo' | 'hero' | 'auth'
  const s = store();
  const live = s[`${kind}_url`] || (kind === 'auth' ? s.hero_image_url : null);
  const baked = s[`${kind}_local`] || (kind === 'auth' ? s.hero_local : null);
  return { src: live || baked, fallback: baked };
}

// ---- Session: the signed-in customer of THIS store (accounts belong to one store only) ----
export const getSession = (kind = 'store') => ls.get(`session_${kind}`);
export function setSession(kind, token, user) { ls.set(`session_${kind}`, { token, user }); emit('session', { kind }); }
export function clearSession(kind = 'store') { ls.del(`session_${kind}`); emit('session', { kind }); }

/** Refreshes the saved profile of the signed-in person WITHOUT announcing a sign-in (that would redraw the screen again). */
export function updateSessionUser(kind, user) {
  const session = ls.get(`session_${kind}`);
  if (session) ls.set(`session_${kind}`, { ...session, user });
}

// ---- Orders placed on this phone (guests have no account to list them from) ----
export const localOrders = () => ls.get('orders_local', []);
export function rememberOrder(entry) {
  const list = localOrders().filter((o) => o.ref !== entry.ref);
  list.unshift(entry);
  ls.set('orders_local', list.slice(0, 60));
}
export function forgetOrders() { ls.del('orders_local'); }
