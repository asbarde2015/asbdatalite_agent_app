# Setup guide: put the agent app on GitHub (step by step)

Repository: `asbarde2015/asbdatalite_agent_app`  (must be **Public**)

## 1. Create the repository
1. Sign in at github.com as `asbarde2015`. Click **+** (top right) > **New repository**.
2. Repository name: `asbdatalite_agent_app`. Choose **Public**. Do not tick any "Add a README" boxes. Click **Create repository**.

## 2. Upload the files
Unzip `asbdatalite_agent_app.zip` on your computer. You get `app`, `scripts`, `tests`, `.github`, `README.md`,
`package.json`, `.gitignore` and this guide. Show hidden files if you cannot see `.github` (Mac: press Cmd+Shift+. in Finder; Windows: View > Show > Hidden items).

1. On the new empty repository page click **uploading an existing file**.
2. Select everything inside the unzipped folder (including the `.github` folder) and drag it into the browser.
3. Wait until all files are listed, write `First upload` in the commit box and click **Commit changes**.
4. Check the repository page shows the folders `.github`, `app`, `scripts`, `tests`. If `.github` is missing, click **Add file > Create new file**,
   type `.github/workflows/build.yml` as the name, paste the content of that file from the zip, commit; repeat for `test.yml`.

## 3. Turn on Actions
Open the **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.
Then **Settings > Actions > General > Workflow permissions**: choose **Read and write permissions** and click **Save**.

## 4. Create the signing key (once)
Every agent app is signed with this one key. Keep a copy somewhere safe (cloud drive + USB). If it is lost, installed apps can never be updated.

You need Java. If `java -version` does not work in a terminal, install "Temurin 21" from adoptium.net first.
In a terminal (Windows: PowerShell; Mac: Terminal):

```
keytool -genkeypair -v -keystore asbdata-agent.keystore -alias asbagent -keyalg RSA -keysize 2048 -validity 10000
```
It asks for a password (use the same for the key password, press Enter when it asks "same as keystore password"), then your name/organisation (anything is fine).
Then turn the file into text:

- Mac:      `base64 -i asbdata-agent.keystore -o keystore.b64`
- Windows:  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("asbdata-agent.keystore")) | Out-File keystore.b64 -Encoding ascii`

## 5. Add the four secrets
Repository > **Settings > Secrets and variables > Actions > New repository secret**. Add:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | everything inside `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the password you typed |
| `ANDROID_KEY_ALIAS` | `asbagent` |
| `ANDROID_KEY_PASSWORD` | the same password |

## 6. First test build
1. **Actions > Build agent app > Run workflow**. In "subdomain" type a live store's name only (for example `smekart`, not `smekart.asbdatalite.com`). Click **Run workflow**.
2. Wait 6 to 10 minutes. Green tick = done.
3. Open `https://github.com/asbarde2015/asbdatalite_agent_app/releases/latest/download/smekart.apk` (use your store name). The file downloads. The same release also has `smekart.aab` (same link, ending `.aab`): that is the file Google Play asks for if the agent wants to publish the app on the Play Store.
4. Install it on an Android phone (allow "install unknown apps" for the browser) and check: splash, welcome slides, plans, buying a small bundle, orders, sign in.

If a run shows a red cross, open it, click the failed step and send me the red text.

## 7. Let the website start builds automatically
1. GitHub > your profile picture > **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
2. Name `asbdata-app-builds`, expiry as long as allowed, **Only select repositories** > `asbdatalite_agent_app`.
3. Repository permissions: **Actions = Read and write** (leave the rest). Generate and copy the token.
4. On the server, in `asbdata-backend/.env` add or change:

```
GITHUB_APP_BUILD_TOKEN=github_pat_xxxxxxxx
GITHUB_APP_REPO=asbarde2015/asbdatalite_agent_app
GITHUB_APP_WORKFLOW=build.yml
GITHUB_APP_REF=main
GITHUB_APP_INPUT=subdomain
```
5. Upload `asbdata-multinational-update-v24.zip` over the site (it points Download App to this repository), then run `php artisan config:clear` and `php artisan optimize:clear`.

## 8. Day to day
- A Pro/Premium agent saving Store Settings starts a build by itself.
- To rebuild a store by hand: **Actions > Build agent app > Run workflow**.
- Never create other releases in this repository: the website uses the "latest" release.
