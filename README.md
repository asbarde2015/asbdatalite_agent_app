# ASBData Lite agent app (asbdatalite_agent_app)

Turns every ASBData agent store into its own **Android app**, fully automatically.

- The app is a Capacitor app with a clean, native-feeling VTU-style interface (Material 3): animated splash screen,
  3-slide illustrated welcome, a compact home with plans per network, bottom navigation, bottom sheets, smooth transitions.
- **The look and names come from the agent's Store Settings**: business name, tagline, logo, brand colours,
  sign-in picture and quotes, onboarding text, and the support contact details. The app deliberately stays
  minimal (no marketing sections): just the plans, orders and account.
- It contains **only what the agent's customers see on the store website**: buying data, paying, signing in,
  orders, wallet/refunds and password change. There is nothing about agents, plans or the agent dashboard in it.
- GitHub Actions builds a signed `.apk` (to install) and `.aab` (to upload to Google Play) per store and publishes both. The website's **Download App** button
  downloads it, and **Save Store Settings** on the website starts a rebuild.

```
Agent saves store settings ─► website calls GitHub (workflow_dispatch, input: subdomain)
                                    │
                                    ▼
              .github/workflows/build.yml  (ubuntu runner)
   1. scripts/prepare.mjs      reads the store from the API, bakes www/config.json, icon + splash images
   2. npx cap add android      creates the Android project (appId com.asbdata.<subdomain>)
   3. capacitor-assets         generates icons + splash from the store logo and brand colour
   4. scripts/patch-android    signs with YOUR key, bumps the version
   5. gradlew assembleRelease  builds the APK
   6. gh release upload        attaches <subdomain>.apk and <subdomain>.aab to the one "latest" release
                                    │
                                    ▼
   https://github.com/asbarde2015/asbdatalite_agent_app/releases/latest/download/<subdomain>.apk
```

## One-time setup

### 1. Put this project on GitHub
Create the repository `asbarde2015/asbdatalite_agent_app` and push everything in this folder to its `main` branch.
(Actions must be enabled for the repository.)

### 2. Create the signing key (do this once, keep the file safe)
Every build must be signed with the **same** key, otherwise Android refuses to update an installed app.
On any computer with Java installed:

```bash
keytool -genkeypair -v -keystore asbdata-release.keystore -alias asbdata \
        -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 asbdata-release.keystore > keystore.b64        # on macOS: base64 -i asbdata-release.keystore -o keystore.b64
```

In the repository: **Settings > Secrets and variables > Actions > New repository secret**, add four secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the whole contents of `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you typed |
| `ANDROID_KEY_ALIAS` | `asbdata` (the alias above) |
| `ANDROID_KEY_PASSWORD` | the key password you typed |

**Back up `asbdata-release.keystore` and the passwords somewhere safe.** If they are lost, installed apps can
never be updated; users would have to uninstall and reinstall.

### 3. (Optional) Repository variables
**Settings > Secrets and variables > Actions > Variables.** Defaults are fine for your setup:

| Variable | Default |
|---|---|
| `API_BASE` | `https://api.asbdatalite.com/api/v1` |
| `STORE_BASE_DOMAIN` | `asbdatalite.com` (the part after the store name, e.g. smekart.**asbdatalite.com**) |
| `RELEASE_TAG` | `agent-apps` |
| `PAYMENT_INLINE` | `true` (Korapay on the app's payment screen; `false` = Korapay also uses the in-app browser window) |

### 4. Let the website start builds
Create a GitHub **fine-grained personal access token**: Settings > Developer settings > Personal access tokens >
Fine-grained tokens. Repository access: only `asbagentapp`. Permission: **Actions: Read and write**.
Put it in the website's `asbdata-backend/.env` (the website side was added in an earlier update):

```
GITHUB_APP_BUILD_TOKEN=github_pat_xxxxxxxx
GITHUB_APP_REPO=asbarde2015/asbdatalite_agent_app
GITHUB_APP_WORKFLOW=build.yml
GITHUB_APP_REF=main
GITHUB_APP_INPUT=subdomain
```
then `php artisan config:clear`.

### 5. Deploy the website changes that came with this project
The app needs two small backend changes (included in the update zip):
- `config/cors.php` allows the app's origin (`https://localhost`). **Without this the app cannot talk to the API.**
- `StorefrontController` also returns the store's full `domain`.

### 6. Welcome slides
The three welcome slides are drawn by the app itself (phone with plans, instant delivery, secure payment) in each
store's own brand colour, so there are no picture files to manage. Their words come from the store's Store Settings
(hero, services and call-to-action text). To change the drawings, edit `app/js/onboarding.js` and the "Welcome slides"
part of `app/css/app.css`.

### 7. First build
**Actions > Build agent app > Run workflow > subdomain `smekart`** (use a real, live store). After ~6 to 10
minutes the file appears at
`https://github.com/asbarde2015/asbdatalite_agent_app/releases/latest/download/smekart.apk`.
Install it on an Android phone (allow "install unknown apps" for the browser) and check the checklist below.

## Countries
A store sells in its agent's country only (Ghana, Nigeria, and later Niger). The app reads the country from the
store: the currency symbol (GH₵, ₦), the phone number length (10 or 11 digits), the international dial code for WhatsApp
links and the networks shown (MTN, Telecel, AirtelTigo / MTN, Airtel, Glo, 9mobile) all follow it, and every request
carries an `X-Country` header so the server returns the right catalogue.

**What each store sells follows its country, and it never changes.** A store registered under Ghana sells every Ghanaian
service we offer (data bundles) in cedis; a store registered under Nigeria sells every Nigerian service (data, airtime,
cable TV, electricity, exam pins) in naira. The list comes from the server (`GET /services`), so when we switch a service
on or off for a country, every store of that country follows without a new app. The country is fixed the moment the
store is registered: the server refuses any change, and an order for another country's service is rejected.

## See the look without a phone
No phone, build or install needed. On any computer with Node 18+ (nothing to `npm install`):

```bash
node scripts/preview.mjs                    # demo store with demo plans (safe, works offline)
node scripts/preview.mjs --store smekart    # a REAL store: its colours, name, logo and plans, read live
node scripts/preview.mjs --color "#7B1FA2"  # demo store in another brand colour
node scripts/preview.mjs --country NG       # demo Nigerian store (₦, 11-digit numbers, MTN/Airtel/Glo/9mobile)
```
Then open **http://localhost:8080** in Chrome/Edge. The app appears in a phone-shaped frame; use **Restart** to see
the splash screen and onboarding again, and the size menu to try other phone sizes. In demo mode the whole
purchase works with a pretend payment page, so you can see the payment screen and the success animation.
(With `--store`, plans and colours are real, so don't complete a payment unless you mean it.)

This preview shows the screens and flows as the app draws them; things only a real phone does (the native
splash, app icon, status bar, back button) appear only on the device.

## What is in the app

| Screen | What it does |
|---|---|
| Splash | Store logo tile + name + tagline on the brand colour (matches the native splash) |
| Welcome | 3 animated, swipeable slides in the store's brand colour; words from the store's hero / services / call-to-action text; shown once |
| Home | Like a typical VTU app: small header (logo, name, wallet balance), four quick buttons (Buy data, Orders, Refunds/Sign in, Support) and the data plans with a tab per network (MTN, Telecel, AirtelTigo...). Tap a plan, enter the number, pay |
| Payment | **Korapay is the first and default payment tab** and is shown inline on the app's own payment screen (our header and footer around its page); Payaza, the second tab, opens in the in-app browser window. Either way the app confirms the payment by itself and shows the success animation; cancelled payments get a "Complete payment" button and the website emails the same link |
| Orders | Signed-in customers see their orders (tap one for details, unpaid orders can be paid). **Guests have no order history**: they see a clear "Sign in" button instead |
| Sign in / Register / Verify / Forgot password | Customer accounts of this store only. **Register -> "Check your email" screen -> tap the link in the email (it opens the app) -> Sign in.** Signing in is refused until the email is verified. Phone numbers are exactly 10 digits, digits only |
| Account (signed in) | Profile, wallet balance, refund history, change password, sign out; the same things the store website's customer dashboard offers |

Colours, name, logo, icon and splash are baked in at build time; **text and pictures also refresh from the
API every time the app opens**, so a change appears immediately; the rebuild (started by saving store settings)
is what updates the app name, icon, splash and colours.

## How email verification brings the person back to the app
1. The app registers the customer with `source=app`; the API sends the verification email but does **not** sign them in.
2. The email's button verifies the account on the website and lands on the store's `email-verified` page with `from=app`.
3. On Android that page shows **"Open the app to sign in"** (and tries to open it automatically). It is an
   `intent://` link aimed at this store's app package (`com.asbdata.<store>`), which the build allows by adding an
   intent filter for `https://<store domain>/email-verified` to the Android manifest.
4. The app opens on the sign-in screen with "Your email is verified". If the app isn't installed, the page falls back
   to the normal "Continue to log in" button on the website.

## Registration -> email verification -> sign in
1. The person creates an account in the app (the app tells the server `source=app`) and is **not** signed in.
2. A "Check your email" screen explains the steps and offers "Resend" (45 second wait) and "I've verified, sign in".
3. The verification email (sent in the agent's name and branding) has the link. It opens the store website's
   `email-verified` page, which on **Android** shows **"Open the app to sign in"** (and tries to open it automatically).
   That jumps back into the app on a "Your email is verified" sign-in screen.
4. If the app isn't installed on that phone, the page just offers "Continue to log in" on the website.

How it works: each build adds an Android intent filter for `https://<store domain>/email-verified`, and the web page
sends an `intent://` link aimed at the app's package (`com.asbdata.<subdomain>`). No domain verification files are needed.
Required on the website: the updated `store/email-verified.html` and `AuthController.php` (they ship in the update zip).

## What still leaves the app (honest list)
- **Payaza's payment page** opens in the in-app browser window (Chrome's secure window on top of the app). Korapay's
  page is shown on the app's own payment screen. Setting the repository variable `PAYMENT_INLINE=false` makes
  Korapay use the browser window as well.
- **Email links** (verify email, reset password) are opened from the email app, so they start in the phone's browser.
  The **verify** link then sends an Android phone straight back into the app (see below); the reset-password link stays on the website.
- Call, WhatsApp and email buttons hand over to the phone's own apps.

## Day-to-day
- Build any store by hand: Actions > Build agent app > Run workflow.
- Everything else is automatic (Save Store Settings, plan upgrade, admin plan change).
- Change the look of **all** apps: edit `app/css/app.css` or the screens in `app/js/`, push, then rebuild stores
  (each store's app updates when it is next built).
- Test the code without building: `node tests/smoke.mjs` (also runs on every push).

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Build stops at "Check the signing secrets" | Add the four secrets (step 2). |
| `No live store called ...` | The agent isn't approved or the store isn't live yet. |
| App opens but shows no bundles / "Could not reach the server" | The CORS update (step 5) isn't deployed, or the phone is offline. |
| `Could not find buildTypes` / `versionCode` | Capacitor changed its Android template; the build fails on purpose. Update `scripts/patch-android.mjs`. |
| "App not installed" on update | The APK was signed with a different key than the installed app (key changed). |
| Download App gives 404 | No build has run for that store yet, or the release is no longer the "latest" (don't create other releases in this repository). |

## Limits
- Android only (an iOS build needs a Mac runner and Apple developer signing).
- The repository must be **public**: the website's Download App button links to the release files, and GitHub only serves those to everyone for public repositories. Your signing key and passwords stay private in repository Secrets.
- The build cannot be tested by the person who wrote it without GitHub's runners: run step 7 and use the
  checklist (splash, onboarding, buy a small bundle with each gateway, cancel a payment, sign in, refund history).
