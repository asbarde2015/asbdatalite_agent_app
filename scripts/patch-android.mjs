// Runs after `cap add android` + `cap sync`. Three small edits to the generated Android project:
//   1. signs the release build with the repository's keystore (same key every time, so installs can be updated)
//   2. gives it a version that goes up with every build (Android refuses to "update" to an equal or lower one)
//   3. makes the keyboard resize the screen, so form fields are never hidden behind it
// Every edit is checked: if Capacitor ever changes the generated files, the build FAILS here
// instead of quietly producing an unsigned or mis-versioned APK.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const info = JSON.parse(readFileSync('build-info.json', 'utf8'));
const keystoreB64 = process.env.ANDROID_KEYSTORE_BASE64;
if (!keystoreB64) throw new Error('ANDROID_KEYSTORE_BASE64 is not set.');

writeFileSync('android/app/release.keystore', Buffer.from(keystoreB64, 'base64'));

const gradleFile = 'android/app/build.gradle';
let gradle = readFileSync(gradleFile, 'utf8');

const versionCode = Number(process.env.VERSION_CODE) || Math.floor(Date.now() / 60000);
if (!/versionCode\s*=?\s*\d+/.test(gradle) || !/versionName\s*=?\s*"[^"]*"/.test(gradle)) {
  throw new Error('Could not find versionCode/versionName in android/app/build.gradle - Capacitor\'s template changed.');
}
gradle = gradle
  .replace(/versionCode(\s*=?\s*)\d+/, `versionCode$1${versionCode}`)
  .replace(/versionName(\s*=?\s*)"[^"]*"/, `versionName$1"${info.versionName}"`);

const signingBlock = `signingConfigs {
        release {
            storeFile file("release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    `;

const buildTypes = /buildTypes\s*\{\s*release\s*\{/;
if (!buildTypes.test(gradle)) {
  throw new Error('Could not find buildTypes { release { in android/app/build.gradle - Capacitor\'s template changed.');
}
gradle = gradle.replace(buildTypes, (match) => `${signingBlock}${match}\n            signingConfig signingConfigs.release`);
writeFileSync(gradleFile, gradle);

const manifestFile = 'android/app/src/main/AndroidManifest.xml';
let manifest = readFileSync(manifestFile, 'utf8');
if (!manifest.includes('windowSoftInputMode')) {
  if (!manifest.includes('<activity')) throw new Error('No <activity> in AndroidManifest.xml.');
  manifest = manifest.replace('<activity', '<activity\n            android:windowSoftInputMode="adjustResize"');
  writeFileSync(manifestFile, manifest);
}

// 3b. Let the store's "email verified" web page open this app: https://<store domain>/email-verified.
//     (The page sends Android phones an intent:// link aimed at this app's package, which needs this filter.)
manifest = readFileSync(manifestFile, 'utf8');
if (!info.domain) throw new Error('build-info.json has no store domain.');
if (!manifest.includes('/email-verified')) {
  if (!manifest.includes('</activity>')) throw new Error('No </activity> in AndroidManifest.xml.');
  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${info.domain}" android:pathPrefix="/email-verified" />
            </intent-filter>
        `;
  manifest = manifest.replace('</activity>', `${filter}</activity>`);
  writeFileSync(manifestFile, manifest);
}

// 4. Gateway checkout pages shown inside the payment screen (an iframe) may rely on third-party cookies,
//    which Android's WebView blocks by default. Switch them on for the app's own WebView.
function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { const hit = findFile(full, name); if (hit) return hit; } else if (entry === name) return full;
  }
  return null;
}
const mainActivity = findFile('android/app/src/main/java', 'MainActivity.java');
if (mainActivity) {
  const source = readFileSync(mainActivity, 'utf8');
  const pkg = source.match(/^package\s+([\w.]+);/m)?.[1];
  if (pkg) {
    writeFileSync(mainActivity, `package ${pkg};

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        try {
            CookieManager.getInstance().setAcceptThirdPartyCookies(this.bridge.getWebView(), true);
        } catch (Exception ignored) {
            // Not critical: the payment screen also offers the in-app browser window.
        }
    }
}
`);
  }
} else {
  console.warn('MainActivity.java not found; third-party cookies were not enabled (payment screen still works with the secure-window fallback).');
}

console.log(`Android build ready: ${info.appName} ${info.versionName} (versionCode ${versionCode}).`);
