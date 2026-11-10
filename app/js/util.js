// Small helpers shared by every screen. No framework: screens build real DOM with h() and never
// put store/customer text through innerHTML, so nothing an agent or customer types can inject markup.

import { country } from './state.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('div', { class: 'card', onclick: fn }, 'text', childNode, [more children]) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ---- Icons (24x24 outline set) ----
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 8a3 3 0 0 1 0 6M21 20a5 5 0 0 0-4-4.9',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  chat: 'M4 5h16v11H9l-5 4z',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  down: 'M6 9l6 6 6-6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z',
  store: 'M4 9l1-5h14l1 5M4 9a3 3 0 0 0 5.3 2 3 3 0 0 0 5.4 0A3 3 0 0 0 20 9M5 12v8h14v-8',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  plus: 'M12 5v14M5 12h14',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7C9 7 8 4 10 4s2 3 2 3zM12 7c3 0 4-3 2-3s-2 3-2 3z',
};

export function icon(name, size = 22) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(path);
  return svg;
}

// Cycle of icons for content blocks that have no icon of their own (features, services...).
const CYCLE = ['bolt', 'shield', 'wifi', 'gift', 'clock', 'star', 'wallet', 'globe'];
export const cycleIcon = (i, size) => icon(CYCLE[i % CYCLE.length], size);

// ---- Formatting ----
export const money = (n) => `${country().symbol}${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** How many digits a phone number has in the store's country (Ghana 10, Nigeria 11, ...), and the example shown to people. */
export const phoneDigits = () => country().phone_digits;
export const phoneExample = () => ({ GH: '0241234567', NG: '08031234567', NE: '90123456' }[country().code] || '0'.repeat(phoneDigits()));

/** Local phone numbers, digits only. A pasted international number (+233241234567) is converted to the local form. */
export function cleanNumber(value) {
  const { dial_code: dial, phone_digits: len } = country();
  let digits = String(value || '').replace(/[^\d]/g, '');
  if (digits.startsWith(dial) && digits.length >= len - 1 + dial.length) digits = `0${digits.slice(dial.length)}`;
  return digits.slice(0, len);
}
export const validNumber = (value) => cleanNumber(value).length === phoneDigits();

/** The international form WhatsApp links need (0241234567 -> 233241234567). */
export function internationalNumber(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  const { dial_code: dial, phone_digits: len } = country();
  return digits.length === len && digits.startsWith('0') ? `${dial}${digits.slice(1)}` : digits;
}

export function statusInfo(status) {
  switch (status) {
    case 'delivered': return { cls: 'ok', label: 'Delivered' };
    case 'processing': return { cls: 'wait', label: 'Delivering' };
    case 'paid': return { cls: 'wait', label: 'Paid' };
    case 'pending_payment': return { cls: 'wait', label: 'Awaiting payment' };
    case 'failed': return { cls: 'bad', label: 'Failed' };
    case 'refunded': return { cls: 'bad', label: 'Refunded' };
    default: return { cls: 'wait', label: String(status || '').replace(/_/g, ' ') };
  }
}

export function vibrate(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* not available */ }
}

// ---- Ripple (Material touch feedback) on anything with .btn, .icon-btn, .ripple ----
export function initRipple() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest?.('.btn, .icon-btn, .ripple, .bundle, .netcard, .order, .plan, .contact-row, .nav button');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const dot = h('span', { class: 'ripple-dot', style: { width: `${size}px`, height: `${size}px`, left: `${event.clientX - rect.left - size / 2}px`, top: `${event.clientY - rect.top - size / 2}px` } });
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.style.overflow = target.style.overflow || 'hidden';
    target.append(dot);
    setTimeout(() => dot.remove(), 650);
  }, { passive: true });
}

export function confetti(colors) {
  const layer = h('div', { class: 'confetti' });
  for (let i = 0; i < 42; i++) {
    layer.append(h('i', {
      style: {
        left: `${Math.random() * 100}%`,
        background: colors[i % colors.length],
        animationDuration: `${1.8 + Math.random() * 1.6}s`,
        animationDelay: `${Math.random() * 0.5}s`,
        transform: `rotate(${Math.random() * 360}deg)`,
      },
    }));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4200);
}


/** Which network a name is. Ghana: MTN, Telecel, AirtelTigo. Nigeria: MTN, Airtel, Glo, 9mobile. Anything else uses the store's colour. */
function networkKey(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('mtn')) return 'mtn';
  if (n.includes('telecel') || n.includes('vodafone')) return 'telecel';
  if (n.includes('tigo') || n === 'at') return 'airteltigo';
  if (n.includes('airtel')) return 'airtel';
  if (n.includes('glo')) return 'glo';
  if (n.includes('9mobile') || n.includes('etisalat')) return '9mobile';
  return 'other';
}

/** Brand colour of a network for its tab/chip. */
export function networkColor(name) {
  switch (networkKey(name)) {
    case 'mtn': return { bg: '#FFCC00', fg: '#2b2300' };
    case 'telecel': return { bg: '#E60000', fg: '#ffffff' };
    case 'airteltigo': return { bg: '#0B4FA8', fg: '#ffffff' };
    case 'airtel': return { bg: '#E4002B', fg: '#ffffff' };
    case 'glo': return { bg: '#00A651', fg: '#ffffff' };
    case '9mobile': return { bg: '#0E6B3A', fg: '#ffffff' };
    default: return { bg: 'var(--primary)', fg: 'var(--on-primary)' };
  }
}

/** Brand look of each network's plan cards. */
export function networkTheme(name) {
  const key = networkKey(name);
  const light = { deco: 'rgba(255, 255, 255, .14)', chip: 'rgba(255, 255, 255, .18)', ink: '#ffffff' };
  switch (key) {
    case 'mtn': return { key, c1: '#FFD21F', c2: '#FFB300', ink: '#1b1500', pillBg: '#1b1500', pillFg: '#FFD21F', deco: 'rgba(27, 21, 0, .07)', chip: 'rgba(27, 21, 0, .10)' };
    case 'telecel': return { key, c1: '#F0141E', c2: '#B00010', pillBg: '#ffffff', pillFg: '#C60012', ...light };
    case 'airteltigo': return { key, c1: '#1556C5', c2: '#0A2E7A', pillBg: '#E4002B', pillFg: '#ffffff', ...light, deco: 'rgba(255, 255, 255, .12)' };
    case 'airtel': return { key, c1: '#F0102F', c2: '#B8001E', pillBg: '#ffffff', pillFg: '#C8001F', ...light };
    case 'glo': return { key, c1: '#14B866', c2: '#007A3D', pillBg: '#ffffff', pillFg: '#007A3D', ...light };
    case '9mobile': return { key, c1: '#12894B', c2: '#06512C', pillBg: '#C6F432', pillFg: '#06512C', ...light };
    default: return { key: 'other', c1: 'var(--primary)', c2: 'var(--primary-deep)', ink: 'var(--on-primary)', pillBg: '#ffffff', pillFg: 'var(--primary-deep)', deco: 'rgba(255, 255, 255, .14)', chip: 'rgba(255, 255, 255, .18)' };
  }
}

export function applyNetworkTheme(el, theme) {
  el.style.setProperty('--c1', theme.c1);
  el.style.setProperty('--c2', theme.c2);
  el.style.setProperty('--ink', theme.ink);
  el.style.setProperty('--pill-bg', theme.pillBg);
  el.style.setProperty('--pill-fg', theme.pillFg);
  el.style.setProperty('--deco', theme.deco);
  el.style.setProperty('--chip', theme.chip);
}

/** The small line under a plan's size: its type when it has one (SME, Gifting...), else how long it lasts. */
export function planNote(bundle) {
  const days = Number(bundle.validity_days) || 0;
  const type = String(bundle.plan_type || '').trim();
  if (type && days) return `${type} \u00B7 ${days}d`;
  if (type) return type;
  return days ? `${days} day${days === 1 ? '' : 's'}` : 'Data bundle';
}
