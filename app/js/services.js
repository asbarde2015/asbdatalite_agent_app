// Airtime, cable TV, electricity and exam pins. Which of these a store sells is decided by the store's
// country (Nigeria: all of them; Ghana: data only) and always comes from the server's /services catalogue,
// priced in the store's own currency. Data bundles keep their own flow in buy.js.

import { api, storeDomain, publicSettings, gatewaysFor } from './api.js';
import { h, icon, money, cleanNumber, validNumber, phoneDigits, phoneExample } from './util.js';
import { getSession, ls } from './state.js';
import { openSheet, segmented, field, setLoading, toast } from './ui.js';
import { go } from './nav.js';
import { payForOrder } from './orders.js';
import { loadWallet, payMethodPicker, openFundWallet, notifyWallet } from './wallet.js';

export const SERVICE_LABELS = { data: 'Data', airtime: 'Airtime', cable: 'Cable TV', electricity: 'Electricity', exam: 'Exam pins' };
export const SERVICE_ICONS = { data: 'wifi', airtime: 'phone', cable: 'globe', electricity: 'bolt', exam: 'star' };
const ORDER = ['data', 'airtime', 'cable', 'electricity', 'exam'];

let catalogCache = null;

/** The store country's catalogue: { country, services: { airtime: {...}, ... } }, or null when it cannot be loaded. */
export async function loadServices(force = false) {
  if (catalogCache && !force) return catalogCache;
  const res = await api('/services', { session: null });
  if (!res.ok) return null;
  catalogCache = res.data;
  return catalogCache;
}

/** Service keys on sale, in a fixed order. Data is always first when the country sells it. */
export function serviceKeys(catalog) {
  const have = Object.keys(catalog?.services || {});
  return ORDER.filter((k) => have.includes(k));
}

export async function openService(key, catalog) {
  const s = catalog?.services?.[key];
  if (!s) { toast('This service is not available right now.', 'bad'); return; }

  const session = getSession('store');
  const user = session?.user;
  const settings = await publicSettings();
  const saved = ls.get('buyer', {});
  const guestAllowed = !!settings.guest_checkout_enabled;
  const needsAccount = !user && !guestAllowed;
  const digits = phoneDigits();

  let gateway = null;
  let gateways = [];
  const wallet = user ? await loadWallet() : null;
  let payPicker = null;
  let verified = null; // 'ok' | 'bad' | 'unavailable'

  const firstName = field({ label: 'First name', autocomplete: 'given-name', value: saved.first || '' });
  const lastName = field({ label: 'Last name', autocomplete: 'family-name', value: saved.last || '' });
  const email = field({ label: 'Email (for your receipt)', type: 'email', autocomplete: 'email', inputmode: 'email', value: saved.email || '' });
  const guestPhone = field({ label: 'Your phone number', digits, value: saved.number || '' });
  const payButton = h('button', { class: 'btn primary lg block' }, 'Pay');
  const totalEl = h('b', { class: 'svc-total' }, money(0));
  const verifyOut = h('div', { class: 'hint', hidden: true });
  const gatewaySlot = h('div', {});

  // ---- fields per service ----
  const inputs = {};
  const body = [];
  const amount = () => Number(inputs.amount?.value) || 0;

  const refreshTotal = () => { totalEl.textContent = money(total()); payButton.textContent = total() > 0 ? `Pay ${money(total())}` : 'Pay'; };
  const resetVerify = () => { verified = null; verifyOut.hidden = true; verifyOut.textContent = ''; };
  const listen = (f) => { f.input.addEventListener('input', () => { refreshTotal(); }); f.input.addEventListener('change', () => { refreshTotal(); }); };

  let total = () => 0;
  let title = SERVICE_LABELS[key];
  let summary = () => [];
  let collect = () => ({});
  let validate = () => null;

  if (key === 'airtime') {
    const networks = s.networks || [];
    inputs.network = field({ label: 'Network', options: networks.map((n) => ({ value: String(n.id), label: n.name })) });
    const types = s.types?.length ? s.types : [{ key: 'VTU', min_amount: s.min_amount }];
    inputs.type = field({ label: 'Type', options: types.map((t) => ({ value: t.key, label: `${t.key} (min ${money(t.min_amount)})` })) });
    inputs.recipient = field({ label: 'Phone number to credit', digits, value: saved.number || '', hint: `e.g. ${phoneExample()}` });
    inputs.amount = field({ label: `Amount (${money(0).replace(/[\d.,\s]/g, '')})`, type: 'number', inputmode: 'decimal' });
    body.push(inputs.network.el, inputs.type.el, inputs.recipient.el, inputs.amount.el);
    total = () => Math.round(amount() * (s.price_factor || 1) * 100) / 100;
    listen(inputs.amount);
    const minOf = () => (types.find((t) => t.key === inputs.type.value) || types[0]).min_amount || s.min_amount || 50;
    validate = () => {
      if (!validNumber(inputs.recipient.value)) return ['recipient', `Enter the ${digits} digit number, e.g. ${phoneExample()}`];
      if (amount() < minOf()) return ['amount', `The smallest amount is ${money(minOf())}`];
      return null;
    };
    collect = () => ({ service: 'airtime', network_id: Number(inputs.network.value), airtime_type: inputs.type.value, amount: amount(), recipient_number: cleanNumber(inputs.recipient.value) });
    summary = () => [['Service', `${(networks.find((n) => String(n.id) === inputs.network.value) || {}).name || ''} airtime`], ['Recipient', cleanNumber(inputs.recipient.value)], ['Airtime', money(amount())], ['You pay', money(total())]];
  } else if (key === 'cable') {
    const providers = s.providers || [];
    inputs.provider = field({ label: 'Provider', options: providers.map((p, i) => ({ value: String(i), label: p.name })) });
    inputs.pkg = field({ label: 'Package', options: [] });
    inputs.recipient = field({ label: 'Smartcard / IUC number', type: 'text', inputmode: 'numeric', maxlength: 20 });
    const verifyBtn = h('button', { class: 'btn tonal sm', type: 'button' }, 'Verify number');
    const fillPackages = () => {
      const p = providers[Number(inputs.provider.value)] || providers[0];
      inputs.pkg.input.replaceChildren(...(p?.packages || []).map((x) => h('option', { value: String(x.id) }, `${x.name} - ${money(x.price)}`)));
      resetVerify(); refreshTotal();
    };
    inputs.provider.input.addEventListener('change', fillPackages);
    inputs.pkg.input.addEventListener('change', () => { resetVerify(); refreshTotal(); });
    inputs.recipient.input.addEventListener('input', resetVerify);
    verifyBtn.addEventListener('click', async () => {
      const num = inputs.recipient.value.replace(/\D/g, '');
      if (num.length < 6) { inputs.recipient.hint('Enter the smartcard number first', 'bad'); return; }
      setLoading(verifyBtn, true, 'Checking');
      const res = await api(`/services/verify/smartcard?catalog_item_id=${inputs.pkg.value}&number=${encodeURIComponent(num)}`, { session: null });
      setLoading(verifyBtn, false);
      showVerify(res);
    });
    fillPackages();
    body.push(inputs.provider.el, inputs.pkg.el, inputs.recipient.el, h('div', {}, verifyBtn), verifyOut);
    const pkg = () => (providers[Number(inputs.provider.value)] || providers[0])?.packages?.find((x) => String(x.id) === inputs.pkg.value);
    total = () => Number(pkg()?.price) || 0;
    validate = () => {
      if (inputs.recipient.value.replace(/\D/g, '').length < 6) return ['recipient', 'Enter the smartcard / IUC number'];
      if (verified === 'bad') return ['recipient', 'That number could not be verified. Please check it.'];
      if (!verified) return ['recipient', 'Tap "Verify number" first so we know it is right.'];
      return null;
    };
    collect = () => ({ service: 'cable', catalog_item_id: Number(inputs.pkg.value), recipient_number: inputs.recipient.value.replace(/\D/g, '') });
    summary = () => [['Package', `${providers[Number(inputs.provider.value)]?.name || ''} ${pkg()?.name || ''}`.trim()], ['Smartcard', inputs.recipient.value.replace(/\D/g, '')], ['Amount', money(total())]];
  } else if (key === 'electricity') {
    const companies = s.companies || [];
    inputs.company = field({ label: 'Electricity company', options: companies.map((c) => ({ value: String(c.id), label: c.name })) });
    inputs.meterType = field({ label: 'Meter type', options: (s.meter_types || ['Prepaid', 'Postpaid']).map((m) => ({ value: m, label: m })) });
    inputs.recipient = field({ label: 'Meter number', type: 'text', inputmode: 'numeric', maxlength: 20 });
    inputs.amount = field({ label: `Amount (min ${money(s.min_amount || 500)})`, type: 'number', inputmode: 'decimal' });
    const verifyBtn = h('button', { class: 'btn tonal sm', type: 'button' }, 'Verify meter');
    [inputs.company, inputs.meterType].forEach((f) => f.input.addEventListener('change', resetVerify));
    inputs.recipient.input.addEventListener('input', resetVerify);
    verifyBtn.addEventListener('click', async () => {
      const num = inputs.recipient.value.replace(/\D/g, '');
      if (num.length < 6) { inputs.recipient.hint('Enter the meter number first', 'bad'); return; }
      setLoading(verifyBtn, true, 'Checking');
      const res = await api(`/services/verify/meter?catalog_item_id=${inputs.company.value}&number=${encodeURIComponent(num)}&meter_type=${encodeURIComponent(inputs.meterType.value)}`, { session: null });
      setLoading(verifyBtn, false);
      showVerify(res);
    });
    body.push(inputs.company.el, inputs.meterType.el, inputs.recipient.el, h('div', {}, verifyBtn), verifyOut, inputs.amount.el);
    total = () => Math.round(amount() * (s.price_factor || 1) * 100) / 100;
    listen(inputs.amount);
    validate = () => {
      if (inputs.recipient.value.replace(/\D/g, '').length < 6) return ['recipient', 'Enter the meter number'];
      if (verified === 'bad') return ['recipient', 'That meter could not be verified. Please check it.'];
      if (!verified) return ['recipient', 'Tap "Verify meter" first so we know it is right.'];
      if (amount() < (s.min_amount || 500)) return ['amount', `The smallest purchase is ${money(s.min_amount || 500)}`];
      return null;
    };
    collect = () => ({ service: 'electricity', catalog_item_id: Number(inputs.company.value), meter_type: inputs.meterType.value, amount: amount(), recipient_number: inputs.recipient.value.replace(/\D/g, '') });
    summary = () => [['Company', companies.find((c) => String(c.id) === inputs.company.value)?.name || ''], ['Meter', inputs.recipient.value.replace(/\D/g, '')], ['You pay', money(total())]];
  } else if (key === 'exam') {
    const exams = s.exams || [];
    inputs.exam = field({ label: 'Exam', options: exams.map((e) => ({ value: String(e.id), label: `${e.name} - ${money(e.price)}` })) });
    inputs.qty = field({ label: `How many pins? (up to ${s.max_quantity || 10})`, type: 'number', inputmode: 'numeric', value: '1' });
    inputs.recipient = field({ label: 'Your phone number', digits, value: saved.number || '', hint: 'The pins are shown after payment and emailed to you.' });
    body.push(inputs.exam.el, inputs.qty.el, inputs.recipient.el);
    const qty = () => Math.max(1, Math.min(s.max_quantity || 10, Number(inputs.qty.value) || 1));
    const exam = () => exams.find((e) => String(e.id) === inputs.exam.value);
    total = () => Math.round((Number(exam()?.price) || 0) * qty() * 100) / 100;
    listen(inputs.exam); listen(inputs.qty);
    validate = () => (!validNumber(inputs.recipient.value) ? ['recipient', `Enter the ${digits} digit number, e.g. ${phoneExample()}`] : null);
    collect = () => ({ service: 'exam', catalog_item_id: Number(inputs.exam.value), quantity: qty(), recipient_number: cleanNumber(inputs.recipient.value) });
    summary = () => [['Exam', exam()?.name || ''], ['Pins', String(qty())], ['Amount', money(total())]];
  }

  function showVerify(res) {
    verifyOut.hidden = false;
    if (!res.ok) { verified = 'unavailable'; verifyOut.className = 'hint bad'; verifyOut.textContent = `${res.error} You can still continue - double-check the number.`; return; }
    if (res.data?.valid) { verified = 'ok'; verifyOut.className = 'hint ok'; verifyOut.textContent = `✓ ${res.data.name || 'Number is valid'}`; }
    else { verified = 'bad'; verifyOut.className = 'hint bad'; verifyOut.textContent = 'That number was not found. Please check it.'; }
  }

  const parts = [h('div', { class: 'svc-head' }, h('span', { class: 'svc-ico' }, icon(SERVICE_ICONS[key], 22)), h('b', {}, SERVICE_LABELS[key]), h('span', { class: 'spacer' }), h('small', {}, 'Total'), totalEl)];
  if (needsAccount) {
    parts.push(
      h('div', { class: 'note info mt' }, icon('info', 20), h('span', {}, 'Please sign in or create a free account to buy.')),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn outline block', onclick: () => { sheet.close(); go('register'); } }, 'Create account'),
        h('button', { class: 'btn primary block', onclick: () => { sheet.close(); go('login'); } }, 'Sign in')));
  } else {
    const stack = [...body];
    if (!user) stack.push(h('div', { class: 'grid2' }, firstName.el, lastName.el), email.el, guestPhone.el);
    stack.push(gatewaySlot);
    parts.push(h('div', { class: 'stack mt' }, ...stack),
      h('div', { class: 'note mt' }, icon('info', 20), h('span', {}, key === 'exam' ? 'Check the details. Pins cannot be refunded once issued.' : 'Check the number carefully. Once paid, an order cannot be undone or refunded.')),
      h('div', { class: 'mt' }, payButton));
  }
  const sheet = openSheet({ title: title, content: h('div', {}, ...parts) });
  refreshTotal();

  // Payment methods depend on the amount, so they are drawn once the amount is known to be above zero.
  let gatewayFor = -1;
  const drawGateways = async () => {
    const t = total();
    if (t <= 0 || t === gatewayFor) return;
    gatewayFor = t;
    gateways = await gatewaysFor(t);
    gateway = gateways[0]?.key || null;
    if (user) {
      // Signed in: pay from the wallet (fund it once, use it everywhere) or by card / Mobile Money.
      payPicker = payMethodPicker({ gateways, wallet, amount: t, onAddMoney: async () => { if (await openFundWallet()) { sheet.close(); openService(key, catalog); } } });
      gatewaySlot.replaceChildren(...(payPicker.el ? [payPicker.el] : []));
      return;
    }
    gatewaySlot.replaceChildren(...(gateways.length > 1 ? [h('div', {}, h('div', { class: 'eyebrow' }, 'Pay with'), segmented(gateways.map((g) => ({ value: g.key, label: g.label })), gateway, (v) => { gateway = v; }))] : []));
  };
  sheet.el?.addEventListener?.('input', () => drawGateways());
  drawGateways();

  payButton.addEventListener('click', async () => {
    const bad = validate();
    if (bad) { inputs[bad[0]].hint(bad[1], 'bad'); inputs[bad[0]].input.focus(); toast(bad[1], 'bad'); return; }
    if (total() <= 0) { toast('Enter an amount first', 'bad'); return; }
    if (!user) {
      if (!firstName.value || !lastName.value) { toast('Enter your first and last name', 'bad'); return; }
      if (!/^\S+@\S+\.\S+$/.test(email.value)) { email.hint('Enter a valid email address', 'bad'); return; }
      if (!validNumber(guestPhone.value)) { guestPhone.hint(`Enter your ${digits} digit phone number`, 'bad'); return; }
    }
    await drawGateways();
    const common = { ...collect(), storefront_domain: storeDomain(), payment_method: (payPicker ? payPicker.value() : gateway) || undefined };
    setLoading(payButton, true, 'Placing order');
    const res = user
      ? await api('/service-orders', { method: 'POST', body: common })
      : await api('/service-orders/guest', { method: 'POST', session: null, body: { ...common, first_name: firstName.value, last_name: lastName.value, email: email.value, phone: cleanNumber(guestPhone.value) } });
    setLoading(payButton, false);
    if (!res.ok) { toast(res.error, 'bad'); return; }

    const recipient = common.recipient_number;
    ls.set('buyer', { ...saved, number: validNumber(recipient) ? recipient : saved.number, first: firstName.value || saved.first, last: lastName.value || saved.last, email: email.value || saved.email });
    const order = res.data.order;
    const ref = res.data.reference || `ORD-${order.id}`;
    const rows = summary();
    sheet.close();
    if (!res.data.authorization_url) { // paid from the wallet
      notifyWallet();
      toast('Paid from your wallet. Your order is being processed.', 'ok');
      if (getSession('store')) (await import('./nav.js')).switchTab('orders');
      return;
    }
    const result = await payForOrder({ url: res.data.authorization_url, ref, gateway: order.payment_method || gateway, summary: rows, service: key });
    if (result.status === 'success') toast('Payment received. Your order is being processed.', 'ok');
    if (getSession('store')) (await import('./nav.js')).switchTab('orders');
  });
}
