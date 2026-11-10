// Orders: what a signed-in customer bought through the store. Guests have no order history here:
// they are shown a clear "Sign in" prompt instead.

import { api, storeDomain } from './api.js';
import { h, icon, money, fmtDate, statusInfo } from './util.js';
import { getSession } from './state.js';
import { openSheet, segmented, toast, setLoading } from './ui.js';
import { runPayment } from './pay.js';
import { go, switchTab } from './nav.js';

const orderRef = (order) => `ORD-${order.id}`;

/** Asks the server for the real state of an order by its payment reference. */
export async function verifyOrderRef(ref) {
  const res = await api(`/orders/guest/verify/${encodeURIComponent(ref)}`, { session: null });
  if (!res.ok || !res.data?.order) return { status: 'pending', order: null };
  const order = res.data.order;
  if (['delivered', 'processing', 'paid'].includes(order.status)) return { status: 'success', order };
  if (['failed', 'refunded'].includes(order.status)) return { status: 'failed', order };
  return { status: 'pending', order };
}

/** A fresh payment for an order that is still unpaid: { url, gateway }. Resolves to null if it turns out to be paid already. */
export async function resumeOrderPayment(ref, gateway) {
  const res = await api(`/orders/payment/${encodeURIComponent(ref)}/resume`, { method: 'POST', body: gateway ? { payment_method: gateway } : {}, session: null });
  if (!res.ok) throw new Error(res.error);
  return res.data.authorization_url ? { url: res.data.authorization_url, gateway: res.data.order?.payment_method || gateway || null } : null;
}

/** Opens the in-app payment for an order, wired to verify / resume / the "email me the link" call. */
export async function payForOrder({ url, ref, gateway, summary, service = 'data' }) {
  const result = await runPayment({
    url,
    gateway,
    summary,
    successTitle: 'Payment received',
    successText: { data: 'Thank you! Your data bundle is on its way and will arrive shortly.', airtime: 'Thank you! Your airtime is on its way.', cable: 'Thank you! Your cable TV subscription is being activated.', electricity: 'Thank you! Your electricity token is being generated. You will find it in Orders.', exam: 'Thank you! Your exam pins are being prepared. You will find them in Orders.' }[service] || 'Thank you! Your order is being processed.',
    verify: () => verifyOrderRef(ref),
    resume: () => resumeOrderPayment(ref),
    onCancelled: async () => {
      const res = await api(`/orders/payment/${encodeURIComponent(ref)}/cancelled`, { method: 'POST', session: null });
      return res.ok && res.data?.email ? `We've emailed a link to ${res.data.email} so you can complete this payment later.` : null;
    },
  });
  return result;
}

const SERVICE_NAMES = { airtime: 'Airtime', cable: 'Cable TV', electricity: 'Electricity', exam: 'Exam pins' };

/** What an order was for: a data bundle ("MTN 1GB") or a service ("Airtime", "DStv Compact"). */
function orderTitle(order) {
  if (order.service && order.service !== 'data') return order.item || SERVICE_NAMES[order.service] || 'Order';
  return `${order.network || ''} ${order.bundle_size || ''}`.trim() || 'Order';
}

function orderCard(order, onOpen) {
  const info = statusInfo(order.status);
  return h('button', { class: 'order rise', onclick: () => onOpen(order) },
    h('div', { class: 'dot' }, String(order.network || '?').slice(0, 2).toUpperCase()),
    h('div', { class: 'meta' },
      h('b', {}, orderTitle(order)),
      h('small', {}, `${order.recipient_number} · ${fmtDate(order.created_at)}`)),
    h('div', { style: { textAlign: 'right' } },
      h('b', { style: { display: 'block' } }, money(order.amount)),
      h('span', { class: `pill ${info.cls}` }, info.label)));
}

/** The token / pins / customer name the service returned, once delivered. */
function resultBlock(order) {
  const r = order.result;
  if (!r) return null;
  const text = typeof r === 'string' ? r : (r.token || r.pins?.join?.(', ') || r.pin || r.message || Object.entries(r).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
  return h('div', { class: 'note ok mt', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text' } }, icon('check', 20), h('span', {}, String(text)));
}

function openDetail(order, afterChange) {
  const info = statusInfo(order.status);
  const ref = orderRef(order);
  const pay = h('button', { class: 'btn primary block lg' }, 'Complete payment');
  const sheet = openSheet({
    title: 'Order details',
    content: h('div', {},
      h('div', { class: 'row spread', style: { marginBottom: '8px' } }, h('b', { style: { fontSize: '20px' } }, money(order.amount)), h('span', { class: `pill ${info.cls}` }, info.label)),
      order.service && order.service !== 'data'
        ? h('div', { class: 'kv' }, h('span', {}, 'Service'), h('b', {}, orderTitle(order)))
        : [h('div', { class: 'kv' }, h('span', {}, 'Network'), h('b', {}, order.network || '')), h('div', { class: 'kv' }, h('span', {}, 'Bundle'), h('b', {}, order.bundle_size || ''))],
      h('div', { class: 'kv' }, h('span', {}, order.service === 'cable' ? 'Smartcard' : order.service === 'electricity' ? 'Meter' : 'Recipient'), h('b', {}, order.recipient_number)),
      resultBlock(order),
      h('div', { class: 'kv' }, h('span', {}, 'Ordered'), h('b', {}, fmtDate(order.created_at))),
      order.delivered_at ? h('div', { class: 'kv' }, h('span', {}, 'Delivered'), h('b', {}, fmtDate(order.delivered_at))) : null,
      h('div', { class: 'kv' }, h('span', {}, 'Reference'), h('b', { style: { fontSize: '12px', wordBreak: 'break-all' } }, ref)),
      order.status === 'pending_payment' ? h('div', { class: 'mt2' }, pay) : null),
  });
  pay.addEventListener('click', async () => {
    setLoading(pay, true, 'Please wait');
    try {
      const next = await resumeOrderPayment(ref);
      setLoading(pay, false);
      if (!next) { toast('This order is already paid.', 'ok'); sheet.close(); afterChange(); return; }
      sheet.close();
      const result = await payForOrder({ url: next.url, gateway: next.gateway, ref, summary: [['Amount', money(order.amount)], ['Recipient', order.recipient_number]] });
      if (result.status === 'success') toast('Payment confirmed', 'ok');
      afterChange();
    } catch (err) {
      setLoading(pay, false);
      toast(err.message, 'bad');
    }
  });
}

export function ordersScreen() {
  // Guests: no order history here, just a clear way to sign in.
  if (!getSession('store')) {
    return h('div', {},
      h('div', { class: 'appbar' }, h('h1', {}, 'My orders')),
      h('div', { class: 'signin-prompt rise' },
        h('div', { class: 'art' }, icon('orders', 46)),
        h('h2', {}, 'Sign in to see your orders'),
        h('p', {}, 'Your order history is saved to your account, so you can check every purchase and its status here.'),
        h('button', { class: 'btn primary lg block', onclick: () => go('login') }, icon('user', 22), 'Sign in'),
        h('button', { class: 'btn tonal lg block', onclick: () => go('register') }, 'Create a free account')));
  }

  const list = h('div', { class: 'stack pad' });
  let filter = 'all';
  let orders = [];
  let loading = true;

  const refreshButton = h('button', { class: 'icon-btn', 'aria-label': 'Refresh', onclick: () => load(true) }, icon('refresh'));
  const filters = segmented([
    { value: 'all', label: 'All' },
    { value: 'done', label: 'Delivered' },
    { value: 'wait', label: 'In progress' },
    { value: 'bad', label: 'Failed' },
  ], 'all', (value) => { filter = value; draw(); });

  const root = h('div', {},
    h('div', { class: 'appbar' }, h('h1', {}, 'My orders'), refreshButton),
    h('div', { class: 'pad', style: { marginBottom: '14px' } }, filters),
    list);

  function bucket(order) {
    if (order.status === 'delivered') return 'done';
    if (['failed', 'refunded'].includes(order.status)) return 'bad';
    return 'wait';
  }

  function draw() {
    list.replaceChildren();
    if (loading) {
      for (let i = 0; i < 4; i++) list.append(h('div', { class: 'skeleton', style: { height: '76px' } }));
      return;
    }
    const shown = orders.filter((o) => filter === 'all' || bucket(o) === filter);
    if (!shown.length) {
      list.append(h('div', { class: 'empty' },
        h('div', { class: 'art' }, icon('orders', 42)),
        h('h3', {}, orders.length ? 'Nothing here' : 'No orders yet'),
        h('p', {}, orders.length ? 'No orders match this filter.' : 'Your data purchases will show up here.'),
        orders.length ? null : h('button', { class: 'btn primary', onclick: () => switchTab('home') }, 'Buy data')));
      return;
    }
    shown.forEach((order, i) => { const card = orderCard(order, (o) => openDetail(o, () => load(true))); card.style.setProperty('--i', String(Math.min(i, 8))); list.append(card); });
  }

  async function load(showSkeleton) {
    if (showSkeleton) { loading = true; draw(); }
    const res = await api(`/orders?per_page=100&storefront_domain=${encodeURIComponent(storeDomain())}`);
    orders = res.ok ? (res.data?.data || []) : [];
    if (!res.ok) toast(res.error, 'bad');
    loading = false;
    draw();
  }

  draw();
  load(false);
  return root;
}
