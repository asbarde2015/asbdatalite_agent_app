// The three welcome slides shown the first time the app opens.
//
// Words come from the agent's Store Settings (hero / services / call-to-action text). The pictures are drawn
// in the app itself (shapes + icons in the store's own colour), so every store gets a matching, crisp
// welcome with no image files to maintain, and nothing is stretched or cropped on any phone.

import { h, icon } from './util.js';
import { ls, store, country } from './state.js';
import { logoTile } from './ui.js';

export function slidesFromStore() {
  const s = store();
  const c = s.content || {};
  return [
    { art: 'plans', title: c.hero?.h1 || `Welcome to ${s.business_name}`, text: c.hero?.p || s.store_tagline || s.brand_description || 'Buy data in seconds, any time of day.' },
    { art: 'fast', title: c.services?.h2 || 'Delivered in seconds', text: c.services?.p || c.services?.items?.[0]?.text || 'Pay and your data arrives straight away, day or night.' },
    { art: 'pay', title: c.cta?.h2 || 'Ready to get started?', text: c.cta?.p || 'Pick a plan, pay securely and you are done.' },
  ];
}

// ---------------------------------------------------------------- the three drawings
const chip = (text, cls, style) => h('span', { class: `ob-chip ${cls || ''}`, style }, text);

function artPlans() {
  const sym = country().symbol;
  const card = (net, size, price, cls) => h('div', { class: `ob-plan ${cls}` }, h('small', {}, net), h('b', {}, size), h('i', {}, `${sym}${price}`));
  return h('div', { class: 'ob-art ob-plans' },
    h('div', { class: 'ob-phone' },
      h('div', { class: 'ob-notch' }),
      h('div', { class: 'ob-screen' },
        h('div', { class: 'ob-bar' }, h('i'), h('i'), h('i')),
        h('div', { class: 'ob-grid' }, card('MTN', '1GB', '5', 'a'), card('TELECEL', '2GB', '9', 'b'), card('AIRTEL', '5GB', '22', 'c'), card('GLO', '10GB', '44', 'd')))),
    chip('1GB', 'f1'), chip('Instant', 'f2'), chip('24/7', 'f3'));
}

function artFast() {
  return h('div', { class: 'ob-art ob-fast' },
    h('span', { class: 'ring r1' }), h('span', { class: 'ring r2' }), h('span', { class: 'ring r3' }),
    h('div', { class: 'ob-bolt' }, icon('bolt', 64)),
    h('div', { class: 'ob-note n1' }, h('span', { class: 'ok' }, icon('check', 16)), h('div', {}, h('b', {}, 'Payment received'), h('small', {}, 'Just now'))),
    h('div', { class: 'ob-note n2' }, h('span', { class: 'ok' }, icon('check', 16)), h('div', {}, h('b', {}, 'Data delivered'), h('small', {}, 'In seconds'))));
}

function artPay() {
  return h('div', { class: 'ob-art ob-pay' },
    h('div', { class: 'ob-card c1' }, h('div', { class: 'chipy' }), h('b', {}, '•••• •••• •••• 4242'), h('small', {}, 'Card')),
    h('div', { class: 'ob-card c2' }, h('span', { class: 'momo' }, icon('phone', 22)), h('b', {}, 'Mobile money'), h('small', {}, 'Approve on your phone')),
    h('div', { class: 'ob-shield' }, icon('shield', 34), h('span', {}, icon('check', 16))),
    chip('Secure', 'f1'), chip('Easy', 'f2'));
}

const ARTS = { plans: artPlans, fast: artFast, pay: artPay };

// ---------------------------------------------------------------- the screen
export function showOnboarding(onDone) {
  const slides = slidesFromStore();
  const s = store();
  let index = 0;
  let startX = null;
  let dragged = 0;

  const track = h('div', { class: 'track' }, slides.map((slide, i) => h('section', { class: `slide${i === 0 ? ' on' : ''}` },
    h('div', { class: 'ob-stage' }, ARTS[slide.art]()),
    h('div', { class: 'ob-copy' }, h('h2', {}, slide.title), h('p', {}, slide.text)))));
  const dots = h('div', { class: 'dots' }, slides.map((_, i) => h('i', { class: i === 0 ? 'on' : '' })));
  const next = h('button', { class: 'btn primary lg ob-next', onclick: () => (index === slides.length - 1 ? finish() : go(index + 1)) }, 'Next');
  const skip = h('button', { class: 'ob-skip', onclick: finish }, 'Skip');
  const brand = h('div', { class: 'ob-brand' }, logoTile('ob-logo'), h('b', {}, s.business_name || ''));
  const root = h('div', { class: 'onb' }, brand, skip, track, h('div', { class: 'bottom' }, dots, next));

  function go(i) {
    index = Math.max(0, Math.min(slides.length - 1, i));
    track.style.transform = `translateX(${-index * 100}%)`;
    [...track.children].forEach((el, n) => el.classList.toggle('on', n === index));
    [...dots.children].forEach((el, n) => el.classList.toggle('on', n === index));
    const last = index === slides.length - 1;
    next.replaceChildren(last ? 'Get started' : 'Next', icon('right', 20));
    skip.style.visibility = last ? 'hidden' : 'visible';
  }

  function finish() {
    ls.set('onboarded', true);
    root.style.transition = 'opacity .35s ease, transform .35s ease';
    root.style.opacity = '0';
    root.style.transform = 'scale(1.03)';
    setTimeout(() => { root.remove(); onDone(); }, 360);
  }

  // Swipe between slides.
  track.addEventListener('pointerdown', (e) => { startX = e.clientX; dragged = 0; track.style.transition = 'none'; track.setPointerCapture?.(e.pointerId); });
  track.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    dragged = e.clientX - startX;
    const base = -index * track.clientWidth;
    track.style.transform = `translateX(${base + dragged}px)`;
  });
  const release = () => {
    if (startX === null) return;
    startX = null;
    track.style.transition = '';
    if (dragged < -60) go(index + 1);
    else if (dragged > 60) go(index - 1);
    else go(index);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  document.body.append(root);
  go(0);
  return root;
}
