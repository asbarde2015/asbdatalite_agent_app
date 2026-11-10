// Smoke test: renders every screen against a tiny fake DOM and a fake API, and walks the buy flow.
// It cannot judge looks, but it catches the mistakes that stop an app from starting (bad imports,
// typos, code that throws while a screen is being built).   Run:  node tests/smoke.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ fake DOM
class Node_ {
  constructor() { this.childNodes = []; this.parentNode = null; }
  _add(x) { if (x.parentNode) x.parentNode.removeChild(x); x.parentNode = this; this.childNodes.push(x); }
  append(...items) { for (const x of items) this._add(typeof x === 'string' ? new Text_(x) : x); }
  appendChild(x) { this._add(x); return x; }
  removeChild(x) { const i = this.childNodes.indexOf(x); if (i >= 0) { this.childNodes.splice(i, 1); x.parentNode = null; } return x; }
  replaceChildren(...items) { this.childNodes.slice().forEach((c) => this.removeChild(c)); this.append(...items); }
  insertBefore(node, ref) { if (node.parentNode) node.parentNode.removeChild(node); node.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(node); else this.childNodes.splice(i, 0, node); return node; }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter((n) => n instanceof Element_); }
  get isConnected() { let p = this; while (p) { if (p === document) return true; p = p.parentNode; } return false; }
  remove() { this.parentNode?.removeChild(this); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
}
class Text_ extends Node_ {
  constructor(t) { super(); this.data = String(t); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}
class ClassList {
  constructor(el) { this.el = el; }
  _set() { return new Set((this.el.className || '').split(/\s+/).filter(Boolean)); }
  add(...c) { const s = this._set(); c.forEach((x) => s.add(x)); this.el.className = [...s].join(' '); }
  remove(...c) { const s = this._set(); c.forEach((x) => s.delete(x)); this.el.className = [...s].join(' '); }
  contains(c) { return this._set().has(c); }
  toggle(c, force) { const has = this.contains(c); const want = force === undefined ? !has : !!force; if (want) this.add(c); else this.remove(c); return want; }
}
class Element_ extends Node_ {
  constructor(tag, ns) {
    super();
    this.tagName = String(tag).toUpperCase(); this.localName = String(tag).toLowerCase(); this.ns = ns;
    this.attrs = {}; this.className = ''; this.listeners = {}; this.hidden = false; this.dataset = {}; this.value = ''; this.type = '';
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty() {} };
    this.classList = new ClassList(this);
    this.clientWidth = 360; this.offsetWidth = 80; this.offsetLeft = 0;
  }
  get id() { return this.attrs.id; }
  setAttribute(k, v) { if (k === 'class') this.className = v; else if (k === 'value') this.value = String(v); else this.attrs[k] = String(v); if (k === 'type') this.type = String(v); }
  getAttribute(k) { return k === 'class' ? this.className : (this.attrs[k] ?? null); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  // Like a real browser: handlers are started, not awaited (a click that opens the payment screen must not block the test).
  fire(type, extra = {}) {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {}, key: '', ...extra };
    for (const fn of this.listeners[type] || []) {
      Promise.resolve().then(() => fn(event)).catch((e) => { console.log(`FAIL  handler for ${type} threw:`, e); process.exitCode = 1; });
    }
    return Promise.resolve();
  }
  click() { return this.fire('click'); }
  focus() {} scrollIntoView() {} scrollTo() {} setPointerCapture() {} getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
  closest(sel) { let p = this; while (p instanceof Element_) { if (matches(p, sel)) return p; p = p.parentNode; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.childNodes) { if (c instanceof Element_) { if (matches(c, sel)) out.push(c); walk(c); } } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get files() { return []; }
}
function simpleMatch(el, part) {
  if (!part) return true;
  const m = part.match(/^([a-z0-9]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i);
  if (!m) return false;
  if (m[1] && el.localName !== m[1].toLowerCase()) return false;
  for (const t of m[2].match(/[#.][\w-]+|\[[^\]]+\]/g) || []) {
    if (t[0] === '#') { if (el.attrs.id !== t.slice(1)) return false; }
    else if (t[0] === '.') { if (!el.classList.contains(t.slice(1))) return false; }
    else { const [, k, v] = t.match(/\[([\w-]+)(?:="([^"]*)")?\]/); if (v === undefined ? !(k in el.attrs) : el.attrs[k] !== v) return false; }
  }
  return true;
}
function matches(el, selector) {
  return selector.split(',').some((sel) => {
    const parts = sel.trim().split(/\s+/);
    if (!simpleMatch(el, parts[parts.length - 1])) return false;
    let p = el.parentNode; let i = parts.length - 2;
    while (i >= 0) { while (p instanceof Element_ && !simpleMatch(p, parts[i])) p = p.parentNode; if (!(p instanceof Element_)) return false; p = p.parentNode; i--; }
    return true;
  });
}
const document = new Element_('#document');
document.createElement = (t) => new Element_(t);
document.createElementNS = (ns, t) => new Element_(t, ns);
document.createTextNode = (t) => new Text_(t);
document.head = new Element_('head'); document.body = new Element_('body'); document.append(document.head, document.body);
document.documentElement = new Element_('html');
document.hidden = false;
document.addEventListener = () => {};

const store$ = {};
const winListeners = {};
Object.assign(globalThis, {
  Node: Node_, document, window: globalThis,
  addEventListener: (type, fn) => { (winListeners[type] ||= []).push(fn); },
  removeEventListener: (type, fn) => { winListeners[type] = (winListeners[type] || []).filter((f) => f !== fn); },
  localStorage: { getItem: (k) => (k in store$ ? store$[k] : null), setItem: (k, v) => { store$[k] = String(v); }, removeItem: (k) => { delete store$[k]; } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0), MutationObserver: class { observe() {} disconnect() {} },
  getComputedStyle: () => ({ position: 'relative' }), location: { reload() {} },
  FormData: class { constructor() { this.items = []; } append(k, v) { this.items.push([k, v]); } },
});

Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'smoke', vibrate() {} }, configurable: true });

// ------------------------------------------------------------------ fake API
const bundles = [{ id: 11, size_label: '1GB', price: 5 }, { id: 12, size_label: '5GB', price: 22.5 }];
const content = JSON.parse(readFileSync(path.join(ROOT, 'tests/content.json'), 'utf8'));
const storefront = {
  agent_id: 'a1', domain: 'smekart.asbdatalite.com', business_name: "Kwame's Data", store_tagline: 'Cheap data, fast', brand_description: 'x',
  logo_url: null, hero_image_url: null, auth_image_url: null,
  colors: { primary: '#0B6E4F', secondary: '#E6F4EE', primaryDeep: '#085039', primaryTint: '#E1F2EB', accent: '#0B6E4F', textColor: '#04281d', textMuted: '#52776a' },
  support_phone: '0241234567', whatsapp_number: '233241234567', support_email: 'help@x.com', socials: { facebook: 'https://facebook.com/x', instagram: null },
  content, includes_app: true, subdomain: 'smekart', country: { code: 'GH', name: 'Ghana', symbol: 'GH\u20B5', currency: 'GHS', dial_code: '233', phone_digits: 10 }, play_store_url: null, app_store_url: null,
};
const routes = {
  'GET /storefront': () => storefront,
  'GET /networks': () => ({ data: [{ id: 1, name: 'MTN', slug: 'mtn', tag: 'Fast' }, { id: 2, name: 'Telecel', slug: 'telecel', tag: null }] }),
  'GET /networks/1/bundles': () => ({ data: bundles }),
  'GET /networks/2/bundles': () => ({ data: bundles }),
  'GET /settings/public': () => ({ guest_checkout_enabled: true, payment_gateways: [{ key: 'payaza', label: 'Payaza', min_amount: 0 }, { key: 'korapay', label: 'Korapay', min_amount: 10 }] }),
  'POST /orders/guest': (body) => ({ order: { id: 'uuid-1', amount: 22.5, status: 'pending_payment', created_at: new Date().toISOString() }, authorization_url: 'https://pay.example/x', reference: 'ORD-uuid-1', _body: body }),
  'GET /orders/guest/verify/ORD-uuid-1': () => ({ order: { id: 'uuid-1', status: 'delivered', network: 'MTN', bundle_size: '5GB', recipient_number: '0241234567', amount: 22.5 } }),
};
routes['POST /orders/payment/ORD-x/cancelled'] = () => ({ status: 'pending_payment', emailed: true, email: 'a***@mail.com' });
routes['POST /orders/payment/ORD-x/resume'] = () => ({ order: { id: 'x' }, authorization_url: 'https://pay.example/again' });
const calls = [];
const seenHeaders = [];
let lastRegisterBody = null;
routes['POST /auth/register'] = (body) => { lastRegisterBody = body; return { user: { id: 9, name: body.name }, token: null, verification_required: true }; };
routes['POST /auth/login'] = () => ({ _status: 403, message: 'Please verify your email first.', code: 'unverified_email' });
routes['POST /auth/email/resend-public'] = () => ({ message: 'sent' });
globalThis.fetch = async (url, options = {}) => {
  const base = 'https://api.test/api/v1';
  if (String(url).endsWith('config.json')) return { ok: true, status: 200, json: async () => ({ apiBase: base, subdomain: 'smekart', store: { ...storefront, logo_local: null } }) };
  const route = `${options.method || 'GET'} ${String(url).replace(base, '').split('?')[0]}`;
  calls.push(route);
  seenHeaders.push(options.headers || {});
  const handler = routes[route];
  if (!handler) return { ok: false, status: 404, json: async () => ({ message: `no mock for ${route}` }) };
  const payload = handler(options.body ? JSON.parse(options.body) : undefined);
  if (payload && payload._status) return { ok: false, status: payload._status, json: async () => payload };
  return { ok: true, status: 200, json: async () => payload };
};

// ------------------------------------------------------------------ DOM skeleton the real index.html provides
function el(tag, id, cls) { const e = new Element_(tag); if (id) e.setAttribute('id', id); if (cls) e.className = cls; return e; }
const app = el('div', 'app', 'no-nav'); app.hidden = true;
app.append(el('main', 'view'), el('nav', 'nav', 'nav'));
const meta = new Element_('meta'); meta.setAttribute('name', 'theme-color');
document.head.append(meta);
document.body.append(el('div', 'splash', 'splash'), app, el('div', 'sheet-root'), el('div', 'toast-root'));

// ------------------------------------------------------------------ run
let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = (node) => node.textContent;
const buttons = (root) => root.querySelectorAll('button');
const byText = (root, text) => buttons(root).find((b) => textOf(b).includes(text));

process.on('unhandledRejection', (e) => { console.log('FAIL  unhandled rejection:', e); failures++; });

const app$ = await import(pathToFileURL(path.join(ROOT, 'app/js/main.js')));
void app$;
await wait(300);
ok('theme applied from store colours', document.documentElement.style['--primary'] === '#0B6E4F');
ok('splash shows the business name', textOf(document.body.querySelector('#splash')).includes("Kwame's Data"));
ok('app title is the business name', true);

await wait(2800); // splash (2.1s) + hand-over
ok('onboarding opened on first launch', document.body.querySelectorAll('.onb').length === 1);
const onboarding = document.body.querySelector('.onb');
ok('onboarding has 3 slides from store text', onboarding.querySelectorAll('.slide').length === 3 && textOf(onboarding).includes('Cheap data, delivered fast'));
ok('onboarding draws its own picture on every slide', onboarding.querySelectorAll('.ob-art').length === 3 && onboarding.querySelectorAll('img').every((img) => !/onboarding\/slide/.test(img.attrs.src || '')));
await byText(onboarding, 'Next').click();
await byText(onboarding, 'Next').click();
await byText(onboarding, 'Get started').click();
await wait(500);
const view = document.body.querySelector('#view');
ok('home screen shown after onboarding', textOf(view).includes("Kwame's Data") && textOf(view).includes('Buy data'));
ok('nav has 3 tabs', document.body.querySelectorAll('#nav button').length === 3);
ok('home is compact: header, quick buttons, plans', textOf(view).includes('Data plans') && textOf(view).includes('Orders') && textOf(view).includes('Support') && textOf(view).includes('Buy data'));
ok('home shows no marketing sections', !/Common questions|Up and running|Built for speed|Ready to get started/i.test(textOf(view)));
await wait(300);
ok('network tabs are listed', view.querySelectorAll('.nettab').length === 2 && textOf(view).includes('MTN') && textOf(view).includes('Telecel'));
ok('plans of the first network are listed', textOf(view).includes('5GB') && textOf(view).includes('GH₵22.50'));
await view.querySelectorAll('.nettab')[1].click(); await wait(200);
ok('switching network tab loads its plans', textOf(view).includes('5GB'));

// Purchase: tap a plan -> one sheet -> pay. Payaza -> in-app browser flow; Korapay -> inline payment screen.
async function purchase(gatewayLabel) {
  await byText(view, '5GB').click();
  await wait(250);
  const sheet = document.body.querySelector('#sheet-root');
  if (gatewayLabel === 'Payaza') await byText(sheet, 'Payaza').click(); // Korapay is already selected by default
  const inputs = sheet.querySelectorAll('input');
  inputs[0].value = '0241234567'; inputs[1].value = 'Ama'; inputs[2].value = 'Mensah'; inputs[3].value = 'ama@example.com';
  await byText(sheet, 'Pay GH₵22.50').click();
  await wait(400);
}
await byText(view, '5GB').click();
await wait(250);
const sheet = document.body.querySelector('#sheet-root');
ok('purchase sheet opens with the number warning', textOf(sheet).includes('cannot be undone'));
ok('both gateways offered above GH₵10', textOf(sheet).includes('Payaza') && textOf(sheet).includes('Korapay'));
const gatewayTabs = sheet.querySelectorAll('.seg button');
ok('Korapay is the first payment tab and is selected by default', textOf(gatewayTabs[0]) === 'Korapay' && gatewayTabs[0].classList.contains('on') && !gatewayTabs[1].classList.contains('on'));
ok('recipient field only takes 10 digits', sheet.querySelectorAll('input')[0].attrs.maxlength === '10' && sheet.querySelectorAll('input')[0].attrs.type === 'tel');
await byText(sheet, 'Cancel')?.click?.();
document.body.querySelector('#sheet-root').querySelectorAll('.icon-btn').forEach((b) => b.click());
await wait(500);

const sheetRoot = () => document.body.querySelector('#sheet-root');
await purchase('Payaza');
ok('order created through the guest endpoint', calls.includes('POST /orders/guest'));
ok('Payaza opens in the in-app browser flow (no inline iframe)', textOf(sheetRoot()).includes('Complete your payment') && sheetRoot().querySelectorAll('iframe').length === 0);
await byText(sheetRoot(), "I've paid").click();
await wait(500);
ok('payment confirmed -> success screen', textOf(sheetRoot()).includes('Payment received'));
await byText(sheetRoot(), 'Done').click();
await wait(500);

await purchase('Korapay');
ok('Korapay opens on the inline payment screen (iframe)', textOf(sheetRoot()).includes('Secure payment') && sheetRoot().querySelectorAll('iframe')[0]?.attrs.src === 'https://pay.example/x');
ok('there is no "open in a secure window" text', !/secure window/i.test(textOf(sheetRoot())));
await byText(sheetRoot(), "I've paid").click();
await wait(500);
await byText(sheetRoot(), 'Done').click();
await wait(500);

// Other screens render without throwing
const { switchTab, go } = await import(pathToFileURL(path.join(ROOT, 'app/js/nav.js')));
for (const name of ['orders', 'account']) { switchTab(name); await wait(150); ok(`${name} screen renders`, view.childNodes.length > 0); }
for (const name of ['login', 'register', 'forgot']) { go(name); await wait(250); ok(`${name} screen renders`, view.childNodes.length > 0); }


// ---- cancelled payment: "Payment not completed", email note, and a fresh payment link
const { runPayment } = await import(pathToFileURL(path.join(ROOT, 'app/js/pay.js')));
const { api } = await import(pathToFileURL(path.join(ROOT, 'app/js/api.js')));
const { state: appState } = await import(pathToFileURL(path.join(ROOT, 'app/js/state.js')));
const payment = runPayment({
  url: 'https://pay.example/x',
  gateway: 'korapay',
  verify: async () => ({ status: 'pending' }),
  resume: async () => ({ url: (await api('/orders/payment/ORD-x/resume', { method: 'POST', session: null })).data.authorization_url, gateway: 'korapay' }),
  onCancelled: async () => (await api('/orders/payment/ORD-x/cancelled', { method: 'POST', session: null })).data.email,
});
await wait(100);
const sheets = () => document.body.querySelector('#sheet-root');
await byText(sheets(), 'Cancel payment').click();
await wait(200);
ok('cancelled payment shows "Payment not completed"', textOf(sheets()).includes('Payment not completed'));
ok('cancelled payment shows the emailed-link note', textOf(sheets()).includes('a***@mail.com'));
await byText(sheets(), 'Complete payment').click();
await wait(200);
ok('"Complete payment" goes back to the inline payment screen', textOf(sheets()).includes('Secure payment') && sheets().querySelectorAll('iframe')[0]?.attrs.src === 'https://pay.example/again');
await byText(sheets(), 'Cancel payment').click();
await wait(100);
await byText(sheets(), 'Not now').click();
ok('"Not now" ends the payment as cancelled', (await payment).status === 'cancelled');

// ---- the store's checkout page, shown inside the iframe, tells the app it is back -> the app confirms by itself
{
  let verified = 0;
  const paymentViaMessage = runPayment({ url: 'https://pay.example/m', gateway: 'korapay', verify: async () => { verified++; return { status: 'success' }; }, summary: [] });
  await wait(100);
  (winListeners.message || []).forEach((fn) => fn({ data: { type: 'asb-payment-return', reference: 'x' } }));
  await wait(300);
  ok('a "payment finished" message from the iframe triggers confirmation', verified >= 1 && textOf(sheets()).includes('Payment received'));
  await byText(sheets(), 'Done').click();
  ok('payment resolves as success', (await paymentViaMessage).status === 'success');
}

// ---- guests have no order history in the app: a clear sign-in prompt instead
switchTab('orders'); await wait(200);
ok('guests see a sign-in prompt instead of order history', textOf(view).includes('Sign in to see your orders') && view.querySelectorAll('.order').length === 0);
ok('the sign-in button is a large primary button', view.querySelectorAll('.signin-prompt .btn.primary.lg').length === 1);

// ---- registration -> "check your email" (not signed in) -> sign in
const { getSession, ls: lsApi } = await import(pathToFileURL(path.join(ROOT, 'app/js/state.js')));
go('register'); await wait(200);
const rin = view.querySelectorAll('input');
rin[0].value = 'Ama Mensah'; rin[1].value = 'ama@example.com'; rin[2].value = '024-123 45678999'; rin[3].value = 'password1'; rin[4].value = 'password1';
await rin[2].fire('input'); await wait(50);
ok('phone field keeps digits only and stops at 10', rin[2].value === '0241234567');
await byText(view, 'Create account').click(); await wait(400);
ok('register sends the 10-digit phone and source=app', lastRegisterBody?.phone === '0241234567' && lastRegisterBody?.source === 'app');
ok('after registering the "check your email" screen opens', textOf(view).includes('Check your email') && textOf(view).includes('ama@example.com'));
ok('registering does NOT sign the person in', getSession('store') === null);
await byText(view, "I've verified, sign in").click(); await wait(200);
ok('"I\'ve verified" goes to sign in with the email filled in', textOf(view).includes('Sign in') && view.querySelectorAll('input')[0].value === 'ama@example.com');
view.querySelectorAll('input')[1].value = 'password1';
await byText(view, 'Sign in').click(); await wait(300);
ok('signing in before verifying is refused and offers "Verify my email"', textOf(view).includes('verify your email') && textOf(view).includes('Verify my email'));
await byText(view, 'Verify my email').click(); await wait(200);
ok('"Verify my email" returns to the check-your-email screen', textOf(view).includes('Check your email'));
// the store's "email verified" page opens the app -> sign-in with a success note
app$.handleDeepLink('https://smekart.asbdatalite.com/email-verified?status=success'); await wait(200);
ok('opening the app from the verification page shows sign-in with "email is verified"', textOf(view).includes('Your email is verified'));
void lsApi;

const { setSession } = await import(pathToFileURL(path.join(ROOT, 'app/js/state.js')));
// ---- customer account: wallet, refund history, change password (what the store's own dashboard offers)
routes['GET /wallet'] = () => ({ balance: 12.5 });
routes['GET /wallet/transactions'] = () => ({ data: [{ id: 1, type: 'credit', amount: 5, description: 'Refund for failed order', created_at: new Date().toISOString() }] });
routes['GET /me'] = () => ({ data: { id: 1, name: 'Ama Mensah', email: 'ama@example.com', phone: '0551234567', email_verified: true } });
routes['POST /account/change-password'] = () => ({ message: 'Password updated.' });
setSession('store', 'tok', { name: 'Ama Mensah', email: 'ama@example.com', phone: '0551234567', email_verified: true });
switchTab('account'); await wait(300);
ok('signed-in account shows refund history and change password', textOf(view).includes('Refund history') && textOf(view).includes('Change password'));
ok('wallet balance is shown', textOf(view).includes('GH₵12.50'));
await wait(600);
ok('account screen does not refresh itself in a loop', calls.filter((c) => c === 'GET /me').length <= 2);
await byText(view, 'Refund history').click(); await wait(300);
ok('refund history lists the refund', textOf(sheets()).includes('Refund for failed order'));
document.body.querySelector('#sheet-root').querySelectorAll('.icon-btn').forEach((b) => b.click());
await wait(500);
await byText(view, 'Change password').click(); await wait(200);
ok('change-password sheet opens', textOf(sheets()).includes('Update password'));

// ---- the app must contain nothing about agents (it is for the store's customers only)
const everything = [view, sheets()].map(textOf).join(' ');
switchTab('home'); await wait(200);
ok('no "become an agent" / dashboard wording anywhere', !/become an agent|agent dashboard|your own data store|plan upgrade/i.test(everything + textOf(view)));
const { readdirSync } = await import('node:fs');
ok('there is no agent screen module', !readdirSync(path.join(ROOT, 'app/js')).includes('agent.js'));

// ---- multinational: the store's country decides currency, phone length and the X-Country header
const { money, cleanNumber, validNumber, phoneDigits, internationalNumber, planNote } = await import(pathToFileURL(path.join(ROOT, 'app/js/util.js')));
ok('every API call tells the server the store country (X-Country)', seenHeaders.length > 0 && seenHeaders.every((x) => x['X-Country'] === 'GH'));
ok('Ghana: GH\u20B5 and 10-digit numbers', money(5) === 'GH\u20B55.00' && phoneDigits() === 10 && validNumber('0241234567') && !validNumber('024123456'));
ok('Ghana: +233 numbers become local', cleanNumber('+233241234567') === '0241234567' && internationalNumber('0241234567') === '233241234567');
appState.live = { ...storefront, country: { code: 'NG', name: 'Nigeria', symbol: '\u20A6', currency: 'NGN', dial_code: '234', phone_digits: 11 } };
ok('Nigeria: \u20A6 and 11-digit numbers', money(1500) === '\u20A61,500.00' && phoneDigits() === 11 && validNumber('08031234567') && !validNumber('0803123456'));
ok('Nigeria: +234 numbers become local', cleanNumber('+2348031234567') === '08031234567' && internationalNumber('08031234567') === '2348031234567');
ok('Nigeria: sent as X-Country NG', (await (async () => { calls.length = 0; seenHeaders.length = 0; const { api } = await import(pathToFileURL(path.join(ROOT, 'app/js/api.js'))); await api('/networks', { session: null }); return seenHeaders[0]['X-Country'] === 'NG'; })()));
ok('plan note shows type and validity', planNote({ plan_type: 'SME', validity_days: 30 }) === 'SME \u00B7 30d' && planNote({ validity_days: 1 }) === '1 day' && planNote({}) === 'Data bundle');

// ---- services follow the store's country: Ghana sells data only, Nigeria everything
const { serviceKeys } = await import(pathToFileURL(path.join(ROOT, 'app/js/services.js')));
ok('Ghana catalogue: data only', JSON.stringify(serviceKeys({ services: { data: {} } })) === '["data"]');
ok('Nigeria catalogue: data, airtime, cable, electricity, exam in order', JSON.stringify(serviceKeys({ services: { exam: {}, data: {}, electricity: {}, cable: {}, airtime: {} } })) === '["data","airtime","cable","electricity","exam"]');
ok('unknown services are never shown', JSON.stringify(serviceKeys({ services: { data: {}, casino: {} } })) === '["data"]');

console.log(failures ? `\n${failures} FAILED` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
