// Tiny screen router: tab screens (Home / Orders / Account) and pushed screens (sign in,
// register...) that sit on a back stack. Screens are plain functions returning an element.

import { $, clear } from './util.js';

const screens = {};
export const TABS = ['home', 'orders', 'account'];
let current = null;
const stack = [];

export const registerScreens = (map) => Object.assign(screens, map);
export const currentScreen = () => current;
export const canGoBack = () => stack.length > 0;

function show(name, params, direction) {
  current = { name, params };
  const view = $('#view');
  clear(view);
  const el = screens[name](params);
  el.classList.add('screen');
  if (direction === 'back') el.classList.add('back');
  view.append(el);
  view.scrollTop = 0;
  $('#app').classList.toggle('no-nav', !TABS.includes(name));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
}

/** Push a screen on top of the current one. */
export function go(name, params = {}, { replace = false } = {}) {
  if (!replace && current) stack.push(current);
  show(name, params, 'forward');
}

/** Pop back to the previous screen. Returns false when there is nothing to go back to. */
export function back() {
  const previous = stack.pop();
  if (!previous) return false;
  show(previous.name, previous.params, 'back');
  return true;
}

export function switchTab(name, params = {}) {
  stack.length = 0;
  show(name, params, 'forward');
}

/** Re-draw the current screen (after login, new data...). */
export function refresh() {
  if (current) show(current.name, current.params, 'forward');
}
