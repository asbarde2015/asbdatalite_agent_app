// Home, VTU-app style: a small header, four quick buttons, then the data plans with a tab per network.
// Names, colours and the logo come from the agent's Store Settings; nothing else is shown here.

import { api } from './api.js';
import { h, icon, money, networkColor, networkTheme, applyNetworkTheme, vibrate, internationalNumber, planNote } from './util.js';
import { getSession, store } from './state.js';
import { logoTile, openSheet, toast } from './ui.js';
import { go, switchTab } from './nav.js';
import { openExternal, openInApp } from './native.js';
import { loadNetworks, openPurchase } from './buy.js';
import { openFundWallet, onWalletChange } from './wallet.js';
import { loadServices, serviceKeys, openService, SERVICE_LABELS, SERVICE_ICONS } from './services.js';

let activeNetworkId = null;           // remembered while the app is open
const bundleCache = new Map();        // network id -> bundles

export function homeScreen() {
  const s = store();
  const user = getSession('store')?.user;
  const first = String(user?.name || '').split(' ')[0];

  const balance = h('b', { class: 'bal' }, money(0));
  const plans = h('div', { class: 'plangrid' });
  const tabs = h('div', { class: 'nettabs' });
  const plansTitle = h('div', { class: 'plans-title' }, h('h3', {}, 'Data plans'), h('small', {}, 'Tap a plan to buy'));

  const header = h('header', { class: 'vtu-head' },
    h('div', { class: 'vtu-top' },
      logoTile(),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('strong', {}, s.business_name || ''), h('span', {}, s.store_tagline || '')),
      h('button', { class: 'icon-btn', 'aria-label': 'Support', style: { color: 'var(--on-primary)' }, onclick: () => openSupport() }, icon('chat', 24))),
    h('p', { class: 'greet' }, user ? `Hi, ${first || 'there'} \u{1F44B}` : 'Welcome \u{1F44B}'),
    user
      ? h('div', { class: 'balcard' }, h('div', {}, h('small', {}, 'Wallet balance'), h('div', {}, balance)), h('div', { class: 'balico' }, icon('wallet', 26)))
      : h('p', { class: 'greet-sub' }, 'Buy data in seconds. No account needed.'));

  const quick = h('div', { class: 'quickcard' },
    quickButton('bolt', 'Buy data', () => plansTitle.scrollIntoView({ behavior: 'smooth', block: 'start' })),
    quickButton('orders', 'Orders', () => switchTab('orders')),
    quickButton('wallet', user ? 'Add money' : 'Sign in', () => (user ? openFundWallet() : go('login'))),
    quickButton('chat', 'Support', () => openSupport()));

  // Everything the store's country sells (Nigeria: data, airtime, cable TV, electricity, exam pins; Ghana: data).
  const svcRow = h('div', { class: 'svc-row', hidden: true });
  const root = h('div', {}, header, quick, svcRow, h('section', { class: 'plans-wrap' }, plansTitle, tabs, plans));

  loadServices().then((catalog) => {
    const keys = serviceKeys(catalog).filter((k) => k !== 'data');
    if (!keys.length) return;
    svcRow.hidden = false;
    svcRow.replaceChildren(...keys.map((k) => h('button', { class: 'svc-tile ripple', onclick: () => { vibrate(10); openService(k, catalog); } },
      h('span', { class: 'svc-ico' }, icon(SERVICE_ICONS[k], 24)), h('small', {}, SERVICE_LABELS[k]))));
  });

  // ---- wallet balance (signed-in customers) ----
  if (user) {
    const paintBalance = () => api('/wallet').then((res) => { if (res.ok) balance.textContent = money(res.data.balance); });
    paintBalance(); onWalletChange(paintBalance);
  }

  // ---- network tabs + plans ----
  function drawSkeleton(count = 6) {
    plans.replaceChildren(...Array.from({ length: count }, () => h('div', { class: 'skeleton', style: { height: '84px' } })));
  }

  async function showNetwork(network, list) {
    activeNetworkId = network.id;
    [...tabs.children].forEach((el) => el.classList.toggle('on', el.dataset.id === String(network.id)));
    let bundles = bundleCache.get(network.id);
    if (!bundles) {
      drawSkeleton();
      const res = await api(`/networks/${network.id}/bundles`, { session: null });
      if (activeNetworkId !== network.id) return; // switched tab while loading
      if (!res.ok) {
        plans.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1 / -1', padding: '30px 10px' } }, h('p', {}, res.error), h('button', { class: 'btn tonal', onclick: () => showNetwork(network, list) }, 'Try again')));
        return;
      }
      bundles = res.data?.data || [];
      bundleCache.set(network.id, bundles);
    }
    applyNetworkTheme(plans, networkTheme(network.name));
    plans.dataset.net = networkTheme(network.name).key;
    if (!bundles.length) {
      plans.replaceChildren(h('p', { class: 'muted center', style: { gridColumn: '1 / -1', padding: '30px 0' } }, 'No plans available for this network right now.'));
      return;
    }
    plans.replaceChildren(...bundles.map((bundle, i) => h('button', { class: 'plan-card pop', style: { '--i': String(Math.min(i, 10)) }, onclick: () => { vibrate(10); openPurchase({ bundle, network }); } },
      h('span', { class: 'pc-net' }, network.name),
      h('b', { class: 'pc-size' }, bundle.size_label),
      h('small', { class: 'pc-sub' }, planNote(bundle)),
      h('div', { class: 'pc-foot' }, h('span', { class: 'pc-price' }, money(bundle.price)), h('i', { class: 'pc-go' }, icon('right', 16))))));
  }

  loadNetworks().then((list) => {
    if (!list || !list.length) {
      tabs.remove();
      plans.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('div', { class: 'art' }, icon('wifi', 42)), h('h3', {}, 'Could not load plans'), h('p', {}, 'Check your connection and try again.'), h('button', { class: 'btn primary', onclick: () => switchTab('home') }, 'Try again')));
      return;
    }
    list.forEach((network) => {
      const color = networkColor(network.name);
      tabs.append(h('button', { class: 'nettab', dataset: { id: String(network.id) }, style: { '--nc': color.bg, '--nf': color.fg }, onclick: () => { vibrate(8); showNetwork(network, list); } }, h('i', { class: 'dot' }), network.name));
    });
    showNetwork(list.find((n) => n.id === activeNetworkId) || list[0], list);
  });

  return root;
}

function quickButton(iconName, label, onClick) {
  return h('button', { class: 'q ripple', onclick: onClick }, h('span', { class: 'qi' }, icon(iconName, 24)), h('small', {}, label));
}

/** Support details the agent entered in Store Settings (phone, WhatsApp, email, social links). Shown only on request. */
function openSupport() {
  const s = store();
  const rows = [];
  const row = (iconName, title, value, action) => h('button', { class: 'contact-row ripple', onclick: action },
    h('div', { class: 'ico' }, icon(iconName, 20)),
    h('div', { style: { flex: 1, minWidth: 0 } }, h('b', {}, title), h('small', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, value)),
    icon('right', 18));
  if (s.support_phone) rows.push(row('phone', 'Call us', s.support_phone, () => openExternal(`tel:${s.support_phone}`)));
  if (s.whatsapp_number) rows.push(row('chat', 'WhatsApp', s.whatsapp_number, () => openExternal(`https://wa.me/${whatsappInternational(s.whatsapp_number)}`)));
  if (s.support_email) rows.push(row('mail', 'Email', s.support_email, () => openExternal(`mailto:${s.support_email}`)));
  Object.entries(s.socials || {}).filter(([, url]) => url).forEach(([name, url]) => rows.push(row('globe', name.charAt(0).toUpperCase() + name.slice(1), String(url).replace(/^https?:\/\/(www\.)?/, ''), () => openInApp(url))));
  if (!rows.length) { toast('Support details are not available yet.'); return; }
  openSheet({ title: 'Support', content: h('div', {}, rows) });
}

/** The agent saves a local number (0241234567); WhatsApp links need the international form (233241234567). */
const whatsappInternational = internationalNumber;
