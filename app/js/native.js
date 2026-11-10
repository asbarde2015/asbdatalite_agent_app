// Thin wrappers around the Capacitor plugins. There is no bundler in this project, so plugins are
// reached through Capacitor.registerPlugin(<name>); every call is guarded so the same code also
// runs in a normal browser (handy for trying the app on a computer).

const cap = window.Capacitor;
export const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

const cache = {};
function plugin(name) {
  if (!isNative || typeof cap.registerPlugin !== 'function') return null;
  if (!cache[name]) cache[name] = cap.registerPlugin(name);
  return cache[name];
}

export async function openInApp(url, toolbarColor) {
  const browser = plugin('Browser');
  if (browser) {
    await browser.open({ url, toolbarColor, presentationStyle: 'fullscreen' });
    return true;
  }
  window.open(url, '_blank', 'noopener');
  return false;
}

export async function closeInApp() {
  try { await plugin('Browser')?.close(); } catch { /* already closed */ }
}

/** Calls back when the person closes the in-app payment page. Returns a function that stops listening. */
export function onBrowserClosed(callback) {
  const browser = plugin('Browser');
  if (!browser) return () => {};
  let handle = null;
  let stopped = false;
  browser.addListener('browserFinished', () => { if (!stopped) callback(); }).then((h) => { handle = h; if (stopped) h.remove(); });
  return () => { stopped = true; handle?.remove?.(); };
}

/** Calls back whenever the app comes back to the foreground. */
export function onResume(callback) {
  const app = plugin('App');
  if (!app) {
    const onVisible = () => { if (!document.hidden) callback(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }
  let handle = null;
  let stopped = false;
  app.addListener('appStateChange', (state) => { if (state.isActive && !stopped) callback(); }).then((h) => { handle = h; if (stopped) h.remove(); });
  return () => { stopped = true; handle?.remove?.(); };
}

export function onBackButton(callback) {
  plugin('App')?.addListener('backButton', callback);
}

export function exitApp() {
  plugin('App')?.exitApp();
}

export async function styleStatusBar(color, lightText = true) {
  const bar = plugin('StatusBar');
  if (!bar) return;
  try {
    await bar.setBackgroundColor({ color });
    await bar.setStyle({ style: lightText ? 'DARK' : 'LIGHT' }); // 'DARK' = light icons on a dark bar
  } catch { /* unsupported on this device */ }
}

export async function hideNativeSplash() {
  try { await plugin('SplashScreen')?.hide({ fadeOutDuration: 250 }); } catch { /* already hidden */ }
}

export function openExternal(url) {
  // Phone calls, email and chat apps: hands over to the phone's own apps.
  window.location.href = url;
}

/** Calls back with the link when the phone opens the app from a web link (e.g. the "email verified" page). */
export function onAppUrlOpen(callback) {
  plugin('App')?.addListener('appUrlOpen', (event) => callback(event?.url));
}

/** The link the app was cold-started with, if any. */
export async function getLaunchUrl() {
  try { return (await plugin('App')?.getLaunchUrl())?.url || null; } catch { return null; }
}
