// One place that talks to the ASBData API. Mirrors the website's own client: Bearer token from the
// chosen session, flat { message, code } errors, and a friendly message when offline.

import { state, getSession, clearSession, country } from './state.js';

function firstError(data) {
  if (!data) return null;
  if (data.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors)[0];
    if (Array.isArray(first) && first[0]) return first[0];
  }
  return data.message || null;
}

/**
 * api('/networks')
 * api('/orders/guest', { method: 'POST', body: {...} })
 * api('/agent/onboarding/business-profile', { method: 'POST', form: FormData, session: 'agent' })
 * Always resolves to { ok, status, data, error, code } and never throws.
 */
export async function api(path, { method = 'GET', body, form, session = 'store', headers = {} } = {}) {
  const token = session ? getSession(session)?.token : null;
  const allHeaders = {
    Accept: 'application/json',
    // The app's web page origin is https://localhost, so the server cannot tell the store from it: say the country here.
    'X-Country': country().code,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  let response;
  try {
    response = await fetch(`${state.cfg.apiBase}${path}`, {
      method,
      headers: allHeaders,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    return { ok: false, status: 0, data: null, error: 'Could not reach the server. Check your internet connection and try again.', code: 'offline' };
  }

  let data = null;
  try { data = await response.json(); } catch { /* empty or non-JSON body */ }

  if (response.status === 401 && token) clearSession(session);

  if (response.ok) return { ok: true, status: response.status, data, error: null, code: null };
  return {
    ok: false,
    status: response.status,
    data,
    error: firstError(data) || (response.status >= 500 ? 'Something went wrong on our side. Please try again shortly.' : 'Something went wrong.'),
    code: data?.code || null,
  };
}

/** Domain the API expects for "which store is this?" (e.g. smekart.asbdatalite.com). */
export const storeDomain = () => state.live?.domain || state.cfg?.store?.domain || state.cfg?.subdomain;

/** /settings/public once per launch: { guest_checkout_enabled, payment_gateways: [{key,label,min_amount}] }. */
export async function publicSettings(force = false) {
  if (state.settings && !force) return state.settings;
  const res = await api('/settings/public', { session: null });
  state.settings = res.ok ? res.data : { guest_checkout_enabled: false, payment_gateways: [] };
  return state.settings;
}

/**
 * Payment gateways the admin has switched on that accept an order of this size (e.g. Korapay is hidden under its minimum amount).
 * Korapay is listed first, so it is the one shown and selected by default; Payaza follows.
 */
export async function gatewaysFor(amount) {
  const settings = await publicSettings();
  const preferred = ['korapay', 'payaza'];
  return (settings.payment_gateways || [])
    .filter((g) => !(g.min_amount > 0) || Number(amount) + 0.001 >= g.min_amount)
    .sort((a, b) => (preferred.indexOf(a.key) + 1 || 99) - (preferred.indexOf(b.key) + 1 || 99));
}
