// Reusable UI pieces: toasts, bottom sheets (with Android back-button support), form fields,
// the animated segmented control, buttons with a loading state, and store images.

import { $, h, icon, initials, vibrate } from './util.js';
import { imageSources, store } from './state.js';

// ---------- Toast ----------
export function toast(message, kind = '') {
  const root = $('#toast-root');
  const el = h('div', { class: `toast ${kind}` }, message);
  root.append(el);
  if (kind === 'bad') vibrate(30);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, kind === 'bad' ? 4200 : 2800);
}

// ---------- Bottom sheet ----------
const sheets = [];

export function openSheet({ title, content, full = false, locked = false, onClose } = {}) {
  const root = $('#sheet-root');
  const backdrop = h('div', { class: 'backdrop' });
  const body = h('div', { class: 'sheet-body' }, content);
  const closeButton = h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => controller.close() }, icon('x'));
  const sheet = h(
    'div',
    { class: `sheet${full ? ' full' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'grabber' }),
    title || !locked ? h('div', { class: 'sheet-head' }, h('h3', {}, title || ''), locked ? null : closeButton) : null,
    body,
  );
  root.append(backdrop, sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => { backdrop.classList.add('open'); sheet.classList.add('open'); }));

  const controller = {
    el: sheet,
    body,
    locked,
    close() {
      const index = sheets.indexOf(controller);
      if (index === -1) return;
      sheets.splice(index, 1);
      backdrop.classList.remove('open');
      sheet.classList.remove('open');
      setTimeout(() => { backdrop.remove(); sheet.remove(); }, 430);
      onClose?.();
    },
    setContent(...nodes) {
      while (body.firstChild) body.removeChild(body.firstChild);
      body.append(...nodes.flat().filter(Boolean));
    },
  };
  backdrop.addEventListener('click', () => { if (!controller.locked) controller.close(); });
  sheets.push(controller);
  return controller;
}

/** Android back button: closes the top sheet. Returns true if there was one to close. */
export function closeTopSheet() {
  const top = sheets[sheets.length - 1];
  if (!top) return false;
  if (!top.locked) top.close();
  return true;
}
export const hasSheet = () => sheets.length > 0;

export function confirmSheet({ title, message, confirmText = 'Yes', cancelText = 'Cancel' }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => { if (answered) return; answered = true; sheet.close(); resolve(value); };
    const sheet = openSheet({
      title,
      content: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, message),
        h('div', { class: 'row' },
          h('button', { class: 'btn outline block', onclick: () => answer(false) }, cancelText),
          h('button', { class: 'btn primary block', onclick: () => answer(true) }, confirmText))),
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

// ---------- Buttons ----------
export function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.dataset.label || button.textContent;
    button.disabled = true;
    button.replaceChildren(h('span', { class: 'spin' }), label ? ` ${label}` : '');
  } else {
    button.disabled = false;
    button.replaceChildren(button.dataset.label || label || '');
    delete button.dataset.label;
  }
}

// ---------- Fields ----------
let fieldCounter = 0;
/** Floating-label text field. field({ label, type, value, autocomplete, inputmode, maxlength, hint, options }) */
export function field({ label, type = 'text', value = '', autocomplete, inputmode, maxlength, hint, options, name, digits } = {}) {
  const id = `f${++fieldCounter}`;
  let control;
  if (options) {
    control = h('select', { id, name }, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  } else {
    // digits: 10 -> a phone number field: numbers only, never longer than 10, however it is typed or pasted.
    control = h('input', { id, name, type: digits ? 'tel' : type, value, placeholder: ' ', autocomplete, inputmode: digits ? 'numeric' : inputmode, maxlength: digits || maxlength, autocapitalize: type === 'email' ? 'off' : undefined });
    if (digits) {
      control.addEventListener('input', () => {
        const cleaned = control.value.replace(/\D/g, '').slice(0, digits);
        if (cleaned !== control.value) control.value = cleaned;
      });
    }
  }
  const hintEl = h('div', { class: 'hint' }, hint || '');
  hintEl.hidden = !hint;
  const wrapper = h('div', { class: 'field' }, control, h('label', { for: id }, label), hintEl);

  if (type === 'password') {
    const toggle = h('button', { type: 'button', class: 'eye', onclick: () => {
      const showing = control.type === 'text';
      control.type = showing ? 'password' : 'text';
      toggle.textContent = showing ? 'Show' : 'Hide';
    } }, 'Show');
    wrapper.append(toggle);
  }

  return {
    el: wrapper,
    input: control,
    get value() { return control.value.trim(); },
    set value(v) { control.value = v; },
    hint(text, kind = '') { hintEl.textContent = text || ''; hintEl.className = `hint ${kind}`; hintEl.hidden = !text; },
  };
}

// ---------- Segmented control with a sliding indicator ----------
export function segmented(items, selected, onChange) {
  const indicator = h('div', { class: 'ind' });
  const buttons = items.map((item) => h('button', { type: 'button', class: item.value === selected ? 'on' : '', dataset: { value: item.value }, onclick: () => choose(item.value) }, item.label));
  const root = h('div', { class: 'seg' }, indicator, buttons);

  function place() {
    const active = buttons.find((b) => b.classList.contains('on'));
    if (!active || !root.isConnected) return;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft - 4}px)`;
    active.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  function choose(value) {
    buttons.forEach((b) => b.classList.toggle('on', b.dataset.value === String(value)));
    place();
    onChange?.(value);
  }
  // Position once the element is in the page.
  const waiter = new MutationObserver(() => { if (root.isConnected) { waiter.disconnect(); requestAnimationFrame(place); } });
  waiter.observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(place);
  root.select = (value) => { buttons.forEach((b) => b.classList.toggle('on', b.dataset.value === String(value))); place(); };
  return root;
}

// ---------- Store images ----------
/** <img> that shows the store's logo/hero/sign-in picture, falling back to the copy baked into the app. */
export function storeImage(kind, attrs = {}, onFail) {
  const { src, fallback } = imageSources(kind);
  if (!src) return null;
  const img = h('img', { ...attrs, src, alt: attrs.alt || '', draggable: 'false' });
  let triedFallback = false;
  img.addEventListener('error', () => {
    if (!triedFallback && fallback && fallback !== img.getAttribute('src')) { triedFallback = true; img.src = fallback; } else onFail?.();
  });
  return img;
}

/** The rounded white tile with the store's logo (or its initials). */
export function logoTile(className = 'logo-tile') {
  const name = store().business_name;
  const tile = h('div', { class: className });
  const showInitials = () => tile.replaceChildren(h('b', {}, initials(name)));
  const img = storeImage('logo', { alt: '' }, showInitials);
  if (img) tile.append(img); else showInitials();
  return tile;
}
