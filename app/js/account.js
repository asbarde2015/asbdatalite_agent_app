// Account tab: profile + wallet for signed-in customers, sign-in prompt for everyone else.

import { api } from './api.js';
import { h, icon, money, initials, fmtDate } from './util.js';
import { clearSession, getSession, state, store, updateSessionUser } from './state.js';
import { confirmSheet, field, openSheet, setLoading, toast } from './ui.js';
import { go, refresh, switchTab } from './nav.js';

export function accountScreen() {
  const s = store();
  const session = getSession('store');
  const root = h('div', {}, h('div', { class: 'appbar' }, h('h1', {}, 'Account')));
  const body = h('div', { class: 'pad stack' });
  root.append(body);

  if (!session) {
    body.append(h('div', { class: 'empty rise' },
      h('div', { class: 'art' }, icon('user', 42)),
      h('h3', {}, `Welcome to ${s.business_name || 'our store'}`),
      h('p', {}, 'Sign in to see your orders on any phone, or just buy as a guest.'),
      h('div', { class: 'stack', style: { maxWidth: '280px', margin: '0 auto' } },
        h('button', { class: 'btn primary lg block', onclick: () => go('login') }, 'Sign in'),
        h('button', { class: 'btn tonal lg block', onclick: () => go('register') }, 'Create account'))));
  } else {
    const user = session.user || {};
    const balance = h('b', { style: { fontSize: '24px' } }, money(0));
    const verify = h('div', { class: 'note', hidden: user.email_verified !== false },
      icon('mail', 20), h('span', {}, 'Please verify your email address. '),
      h('button', { class: 'btn text sm', style: { height: 'auto', padding: 0 }, onclick: async () => {
        const res = await api('/auth/email/resend', { method: 'POST' });
        toast(res.ok ? 'Verification email sent' : res.error, res.ok ? 'ok' : 'bad');
      } }, 'Resend email'));

    body.append(
      h('div', { class: 'card rise row', style: { gap: '16px' } },
        h('div', { style: { width: '60px', height: '60px', borderRadius: '20px', background: 'var(--primary)', color: 'var(--on-primary)', display: 'grid', placeItems: 'center', fontWeight: '800', fontSize: '22px', flex: 'none' } }, initials(user.name)),
        h('div', { style: { minWidth: 0 } }, h('b', { style: { fontSize: '18px', display: 'block' } }, user.name || 'Customer'), h('span', { class: 'muted', style: { fontSize: '13px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' } }, user.email), h('span', { class: 'muted', style: { fontSize: '13px' } }, user.phone))),
      verify,
      h('div', { class: 'card rise row spread', style: { '--i': '1' } }, h('div', {}, h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Wallet balance'), h('div', {}, balance), h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Refunds from failed orders land here')), h('div', { style: { color: 'var(--primary)' } }, icon('wallet', 34))),
      menuRow('wallet', 'Refund history', openWalletHistory, 'Money returned to your wallet'),
      menuRow('lock', 'Change password', openChangePassword),
      h('button', { class: 'btn outline block', onclick: async () => {
        if (!(await confirmSheet({ title: 'Sign out?', message: 'You can sign back in any time.', confirmText: 'Sign out' }))) return;
        await api('/auth/logout', { method: 'POST' });
        clearSession('store');
        toast('Signed out');
        refresh();
      } }, icon('logout', 20), 'Sign out'));

    api('/wallet').then((res) => { if (res.ok) balance.textContent = money(res.data.balance); });
    api('/me').then((res) => { if (res.ok) { const u = res.data.data || res.data; updateSessionUser('store', u); verify.hidden = u.email_verified !== false; } });
  }

  body.append(
    h('div', { class: 'foot', style: { padding: '18px 0 8px' } },
      h('p', {}, s.business_name || ''),
      h('p', { style: { marginTop: '4px' } }, `App version built ${state.cfg?.builtAt ? new Date(state.cfg.builtAt).toLocaleDateString() : ''}`)));
  return root;
}

function menuRow(iconName, title, onClick, sub) {
  return h('button', { class: 'card ripple row', style: { width: '100%', textAlign: 'left', padding: '14px 16px' }, onclick: onClick },
    h('div', { class: 'feature', style: { padding: 0 } }, h('div', { class: 'ico' }, icon(iconName, 22))),
    h('div', { style: { flex: 1 } }, h('b', {}, title), sub ? h('small', { class: 'muted', style: { display: 'block' } }, sub) : null),
    icon('right', 18));
}

// Same two extras the store website's own dashboard offers: refund history and change password.
export async function openWalletHistory() {
  const list = h('div', {}, h('div', { class: 'skeleton', style: { height: '64px' } }));
  openSheet({ title: 'Refund history', content: list });
  const res = await api('/wallet/transactions');
  const items = res.ok ? (res.data?.data || []) : [];
  list.replaceChildren(...(items.length
    ? items.map((t) => h('div', { class: 'kv' },
      h('div', {}, h('b', {}, t.description), h('small', { class: 'muted', style: { display: 'block' } }, fmtDate(t.created_at))),
      h('b', { style: { color: t.type === 'credit' ? 'var(--ok)' : 'var(--bad)' } }, `${t.type === 'credit' ? '+' : '-'}${money(t.amount)}`)))
    : [h('p', { class: 'muted center', style: { padding: '24px 0' } }, res.ok ? 'No refunds yet.' : res.error)]));
}

function openChangePassword() {
  const current = field({ label: 'Current password', type: 'password', autocomplete: 'current-password' });
  const next = field({ label: 'New password (8+ characters)', type: 'password', autocomplete: 'new-password' });
  const confirm = field({ label: 'Confirm new password', type: 'password', autocomplete: 'new-password' });
  const button = h('button', { class: 'btn primary lg block' }, 'Update password');
  const sheet = openSheet({ title: 'Change password', content: h('div', { class: 'stack' }, current.el, next.el, confirm.el, button) });
  button.addEventListener('click', async () => {
    if (!current.input.value) return toast('Enter your current password', 'bad');
    if (next.input.value.length < 8) return toast('The new password must be at least 8 characters', 'bad');
    if (next.input.value !== confirm.input.value) return toast("The new passwords don't match", 'bad');
    setLoading(button, true, 'Updating');
    const res = await api('/account/change-password', { method: 'POST', body: { current_password: current.input.value, password: next.input.value, password_confirmation: confirm.input.value } });
    setLoading(button, false);
    toast(res.ok ? (res.data?.message || 'Password updated') : res.error, res.ok ? 'ok' : 'bad');
    if (res.ok) sheet.close();
    return undefined;
  });
}
