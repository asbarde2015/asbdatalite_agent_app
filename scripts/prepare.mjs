// Step 1 of every build. Turns one agent's store settings into the files the Android build needs:
//
//   www/                the web app (a copy of app/) + config.json baked with the store's settings
//   www/assets/store/   the store's logo / hero / sign-in images, downloaded so the app also works offline
//   capacitor.config.json   app id, app name, splash colours
//   assets/             icon + splash source images (sharp), turned into Android icons by @capacitor/assets
//   build-info.json     what patch-android.mjs needs (app id, name, version)
//
// Everything visual comes from the agent's Store Settings: name, tagline, logo, colours, hero/sign-in
// images and every text block. The running app ALSO refreshes this from the API at launch, so text
// edits show up without a rebuild; a rebuild is what updates the app name, icon, splash and colours
// that are baked into the native shell.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SUB = String(process.env.APP_SUB || '').toLowerCase().trim();
const API_BASE = String(process.env.API_BASE || 'https://api.asbdatalite.com/api/v1').replace(/\/+$/, '');
const STORE_BASE_DOMAIN = String(process.env.STORE_BASE_DOMAIN || 'asbdatalite.com').replace(/^\.+/, '');
const ROOT = process.cwd();

const JAVA_WORDS = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null']);

function die(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

if (!/^[a-z0-9]{1,40}$/.test(SUB)) die(`APP_SUB is missing or invalid: "${SUB}"`);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStore() {
  const url = `${API_BASE}/storefront?domain=${encodeURIComponent(SUB)}`;
  let lastError = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) {
        die(`No live store called "${SUB}" (the website answered 404). The agent must be approved and the store live before an app can be built.`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err.message;
      console.warn(`Could not read ${url} (attempt ${attempt}/4): ${lastError}`);
      await sleep(attempt * 3000);
    }
  }
  die(`Could not read the store settings from ${url}: ${lastError}`);
}

async function download(url, name) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    const ext = type.includes('png') ? 'png'
      : type.includes('webp') ? 'webp'
      : type.includes('svg') ? 'svg'
      : type.includes('gif') ? 'gif'
      : 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());
    const file = `${name}.${ext}`;
    await writeFile(path.join(ROOT, 'www/assets/store', file), buffer);
    return { file: `assets/store/${file}`, buffer };
  } catch (err) {
    console.warn(`Could not download ${name} (${url}): ${err.message}`);
    return null;
  }
}

const hex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback);
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

// The native app name lands in Android's strings.xml, so keep it free of characters that would break the XML.
function nativeAppName(name) {
  const cleaned = String(name || 'Data Store')
    .replace(/&/g, ' and ')
    .replace(/'/g, '\u2019')
    .replace(/[<>"\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
  return cleaned || 'Data Store';
}

function appIdFor(sub) {
  const part = /^[0-9]/.test(sub) || JAVA_WORDS.has(sub) ? `a${sub}` : sub;
  return `com.asbdata.${part}`;
}

// A white rounded "tile" holding the logo (or the store's initials), so the icon and splash read well
// whatever colour the logo is.
async function logoTile(logoBuffer, size, initials, brand) {
  const radius = Math.round(size * 0.24);
  const tileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/></svg>`;
  const layers = [];
  if (logoBuffer) {
    try {
      const inner = Math.round(size * 0.72);
      const logo = await sharp(logoBuffer, { density: 300 })
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      layers.push({ input: logo, gravity: 'center' });
    } catch (err) {
      console.warn(`Logo could not be used for the icon (${err.message}); using initials instead.`);
    }
  }
  if (!layers.length) {
    const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${Math.round(size * 0.42)}" fill="${brand}">${esc(initials)}</text></svg>`;
    layers.push({ input: Buffer.from(textSvg), gravity: 'center' });
  }
  return sharp(Buffer.from(tileSvg)).composite(layers).png().toBuffer();
}

async function main() {
  console.log(`Reading the store settings for "${SUB}" from ${API_BASE} ...`);
  const store = await fetchStore();

  await rm(path.join(ROOT, 'www'), { recursive: true, force: true });
  await cp(path.join(ROOT, 'app'), path.join(ROOT, 'www'), { recursive: true });
  await mkdir(path.join(ROOT, 'www/assets/store'), { recursive: true });
  await mkdir(path.join(ROOT, 'assets'), { recursive: true });

  const colors = { ...(store.colors || {}) };
  colors.primary = hex(colors.primary, '#2A2FA0');

  const logo = await download(store.logo_url, 'logo');
  const hero = await download(store.hero_image_url, 'hero');
  const auth = await download(store.auth_image_url, 'auth');

  // The same shape the API returns, plus local copies of the images (used until the live refresh answers).
  const baked = {
    apiBase: API_BASE,
    // true = the payment page is shown inline on the app's own payment screen; false = always in the in-app browser window.
    paymentInline: String(process.env.PAYMENT_INLINE || 'true').toLowerCase() !== 'false',
    subdomain: SUB,
    builtAt: new Date().toISOString(),
    store: {
      ...store,
      // The address the API expects back as "storefront_domain" (older API versions don't send it).
      domain: store.domain || `${SUB}.${STORE_BASE_DOMAIN}`,
      colors,
      logo_local: logo?.file || null,
      hero_local: hero?.file || null,
      auth_local: auth?.file || null,
    },
  };
  await writeFile(path.join(ROOT, 'www/config.json'), JSON.stringify(baked, null, 2));

  const appName = nativeAppName(store.business_name);
  const appId = appIdFor(SUB);
  const now = new Date();
  const versionName = `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}`;

  await writeFile(path.join(ROOT, 'capacitor.config.json'), JSON.stringify({
    appId,
    appName,
    webDir: 'www',
    server: { androidScheme: 'https' },
    plugins: {
      SplashScreen: {
        launchShowDuration: 900,
        launchAutoHide: true,
        launchFadeOutDuration: 300,
        backgroundColor: colors.primary,
        androidScaleType: 'CENTER_CROP',
        showSpinner: false,
      },
    },
  }, null, 2));

  await writeFile(path.join(ROOT, 'build-info.json'), JSON.stringify({ appId, appName, versionName, primary: colors.primary, domain: baked.store.domain }, null, 2));

  // ---- icon + splash sources for @capacitor/assets ----
  const words = String(store.business_name || SUB).split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : String(words[0] || SUB).slice(0, 2)).toUpperCase();
  const brand = colors.primary;
  const solid = (size) => sharp({ create: { width: size, height: size, channels: 4, background: brand } }).png().toBuffer();

  const iconTile = await logoTile(logo?.buffer, 620, initials, brand);
  const splashTile = await logoTile(logo?.buffer, 760, initials, brand);

  const iconBg = await solid(1024);
  await writeFile(path.join(ROOT, 'assets/icon-background.png'), iconBg);
  await writeFile(
    path.join(ROOT, 'assets/icon-foreground.png'),
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: iconTile, gravity: 'center' }]).png().toBuffer(),
  );
  await writeFile(
    path.join(ROOT, 'assets/icon-only.png'),
    await sharp(iconBg).composite([{ input: iconTile, gravity: 'center' }]).png().toBuffer(),
  );

  const splash = await sharp(await solid(2732)).composite([{ input: splashTile, gravity: 'center' }]).png().toBuffer();
  await writeFile(path.join(ROOT, 'assets/splash.png'), splash);
  await writeFile(path.join(ROOT, 'assets/splash-dark.png'), splash);

  console.log(`Ready: ${appName} (${appId}), brand colour ${brand}, logo ${logo ? 'downloaded' : 'missing - initials used'}.`);
}

main().catch((err) => die(err.stack || err.message));
