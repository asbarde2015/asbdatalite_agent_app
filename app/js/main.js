// App start-up: load the store's settings, theme the app with the store's colours, play the splash,
// show the onboarding slides on first launch, then the main app.

import { $, h, icon, initRipple, sleep, initials } from './util.js';
import { api } from './api.js';
import { ls, state, store, on } from './state.js';
import { closeTopSheet, hasSheet, storeImage, toast } from './ui.js';
import { back, currentScreen, go, refresh, registerScreens, switchTab, TABS } from './nav.js';
import { exitApp, getLaunchUrl, hideNativeSplash, onAppUrlOpen, onBackButton, styleStatusBar } from './native.js';
import { publicSettings } from './api.js';
import { showOnboarding } from './onboarding.js';
import { homeScreen } from './home.js';
import { ordersScreen } from './orders.js';
import { accountScreen } from './account.js';
import { loginScreen, registerScreen, forgotScreen, verifyScreen } from './auth.js';

// ---------------------------------------------------------------- theme
function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));

function applyTheme() {
  const c = store().colors || {};
  const primary = isHex(c.primary) ? c.primary : '#2A2FA0';
  const root = document.documentElement.style;
  const onPrimary = luminance(primary) > 0.55 ? '#14163a' : '#ffffff';
  root.setProperty('--primary', primary);
  root.setProperty('--primary-deep', isHex(c.primaryDeep) ? c.primaryDeep : primary);
  root.setProperty('--tint', isHex(c.primaryTint) ? c.primaryTint : '#e8eaff');
  if (isHex(c.textColor)) root.setProperty('--text', c.textColor);
  if (isHex(c.textMuted)) root.setProperty('--muted', c.textMuted);
  root.setProperty('--on-primary', onPrimary);
  $('meta[name="theme-color"]')?.setAttribute('content', primary);
  document.title = store().business_name || 'App';
  styleStatusBar(primary, onPrimary === '#ffffff');
}

// ---------------------------------------------------------------- splash
function renderSplash() {
  const s = store();
  const logo = storeImage('logo', { alt: '' }, () => tile.replaceChildren(h('b', {}, initials(s.business_name))));
  const tile = h('div', { class: 'tile' }, logo || h('b', {}, initials(s.business_name)));
  $('#splash').replaceChildren(...[tile, h('h1', {}, s.business_name || ''), s.store_tagline ? h('p', {}, s.store_tagline) : null, h('div', { class: 'bar' }, h('i'))].filter(Boolean));
}

async function hideSplash() {
  const el = $('#splash');
  el.classList.add('out');
  await sleep(480);
  el.remove();
}

// ---------------------------------------------------------------- navigation bar
function buildNav() {
  const items = [['home', 'Home', 'home'], ['orders', 'Orders', 'orders'], ['account', 'Account', 'user']];
  $('#nav').replaceChildren(...items.map(([tab, label, ico]) => h('button', {
    dataset: { tab },
    onclick: () => { if (currentScreen()?.name === tab) $('#view').scrollTo({ top: 0, behavior: 'smooth' }); else switchTab(tab); },
  }, h('span', { class: 'pillbg' }, icon(ico, 22)), label)));
}

// ---------------------------------------------------------------- Android back button
let lastBack = 0;
function handleBack() {
  if (closeTopSheet()) return;
  if (back()) return;
  if (currentScreen() && currentScreen().name !== 'home') { switchTab('home'); return; }
  if (Date.now() - lastBack < 1800) { exitApp(); return; }
  lastBack = Date.now();
  toast('Press back again to exit');
}

// ---------------------------------------------------------------- links that open the app
// The "email verified" page on the store's website sends the phone back here:
// https://<store>/email-verified?status=success  ->  "Email verified!" and the sign-in screen.
export function handleDeepLink(url) {
  if (!url || !/\/email-verified/.test(url) || $('#app').hidden) return;
  const onVerify = currentScreen()?.name === 'verify';
  if (/status=success/.test(url)) {
    toast('Email verified! You can sign in now.', 'ok');
    if (!onVerify) switchTab('account');
    go('login', { email: ls.get('pending_email') || '', verified: true }, { replace: onVerify });
  } else {
    toast('That verification link has expired. Request a new one.', 'bad');
    if (!onVerify) { switchTab('account'); go('verify', {}); }
  }
}

// ---------------------------------------------------------------- live refresh of the store's settings
async function fetchLive() {
  const res = await api(`/storefront?domain=${encodeURIComponent(state.cfg.subdomain)}`, { session: null });
  if (res.status === 404) { showUnavailable(); return; }
  if (!res.ok) return;
  const before = JSON.stringify(store());
  state.live = res.data;
  ls.set('live', res.data);
  if (JSON.stringify(store()) === before) return;
  applyTheme();
  // Redraw the home screen with the fresh text, unless the person is in the middle of something.
  if (!$('#app').hidden && currentScreen()?.name === 'home' && !hasSheet()) refresh();
}

function showUnavailable() {
  document.body.append(h('div', { class: 'onb', style: { zIndex: 90, alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px', gap: '14px' } },
    h('div', { class: 'empty' }, h('div', { class: 'art' }, icon('store', 42)), h('h3', {}, 'This store is unavailable'), h('p', {}, 'It may be taking a short break. Please try again later.'), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Try again'))));
}

// ---------------------------------------------------------------- boot
function enterApp() {
  $('#app').hidden = false;
  switchTab('home');
}

async function boot() {
  initRipple();
  try {
    state.cfg = await (await fetch('config.json', { cache: 'no-store' })).json();
  } catch {
    document.body.textContent = 'This app could not start. Please reinstall it.';
    return;
  }
  state.live = ls.get('live');
  applyTheme();
  renderSplash();
  hideNativeSplash();

  registerScreens({ home: homeScreen, orders: ordersScreen, account: accountScreen, login: loginScreen, register: registerScreen, verify: verifyScreen, forgot: forgotScreen });
  buildNav();
  onBackButton(handleBack);
  onAppUrlOpen(handleDeepLink);
  on('session', () => { if (TABS.includes(currentScreen()?.name) && !hasSheet()) refresh(); });

  fetchLive();
  publicSettings();

  await sleep(2100);
  if (ls.get('onboarded')) {
    enterApp();
    getLaunchUrl().then(handleDeepLink); // the app was started by tapping the link in the verification email
    await hideSplash();
  } else {
    showOnboarding(enterApp);
    await hideSplash();
  }
}

boot();
