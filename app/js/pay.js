// The whole "pay inside the app" journey, used for every data purchase.
//
//   1. The gateway's secure page opens in the way that suits that gateway:
//        - Korapay: INLINE, on a payment screen built for it (our own header + footer around its page);
//        - Payaza:  in the in-app browser window.
//      Either way the person stays in the app, and card / MoMo details never touch the app's own code.
//      (Build variable PAYMENT_INLINE=false makes Korapay use the in-app browser window too.)
//   2. While it is open - and again the moment it is closed or the app comes back to the foreground -
//      we ask the server whether the payment went through (verify()).
//   3. Paid  -> animated success screen.
//      Not paid -> "Payment not completed": a "Complete payment" button (a fresh payment for the
//      same order) and, for orders, an email with the same link (the server sends it).

import { h, icon, sleep, confetti } from './util.js';
import { state, store } from './state.js';
import { openSheet, setLoading, toast } from './ui.js';
import { closeInApp, onBrowserClosed, onResume, openInApp } from './native.js';

/**
 * @param {object}   opts
 * @param {string}   opts.url           gateway page to open
 * @param {string}   [opts.gateway]     'payaza' | 'korapay' (decides inline screen vs in-app browser window)
 * @param {Function} opts.verify        async () => ({ status: 'success'|'failed'|'pending' })
 * @param {Function} [opts.resume]      async () => { url, gateway } for a fresh payment, or null when it turns out to be paid already
 * @param {Function} [opts.onCancelled] async () => short text to show, e.g. "We've emailed a link to a***@mail.com"
 * @param {Array}    [opts.summary]     [[label, value], ...] shown on the success screen
 * @param {string}   [opts.successTitle]
 * @param {string}   [opts.successText]
 * @returns {Promise<{status: 'success'|'failed'|'cancelled'}>}
 */
export function runPayment(opts) {
  return new Promise((resolve) => {
    const colors = store().colors || {};
    const sheet = openSheet({ full: true, locked: true });
    sheet.body.style.padding = '0';
    sheet.body.style.flex = '1';

    let url = opts.url;
    let finished = false;
    let busy = false;
    let gatewayKey = opts.gateway || (/korapay/i.test(opts.url || '') ? 'korapay' : 'payaza');
    let pollTimer = null;
    let stopClosed = () => {};
    let stopResume = () => {};

    // The store's checkout page, when it ends up inside our payment screen after paying, tells us so we can
    // confirm immediately (we still verify with the server: the message is only a nudge).
    const onMessage = (event) => { if (event?.data?.type === 'asb-payment-return') settle(); };
    window.addEventListener?.('message', onMessage);

    const finish = (status) => {
      if (finished) return;
      finished = true;
      clearInterval(pollTimer);
      window.removeEventListener?.('message', onMessage);
      stopClosed();
      stopResume();
      sheet.close();
      resolve({ status });
    };

    const show = (...nodes) => sheet.setContent(h('div', { class: 'payfull' }, ...nodes));

    // ---- views ----
    /** The payment screen: the gateway's page inline, inside the app's own frame. */
    function viewInline() {
      const loader = h('div', { class: 'payload' },
        h('div', { class: 'orb' }, h('i', {}, h('span', { class: 'spin', style: { width: '30px', height: '30px', border: '3px solid #fff', borderRightColor: 'transparent', borderRadius: '50%' } }))),
        h('b', {}, 'Loading secure payment...'));
      const frame = h('iframe', { class: 'payiframe', src: url, title: 'Secure payment', allow: 'payment *; clipboard-write', referrerpolicy: 'origin' });
      frame.addEventListener('load', () => { loader.remove(); });

      sheet.setContent(h('div', { class: 'payframe' },
        h('div', { class: 'payhead' }, h('span', { class: 'lockbadge' }, icon('lock', 18)), h('div', {}, h('b', {}, 'Secure payment'), h('small', {}, 'Card or Mobile Money'))),
        h('div', { class: 'payview' }, frame, loader),
        h('div', { class: 'paybar', style: { paddingBottom: 'calc(10px + var(--sab))' } },
          h('button', { class: 'btn primary', onclick: () => settle() }, "I've paid, check now"),
          h('button', { class: 'btn text sm', onclick: () => viewCancelled() }, 'Cancel payment'))));
    }

    function viewWaiting() {
      show(
        h('div', { class: 'orb' }, h('i', {}, icon('lock', 32))),
        h('h3', {}, 'Complete your payment'),
        h('p', {}, 'Finish paying on the secure page. This screen updates by itself as soon as your payment is confirmed.'),
        h('button', { class: 'btn primary lg block', onclick: () => settle() }, "I've paid, check now"),
        h('button', { class: 'btn outline block', onclick: () => openPage() }, 'Reopen the payment page'),
        h('button', { class: 'btn text', onclick: () => viewCancelled() }, 'Cancel payment'),
      );
    }

    /** Korapay -> the inline payment screen; Payaza (or anything else) -> the in-app browser window. */
    function showPayment() {
      const inline = gatewayKey === 'korapay' && state.cfg?.paymentInline !== false;
      if (inline) viewInline(); else { viewWaiting(); openPage(); }
    }

    function viewChecking(text = 'Confirming your payment...') {
      show(
        h('div', { class: 'orb' }, h('i', {}, h('span', { class: 'spin', style: { width: '30px', height: '30px', border: '3px solid #fff', borderRightColor: 'transparent', borderRadius: '50%' } }))),
        h('h3', {}, text),
        h('p', {}, 'This usually takes a few seconds.'),
      );
    }

    function viewSuccess() {
      show(
        h('div', { class: 'result-ico ok' }, h('svg', { class: 'checkmark', viewBox: '0 0 24 24', width: '58', height: '58', fill: 'none', stroke: '#fff', 'stroke-width': '2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, h('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }))),
        h('h3', {}, opts.successTitle || 'Payment received'),
        h('p', {}, opts.successText || 'Thank you! Your payment was successful.'),
        opts.summary?.length
          ? h('div', { class: 'card', style: { width: '100%', maxWidth: '360px', textAlign: 'left' } }, opts.summary.map(([k, v]) => h('div', { class: 'kv' }, h('span', {}, k), h('b', {}, v))))
          : null,
        h('button', { class: 'btn primary lg block', style: { maxWidth: '360px' }, onclick: () => finish('success') }, 'Done'),
      );
      confetti([colors.primary || '#2A2FA0', '#ffc233', '#12a150', '#ff6b6b', '#4dabf7']);
    }

    async function viewCancelled() {
      clearInterval(pollTimer);
      closeInApp();
      const note = h('p', { class: 'muted', style: { fontSize: '13.5px' } });
      const again = h('button', { class: 'btn primary lg block', onclick: async () => {
        if (!opts.resume) { finish('cancelled'); return; }
        setLoading(again, true, 'Please wait');
        try {
          const next = await opts.resume();
          if (!next) { setLoading(again, false); settle(); return; } // already paid after all
          url = typeof next === 'string' ? next : next.url;
          if (next.gateway) gatewayKey = next.gateway;
          setLoading(again, false);
          startPolling();
          showPayment();
        } catch (err) {
          setLoading(again, false);
          toast(err?.message || 'Could not restart the payment.', 'bad');
        }
      } }, opts.resume ? 'Complete payment' : 'Close');
      show(
        h('div', { class: 'result-ico wait' }, icon('x', 56)),
        h('h3', {}, 'Payment not completed'),
        h('p', {}, "You didn't finish paying, so your order hasn't been placed yet. If you already paid, please don't pay again: we'll confirm it and deliver automatically."),
        note,
        again,
        opts.resume ? h('button', { class: 'btn text', onclick: () => finish('cancelled') }, 'Not now') : null,
      );
      if (opts.onCancelled) {
        try { const text = await opts.onCancelled(); if (text) note.textContent = text; } catch { /* the email is a bonus */ }
      }
    }

    function viewFailed() {
      show(
        h('div', { class: 'result-ico bad' }, icon('x', 56)),
        h('h3', {}, 'Payment failed'),
        h('p', {}, 'The payment did not go through and you have not been charged. Please try again.'),
        h('button', { class: 'btn primary lg block', style: { maxWidth: '360px' }, onclick: () => finish('failed') }, 'Close'),
      );
    }

    // ---- logic ----
    async function openPage() {
      try { await openInApp(url, colors.primary); } catch { toast('Could not open the payment page.', 'bad'); }
    }

    /** One server check. Returns true when the screen moved on to a final state. */
    async function checkOnce() {
      const result = await opts.verify();
      if (finished) return true;
      if (result.status === 'success') { await closeInApp(); viewSuccess(); return true; }
      if (result.status === 'failed') { await closeInApp(); viewFailed(); return true; }
      return false;
    }

    /** The person says they've paid / came back from the payment page: check a few times, then give up politely. */
    async function settle() {
      if (busy || finished) return;
      busy = true;
      viewChecking();
      for (let attempt = 0; attempt < 4; attempt++) {
        if (await checkOnce()) { busy = false; return; }
        await sleep(2500);
      }
      busy = false;
      if (!finished) viewCancelled();
    }

    function startPolling() {
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => { if (!busy && !finished) await checkOnce(); }, 4000);
    }

    stopClosed = onBrowserClosed(() => settle());
    stopResume = onResume(() => { if (!busy && !finished) checkOnce(); });

    startPolling();
    showPayment();
  });
}
