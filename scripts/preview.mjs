// See the app in your browser, inside a phone-shaped frame. No Android phone, no build, no installs.
//
//   node scripts/preview.mjs                  demo store with demo plans (works offline)
//   node scripts/preview.mjs --store smekart  a real store: its colours, name, logo and plans, read live
//   node scripts/preview.mjs --country NG     demo store for Nigeria (₦, 11-digit numbers, MTN/Airtel/Glo/9mobile)
//
// then open  http://localhost:8080
//
// Options: --port 8080   --api https://api.asbdatalite.com/api/v1   --color #0B6E4F (demo store colour)
//
// Needs only Node 18+. Nothing is written to disk. In demo mode the payment page is a pretend one, so you
// can click through a whole purchase and see the success screen. With --store, real data is shown but any
// payment you start is REAL: use the demo mode to try the flow safely.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const PORT = Number(opt('port', 8080));
const STORE = opt('store', '').toLowerCase().replace(/[^a-z0-9]/g, '');
const API = opt('api', 'https://api.asbdatalite.com/api/v1').replace(/\/+$/, '');
const COUNTRY = String(opt('country', 'GH')).toUpperCase() === 'NG' ? 'NG' : 'GH';
const COUNTRIES = {
  GH: { code: 'GH', name: 'Ghana', symbol: 'GH\u20B5', currency: 'GHS', dial_code: '233', phone_digits: 10 },
  NG: { code: 'NG', name: 'Nigeria', symbol: '\u20A6', currency: 'NGN', dial_code: '234', phone_digits: 11 },
};
const COLOR = /^#[0-9a-f]{6}$/i.test(opt('color', '')) ? opt('color') : '#0B6E4F';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// ------------------------------------------------------------------ demo data
function shade(hex, amount) {
  const n = hex.slice(1).match(/../g).map((x) => Math.max(0, Math.min(255, Math.round(parseInt(x, 16) * (1 + amount)))));
  return `#${n.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
const demoContent = {
  hero: { h1: 'Cheap data, delivered fast.', p: 'Buy MTN, Telecel and AirtelTigo data in seconds, any time of day.' },
  services: { h2: 'Why buy your data here', p: 'Instant delivery, fair prices and friendly support.', items: [] },
  cta: { h2: 'Ready to get started?', p: 'Pick a plan and pay with Mobile Money or card.' },
};
const demoStore = () => ({
  business_name: 'Demo Data Store', store_tagline: 'Cheap data, fast delivery', brand_description: '', subdomain: 'demo', domain: 'demo.asbdatalite.com', country: COUNTRIES[COUNTRY],
  logo_url: null, hero_image_url: null, auth_image_url: null,
  colors: { primary: COLOR, secondary: '#eef6f2', primaryDeep: shade(COLOR, -0.28), primaryTint: '#e7f3ee', accent: COLOR, textColor: '#10231b', textMuted: '#5a7568' },
  support_phone: '0241234567', whatsapp_number: '233241234567', support_email: 'help@demo.example', socials: {}, content: demoContent, includes_app: true,
});
const NETWORKS = COUNTRY === 'NG'
  ? [{ id: 1, name: 'MTN', slug: 'mtn' }, { id: 2, name: 'Airtel', slug: 'airtel' }, { id: 3, name: 'Glo', slug: 'glo' }, { id: 4, name: '9mobile', slug: '9mobile' }]
  : [{ id: 1, name: 'MTN', slug: 'mtn', tag: null }, { id: 2, name: 'Telecel', slug: 'telecel', tag: null }, { id: 3, name: 'AirtelTigo', slug: 'airteltigo', tag: null }];
const SIZES = [['1GB', 5.5], ['2GB', 10], ['3GB', 15], ['5GB', 24], ['10GB', 46], ['15GB', 68], ['20GB', 89], ['30GB', 128], ['50GB', 205]];
const bundlesFor = (id) => SIZES.map(([size_label, price], i) => (COUNTRY === 'NG'
  ? { id: id * 100 + i, network: NETWORKS.find((n) => n.id === id)?.name, size_label, plan_type: i % 2 ? 'Gifting' : 'SME', validity_days: 30, price: Math.round(price * 220) }
  : { id: id * 100 + i, network: NETWORKS.find((n) => n.id === id)?.name, size_label, price: price + (id - 1) * 0.5 }));
const demoOrders = new Map(); // reference -> order
let demoWallet = 12.5; // the demo customer's wallet (add money, pay from it)
const demoPaid = new Set(); // references paid on the demo payment page
const demoFunds = new Map(); // FUND-... reference -> amount
const demoUser = { id: 1, name: 'Ama Mensah', email: 'ama@example.com', phone: COUNTRY === 'NG' ? '08031234567' : '0551234567', email_verified: true };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

/** What the store's country sells: Nigeria everything, Ghana data only (mirrors config/countries.php). */
function demoServices() {
  const info = COUNTRIES[COUNTRY];
  if (COUNTRY !== 'NG') return { country: { ...info, services: ['data'] }, services: { data: { networks: [] } } };
  return {
    country: { ...info, services: ['data', 'airtime', 'cable', 'electricity', 'exam'] },
    services: {
      data: { networks: [] },
      airtime: { price_factor: 0.98, min_amount: 50, types: [{ key: 'VTU', min_amount: 50 }, { key: 'Share and Sell', min_amount: 100 }], networks: NETWORKS.map((n) => ({ id: n.id, name: n.name })) },
      cable: { providers: [{ name: 'DStv', packages: [{ id: 11, name: 'Padi', price: 4400 }, { id: 12, name: 'Compact', price: 15700 }] }, { name: 'GOtv', packages: [{ id: 21, name: 'Smallie', price: 1900 }] }] },
      electricity: { price_factor: 1, min_amount: 500, meter_types: ['Prepaid', 'Postpaid'], companies: [{ id: 31, name: 'Ikeja Electric' }, { id: 32, name: 'Eko Electric' }] },
      exam: { max_quantity: 10, exams: [{ id: 41, name: 'WAEC Result Checker', price: 3500 }, { id: 42, name: 'NECO Token', price: 1300 }] },
    },
  };
}

async function demoApi(req, res, url, bodyText) {
  const p = url.pathname.replace('/api/v1', '');
  const body = bodyText ? JSON.parse(bodyText) : {};
  const m = req.method;
  const origin = `http://localhost:${PORT}`;

  if (p === '/storefront') return send(res, 200, demoStore());
  if (p === '/networks') return send(res, 200, { data: NETWORKS });
  let hit = p.match(/^\/networks\/(\d+)\/bundles$/);
  if (hit) return send(res, 200, { data: bundlesFor(Number(hit[1])) });
  if (p === '/services') return send(res, 200, demoServices());
  if (p === '/services/verify/smartcard' || p === '/services/verify/meter') return send(res, 200, { valid: true, name: 'ADA OKAFOR' });
  if (m === 'POST' && (p === '/service-orders' || p === '/service-orders/guest')) {
    const id = `demo-${Date.now()}`;
    const face = Number(body.amount) || 0;
    const price = body.service === 'airtime' || body.service === 'electricity' ? face : 7500 * (Number(body.quantity) || 1);
    const labels = { airtime: `Airtime ${COUNTRIES[COUNTRY].symbol}${face}`, cable: 'DStv Compact', electricity: 'Ikeja Electric Prepaid', exam: `WAEC x${body.quantity || 1}` };
    const order = { id, service: body.service, item: labels[body.service], recipient_number: body.recipient_number, amount: price, status: 'pending_payment', created_at: new Date().toISOString(), delivered_at: null };
    demoOrders.set(`ORD-${id}`, order);
    return send(res, 201, { order, authorization_url: `${origin}/demo-pay?ref=ORD-${id}`, reference: `ORD-${id}` });
  }
  if (p === '/settings/public') return send(res, 200, { guest_checkout_enabled: true, payment_gateways: [{ key: 'payaza', label: 'Payaza', min_amount: 0 }, { key: 'korapay', label: 'Korapay', min_amount: 10 }] });

  if (m === 'POST' && p === '/wallet/fund') {
    const reference = `FUND-${Date.now()}`;
    demoFunds.set(reference, Number(body.amount) || 0);
    return send(res, 200, { authorization_url: `${origin}/demo-pay?ref=${reference}`, reference, gateway: body.gateway || 'payaza' });
  }
  hit = p.match(/^\/payments\/confirm\/(.+)$/);
  if (hit) {
    const ref = decodeURIComponent(hit[1]);
    if (demoFunds.has(ref) && demoPaid.has(ref)) { demoWallet += demoFunds.get(ref); demoFunds.delete(ref); }
    return send(res, 200, { status: demoPaid.has(ref) ? 'success' : 'pending' });
  }
  if (m === 'POST' && (p === '/orders/guest' || p === '/orders')) {
    const bundle = NETWORKS.flatMap((n) => bundlesFor(n.id)).find((b) => b.id === body.data_bundle_id) || bundlesFor(1)[0];
    const id = `demo-${Date.now()}`;
    if (body.payment_method === 'wallet') {
      if (demoWallet < bundle.price) return send(res, 422, { message: "Insufficient wallet balance. Choose 'Pay by Card or Mobile Money' instead.", code: 'insufficient_wallet_balance' });
      demoWallet -= bundle.price;
      const paid = { id, network: bundle.network, bundle_size: bundle.size_label, recipient_number: body.recipient_number, amount: bundle.price, status: 'delivered', payment_method: 'wallet', created_at: new Date().toISOString(), delivered_at: new Date().toISOString() };
      demoOrders.set(`ORD-${id}`, paid);
      return send(res, 201, { order: paid, authorization_url: null });
    }
    const order = { id, network: bundle.network, bundle_size: bundle.size_label, recipient_number: body.recipient_number, amount: bundle.price, status: 'pending_payment', created_at: new Date().toISOString(), delivered_at: null };
    demoOrders.set(`ORD-${id}`, order);
    return send(res, 201, { order, authorization_url: `${origin}/demo-pay?ref=ORD-${id}`, reference: `ORD-${id}` });
  }
  hit = p.match(/^\/orders\/guest\/verify\/(.+)$/);
  if (hit) { const order = demoOrders.get(decodeURIComponent(hit[1])); return order ? send(res, 200, { order }) : send(res, 404, { message: 'Order not found.' }); }
  hit = p.match(/^\/orders\/payment\/(.+)\/(cancelled|resume)$/);
  if (hit) {
    const ref = decodeURIComponent(hit[1]);
    return hit[2] === 'cancelled'
      ? send(res, 200, { status: 'pending_payment', emailed: true, email: 'a***@example.com' })
      : send(res, 200, { order: demoOrders.get(ref) || {}, authorization_url: `${origin}/demo-pay?ref=${encodeURIComponent(ref)}` });
  }
  hit = p.match(/^\/demo\/paid\/(.+)$/);
  if (hit) { const order = demoOrders.get(decodeURIComponent(hit[1])); demoPaid.add(decodeURIComponent(hit[1])); if (order) { order.status = 'delivered'; order.delivered_at = new Date().toISOString(); } return send(res, 200, { ok: true }); }

  if (m === 'GET' && p === '/orders') return send(res, 200, { data: [...demoOrders.values()].reverse() });
  if (p === '/auth/login' || p === '/auth/register') return send(res, 200, { token: 'demo-token', user: { ...demoUser, name: body.name || demoUser.name } });
  if (p === '/auth/logout' || p === '/auth/email/resend' || p === '/auth/email/resend-public' || p === '/auth/password/forgot') return send(res, 200, { message: 'OK' });
  if (p === '/me') return send(res, 200, { data: demoUser });
  if (p === '/wallet') return send(res, 200, { balance: demoWallet, symbol: COUNTRIES[COUNTRY].symbol, topup_min: COUNTRY === 'NG' ? 100 : 5, topup_max: COUNTRY === 'NG' ? 500000 : 5000 });
  if (p === '/wallet/transactions') return send(res, 200, { data: [{ id: 1, type: 'credit', amount: 5, description: 'Refund for a failed order', created_at: new Date().toISOString() }] });
  if (p === '/account/change-password') return send(res, 200, { message: 'Password updated.' });
  return send(res, 404, { message: `Demo: nothing for ${m} ${p}` });
}

// A pretend gateway page, shown inside the app's payment screen in demo mode.
const demoPayPage = (ref) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:14px;background:#f6f7fb;color:#222;text-align:center;padding:24px">
<div style="font-size:42px">\u{1F4B3}</div><h2 style="margin:0">Demo payment page</h2><p style="margin:0;color:#667">This stands in for Payaza / Korapay. No real money is used.</p>
<button id="pay" style="font-size:16px;font-weight:700;padding:14px 28px;border:0;border-radius:12px;background:#12a150;color:#fff">Complete demo payment</button>
<script>document.getElementById('pay').onclick=async()=>{await fetch('/api/v1/demo/paid/${encodeURIComponent(ref)}');document.body.innerHTML='<h3 style="font-family:sans-serif">Confirming your payment…</h3>';parent.postMessage({type:'asb-payment-return',reference:${JSON.stringify(ref)}},'*')}</script>`;

// ------------------------------------------------------------------ phone frame page
const framePage = () => `<!doctype html><meta charset="utf-8"><title>App preview</title>
<style>
  body{margin:0;background:#1d2030;color:#e8eaf6;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center}
  .bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;padding:14px}
  button,select{font:inherit;padding:8px 14px;border-radius:10px;border:0;background:#33385a;color:#fff;cursor:pointer}
  .stage{flex:1;display:grid;place-items:start center;padding:6px 0 30px}
  .phone{background:#0b0c14;border-radius:46px;padding:12px;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 0 0 2px #2b2f4a;transform-origin:top center}
  iframe{display:block;border:0;border-radius:36px;background:#fff}
  small{opacity:.7}
</style>
<div class="bar">
  <button onclick="restart()">Restart (splash + onboarding)</button>
  <button onclick="document.getElementById('f').contentWindow.location.reload()">Reload</button>
  <select id="size" onchange="resize()"><option value="390x844">iPhone 14 (390 x 844)</option><option value="412x915">Pixel 7 (412 x 915)</option><option value="360x740">Small phone (360 x 740)</option></select>
  <small>${STORE ? `Live store: ${STORE} (real data)` : 'Demo store (no real data)'}</small>
</div>
<div class="stage"><div class="phone" id="phone"><iframe id="f" src="/app/index.html"></iframe></div></div>
<script>
  function resize(){const [w,h]=document.getElementById('size').value.split('x').map(Number);const f=document.getElementById('f');f.width=w;f.height=h;
    const scale=Math.min(1,(window.innerHeight-110)/(h+24));document.getElementById('phone').style.transform='scale('+scale+')';document.getElementById('phone').style.marginBottom=(-(1-scale)*(h+24))+'px'}
  function restart(){const f=document.getElementById('f');try{f.contentWindow.localStorage.clear()}catch(e){}f.contentWindow.location.reload()}
  window.addEventListener('resize',resize);resize();
</script>`;

// ------------------------------------------------------------------ live-store mode
let liveConfig = null;
async function buildConfig() {
  if (!STORE) return { apiBase: `http://localhost:${PORT}/api/v1`, subdomain: 'demo', builtAt: new Date().toISOString(), paymentInline: true, store: demoStore() };
  if (!liveConfig) {
    const res = await fetch(`${API}/storefront?domain=${encodeURIComponent(STORE)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`The API answered ${res.status} for store "${STORE}". Is it approved and live?`);
    const store = await res.json();
    liveConfig = { apiBase: `http://localhost:${PORT}/api/v1`, subdomain: STORE, builtAt: new Date().toISOString(), paymentInline: true, store: { ...store, domain: store.domain || `${STORE}.asbdatalite.com`, logo_local: null, hero_local: null, auth_local: null } };
  }
  return liveConfig;
}

// ------------------------------------------------------------------ server
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuffer = Buffer.concat(chunks);

    if (url.pathname === '/') return send(res, 200, framePage(), TYPES['.html']);
    if (url.pathname === '/demo-pay') return send(res, 200, demoPayPage(url.searchParams.get('ref') || ''), TYPES['.html']);
    if (url.pathname === '/app/config.json') return send(res, 200, await buildConfig());

    if (url.pathname.startsWith('/api/v1/')) {
      if (!STORE) return demoApi(req, res, url, bodyBuffer.toString());
      // Live store: forward to the real API (same origin for the page, so no CORS trouble).
      const upstream = await fetch(`${API}${url.pathname.slice('/api/v1'.length)}${url.search}`, {
        method: req.method,
        headers: { Accept: 'application/json', ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}), ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer,
      });
      return send(res, upstream.status, Buffer.from(await upstream.arrayBuffer()), upstream.headers.get('content-type') || 'application/json');
    }

    if (url.pathname.startsWith('/app/')) {
      const file = path.normalize(path.join(ROOT, 'app', url.pathname.slice('/app/'.length)));
      if (!file.startsWith(path.join(ROOT, 'app'))) return send(res, 403, 'Forbidden', 'text/plain');
      try {
        return send(res, 200, await readFile(file), TYPES[path.extname(file)] || 'application/octet-stream');
      } catch { return send(res, 404, 'Not found', 'text/plain'); }
    }
    return send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    return send(res, 502, { message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\nApp preview is running.\n\n  Open:  http://localhost:${PORT}\n  Mode:  ${STORE ? `live store "${STORE}" (real data; payments would be real)` : 'demo store (safe, no real data)'}\n\nPress Ctrl+C to stop.\n`);
});
