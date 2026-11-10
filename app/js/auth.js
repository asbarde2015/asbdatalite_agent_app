// Sign in / create account / verify email / forgot password for THIS store's customers.
// Accounts belong to this store only (the API scopes them by storefront_domain), like the store website.
//
// The journey is: Create account -> "Check your email" screen -> tap the link in the email (it opens
// this app) -> Sign in. Signing in is not possible until the email is verified.

import { api, storeDomain } from './api.js';
import { h, icon, cleanNumber, validNumber, phoneDigits, phoneExample } from './util.js';
import { ls, setSession, store } from './state.js';
import { field, setLoading, storeImage, toast, logoTile } from './ui.js';
import { back, canGoBack, go, switchTab } from './nav.js';

const looksLikeEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || '').trim());

function shell({ quote, title, children }) {
  const bg = storeImage('auth', { class: 'bg', alt: '' });
  return h('div', {},
    h('div', { class: 'auth-top' },
      bg,
      h('button', { class: 'icon-btn', style: { color: '#fff', position: 'relative', zIndex: 2 }, 'aria-label': 'Back', onclick: () => (back() || switchTab('home')) }, icon('left')),
      h('div', { style: { position: 'absolute', right: '20px', top: 'calc(14px + var(--sat))', zIndex: 2 } }, logoTile()),
      h('div', { class: 'q rise' }, quote || '')),
    h('div', { class: 'auth-card rise', style: { '--i': '2' } }, h('h2', {}, title), children));
}

function done(message) {
  toast(message, 'ok');
  if (canGoBack()) back(); else switchTab('account');
}

// ------------------------------------------------------------------ sign in
export function loginScreen(params = {}) {
  const login = field({ label: 'Email or phone number', autocomplete: 'username', inputmode: 'email', value: params.email || '' });
  const password = field({ label: 'Password', type: 'password', autocomplete: 'current-password' });
  const button = h('button', { class: 'btn primary lg block', type: 'button' }, 'Sign in');
  const problem = h('div', { class: 'note bad', hidden: true });
  const verifyNow = h('button', { class: 'btn tonal block', type: 'button', hidden: true }, 'Verify my email');
  let emailToVerify = '';
  verifyNow.addEventListener('click', () => go('verify', { email: emailToVerify }, { replace: true }));

  async function submit() {
    problem.hidden = true; verifyNow.hidden = true;
    if (!login.value || !password.input.value) { toast('Enter your email/phone and password', 'bad'); return; }
    setLoading(button, true, 'Signing in');
    const res = await api('/auth/login', { method: 'POST', session: null, body: { login: login.value, password: password.input.value, storefront_domain: storeDomain() } });
    setLoading(button, false);
    if (!res.ok) {
      problem.replaceChildren(icon('info', 20), res.error);
      problem.hidden = false;
      if (res.code === 'unverified_email') {
        // Not verified yet: take them to the "check your email" screen rather than leaving them stuck.
        emailToVerify = looksLikeEmail(login.value) ? login.value.trim() : (ls.get('pending_email') || '');
        verifyNow.hidden = false;
      }
      return;
    }
    setSession('store', res.data.token, res.data.user);
    ls.del('pending_email');
    done(`Welcome back, ${String(res.data.user?.name || '').split(' ')[0] || 'friend'}!`);
  }
  button.addEventListener('click', submit);
  password.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return shell({
    quote: store().content?.auth?.loginQuote,
    title: 'Sign in',
    children: h('div', { class: 'stack' },
      params.verified ? h('div', { class: 'note ok' }, icon('check', 20), h('span', {}, 'Your email is verified. Sign in to continue.')) : null,
      login.el, password.el, problem, verifyNow, button,
      h('button', { class: 'btn text', type: 'button', onclick: () => go('forgot') }, 'Forgot password?'),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { class: 'muted' }, 'New here?'), h('button', { class: 'btn text', type: 'button', onclick: () => go('register', {}, { replace: true }) }, 'Create an account'))),
  });
}

// ------------------------------------------------------------------ create account
export function registerScreen() {
  const name = field({ label: 'Full name', autocomplete: 'name' });
  const email = field({ label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email', hint: 'We will send a link here to verify your account' });
  const phone = field({ label: 'Phone number', digits: phoneDigits(), autocomplete: 'tel', hint: `${phoneDigits()} digits, e.g. ${phoneExample()}` });
  const password = field({ label: 'Password (8+ characters)', type: 'password', autocomplete: 'new-password' });
  const confirm = field({ label: 'Confirm password', type: 'password', autocomplete: 'new-password' });
  const button = h('button', { class: 'btn primary lg block', type: 'button' }, 'Create account');
  const problem = h('div', { class: 'note bad', hidden: true });

  button.addEventListener('click', async () => {
    problem.hidden = true;
    if (!name.value) return toast('Enter your name', 'bad');
    if (!looksLikeEmail(email.value)) return toast('Enter a valid email address', 'bad');
    if (!validNumber(phone.value)) return toast(`Enter your ${phoneDigits()} digit phone number`, 'bad');
    if (password.input.value.length < 8) return toast('Password must be at least 8 characters', 'bad');
    if (password.input.value !== confirm.input.value) return toast('The two passwords do not match', 'bad');

    setLoading(button, true, 'Creating account');
    const res = await api('/auth/register', { method: 'POST', session: null, body: {
      name: name.value, email: email.value, phone: cleanNumber(phone.value),
      password: password.input.value, password_confirmation: confirm.input.value, storefront_domain: storeDomain(), source: 'app',
    } });
    setLoading(button, false);
    if (!res.ok) { problem.replaceChildren(icon('info', 20), res.error); problem.hidden = false; return undefined; }

    // Deliberately NOT signed in: the email must be verified first.
    ls.set('pending_email', email.value);
    go('verify', { email: email.value }, { replace: true });
    return undefined;
  });

  return shell({
    quote: store().content?.auth?.registerQuote,
    title: 'Create your account',
    children: h('div', { class: 'stack' }, name.el, email.el, phone.el, password.el, confirm.el, problem, button,
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('span', { class: 'muted' }, 'Already registered?'), h('button', { class: 'btn text', type: 'button', onclick: () => go('login', {}, { replace: true }) }, 'Sign in'))),
  });
}

// ------------------------------------------------------------------ "check your email"
export function verifyScreen(params = {}) {
  const address = params.email || ls.get('pending_email') || '';
  const storeName = store().business_name || 'the store';
  const resend = h('button', { class: 'btn outline block', type: 'button' }, 'Resend the email');
  let seconds = 0;
  let timer = null;

  function startCooldown(total) {
    seconds = total;
    clearInterval(timer);
    const tick = () => {
      if (!resend.isConnected || seconds <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = 'Resend the email'; return; }
      resend.disabled = true;
      resend.textContent = `Resend the email in ${seconds}s`;
      seconds -= 1;
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  resend.addEventListener('click', async () => {
    if (!address) { toast('Go back and enter your email again', 'bad'); return; }
    startCooldown(45);
    const res = await api('/auth/email/resend-public', { method: 'POST', session: null, body: { login: address, storefront_domain: storeDomain(), source: 'app' } });
    toast(res.ok ? 'A new verification email is on its way' : res.error, res.ok ? 'ok' : 'bad');
  });

  const step = (n, text) => h('div', { class: 'vstep' }, h('span', { class: 'n' }, String(n)), h('span', {}, text));

  return h('div', {},
    h('div', { class: 'appbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => go('register', {}, { replace: true }) }, icon('left')),
      h('h1', {}, 'Verify your email')),
    h('div', { class: 'verify pad' },
      h('div', { class: 'mailart rise' }, icon('mail', 54)),
      h('h2', { class: 'rise', style: { '--i': '1' } }, 'Check your email'),
      h('p', { class: 'rise', style: { '--i': '2' } }, 'We sent a verification link to'),
      h('b', { class: 'vmail rise', style: { '--i': '2' } }, address || 'your email address'),
      h('div', { class: 'card vsteps rise', style: { '--i': '3' } },
        step(1, `Open the email from ${storeName}`),
        step(2, 'Tap "Verify my email"'),
        step(3, 'You will come back to this app, then sign in')),
      h('button', { class: 'btn primary lg block rise', style: { '--i': '4' }, onclick: () => go('login', { email: address }, { replace: true }) }, "I've verified, sign in"),
      resend,
      h('p', { class: 'muted', style: { fontSize: '13px' } }, "Can't find it? Check your spam or promotions folder."),
      h('button', { class: 'btn text', type: 'button', onclick: () => go('register', {}, { replace: true }) }, 'Use a different email')));
}

// ------------------------------------------------------------------ forgot password
export function forgotScreen() {
  const email = field({ label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const button = h('button', { class: 'btn primary lg block', type: 'button' }, 'Send reset link');
  button.addEventListener('click', async () => {
    if (!looksLikeEmail(email.value)) return toast('Enter a valid email address', 'bad');
    setLoading(button, true, 'Sending');
    const res = await api('/auth/password/forgot', { method: 'POST', session: null, body: { email: email.value, storefront_domain: storeDomain() } });
    setLoading(button, false);
    toast(res.ok ? 'If an account exists for that email, a reset link is on its way.' : res.error, res.ok ? 'ok' : 'bad');
    if (res.ok) back();
    return undefined;
  });
  return shell({
    quote: 'No worries, it happens to everyone.',
    title: 'Reset your password',
    children: h('div', { class: 'stack' }, h('p', { class: 'muted' }, "Enter your email and we'll send you a link to choose a new password."), email.el, button),
  });
}
