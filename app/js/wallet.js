// One wallet per account: add money once, then pay with it for anything in the store's website and this app
// (the same signed-in account is used on both). The wallet is always in the store country's currency.

import { api } from './api.js';
import { h, icon, money, sleep } from './util.js';
import { openSheet, segmented, field, setLoading, toast } from './ui.js';
import { runPayment } from './pay.js';
import { publicSettings } from './api.js';

const bus = new EventTarget();
/** Called whenever the wallet balance may have changed (after funding, after paying from it). */
export const onWalletChange = (fn) => bus.addEventListener('change', fn);
export const notifyWallet = () => bus.dispatchEvent(new Event('change'));

/** { balance, topup_min, topup_max } for a signed-in person, or null. */
export async function loadWallet() {
  const res = await api('/wallet');
  return res.ok ? { balance: Number(res.data.balance) || 0, min: Number(res.data.topup_min) || 1, max: Number(res.data.topup_max) || 1000000 } : null;
}

/**
 * "Pay with" for a signed-in buyer: their wallet (if it covers the price) and the card / Mobile Money gateways.
 * Returns { el, value() } where value() is the payment_method to send ('wallet' or a gateway key).
 */
export function payMethodPicker({ gateways, wallet, amount, onAddMoney }) {
  const covers = wallet && wallet.balance + 0.001 >= amount;
  const items = [];
  if (wallet) items.push({ value: 'wallet', label: `Wallet · ${money(wallet.balance)}` });
  gateways.forEach((g) => items.push({ value: g.key, label: wallet || gateways.length < 2 ? (gateways.length > 1 ? g.label : 'Card / MoMo') : g.label }));
  let current = covers ? 'wallet' : (gateways[0]?.key || null);
  if (!wallet && gateways.length < 2) return { el: null, value: () => current };
  const el = h('div', {},
    h('div', { class: 'eyebrow' }, 'Pay with'),
    segmented(items, current, (v) => { current = v; }),
    wallet && !covers ? h('p', { class: 'muted', style: { fontSize: '13px', margin: '8px 0 0' } }, 'Your wallet is too low for this. ', h('button', { class: 'btn text sm', style: { height: 'auto', padding: 0 }, onclick: onAddMoney }, 'Add money')) : null);
  return { el, value: () => (current === 'wallet' && !covers ? (gateways[0]?.key || null) : current) };
}

/** The "Add money" sheet: amount + payment method, then the secure payment screen. Resolves true if money was added. */
export async function openFundWallet() {
  const wallet = await loadWallet();
  if (!wallet) { toast('Please sign in to add money.', 'bad'); return false; }
  const settings = await publicSettings();
  const all = settings.payment_gateways || [];
  const amount = field({ label: 'Amount', type: 'number', inputmode: 'decimal', hint: `From ${money(wallet.min)} to ${money(wallet.max)}` });
  const quick = [wallet.min, wallet.min * 2, wallet.min * 5, wallet.min * 10].filter((v, i, a) => v <= wallet.max && a.indexOf(v) === i);
  const note = h('p', { class: 'muted', style: { fontSize: '13px', margin: '0' } }, `Your balance: ${money(wallet.balance)}. Add money once with card or Mobile Money, then pay with it for anything in this store, here and on the website.`);
  const chips = h('div', { class: 'chips' }, quick.map((v) => h('button', { type: 'button', class: 'chip', onclick: () => { amount.value = String(v); drawGateways(); } }, money(v))));
  const gwSlot = h('div', {});
  const go = h('button', { class: 'btn primary lg block' }, 'Continue to payment');
  let gateway = all[0]?.key || null;

  function drawGateways() {
    const a = Number(amount.value) || 0;
    const list = all.filter((g) => !(g.min_amount > 0) || a + 0.001 >= g.min_amount);
    if (!list.some((g) => g.key === gateway)) gateway = list[0]?.key || null;
    gwSlot.replaceChildren(...(list.length > 1 ? [h('div', { class: 'eyebrow' }, 'Pay with'), segmented(list.map((g) => ({ value: g.key, label: g.label })), gateway, (v) => { gateway = v; })] : []));
  }
  amount.input.addEventListener('input', drawGateways);
  drawGateways();

  const sheet = openSheet({ title: 'Add money', content: h('div', { class: 'stack' }, note, chips, amount.el, gwSlot, go) });

  return new Promise((resolve) => {
    go.addEventListener('click', async () => {
      const value = Number(amount.value);
      if (!(value >= wallet.min && value <= wallet.max)) { amount.hint(`Enter an amount between ${money(wallet.min)} and ${money(wallet.max)}`, 'bad'); amount.input.focus(); return; }
      setLoading(go, true, 'Starting payment');
      const res = await api('/wallet/fund', { method: 'POST', body: { amount: value, ...(gateway ? { gateway } : {}) } });
      setLoading(go, false);
      if (!res.ok) { toast(res.error, 'bad'); return; }
      sheet.close();
      const ref = res.data.reference;
      const result = await runPayment({
        url: res.data.authorization_url,
        gateway: res.data.gateway,
        summary: [['Added to wallet', money(value)]],
        successTitle: 'Wallet funded',
        successText: 'The money is in your wallet. You can now pay for anything with it.',
        verify: async () => {
          const c = await api(`/payments/confirm/${encodeURIComponent(ref)}`);
          const status = c.ok ? c.data?.status : 'pending';
          return { status: status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'pending' };
        },
      });
      notifyWallet();
      if (result.status === 'success') toast('Wallet funded', 'ok');
      resolve(result.status === 'success');
    });
  });
}
