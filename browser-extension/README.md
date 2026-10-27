# DarkHub Vault browser extension

> Developed in its own repository: [Pokeralho/darkhub-vault-extension](https://github.com/Pokeralho/darkhub-vault-extension)
> (issues, pull requests and release zips). This folder is the copy DarkHub Suite ships and opens from
> **Password vault → Browser extension → Open extension folder**; keep both in sync.

Manifest V3 extension for Chrome, Edge and Firefox (115+) that fills logins from the DarkHub Suite password vault.
It never talks to the network: it reaches the running DarkHub app through **native messaging**.

```
extension ──connectNative("com.darkhub.vault")──> DarkHub.VaultBridgeHost.exe ──TCP 127.0.0.1 (HMAC handshake)──> DarkHub app
```

## 1. Register the native host (in DarkHub)

Open DarkHub Suite → **Password vault** (unlock it) → **Browser extension** → click **Register** for each browser.
This writes, for the current Windows user only:

| Browser | Registry key (default value = manifest path) |
| --- | --- |
| Chrome | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.darkhub.vault` |
| Edge | `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.darkhub.vault` |
| Firefox | `HKCU\Software\Mozilla\NativeMessagingHosts\com.darkhub.vault` |

and these files in `%APPDATA%\<DarkHub userData>\vault-bridge\`:

- `com.darkhub.vault.<browser>.json`: host manifest; `allowed_origins` / `allowed_extensions` lists **only** this
  extension (`chrome-extension://dpibeiimcolhiofphhncmjbejgcfblgh/` and `vault@darkhub.app`).
- `DarkHub.VaultBridgeHost.exe`: the host (copied from the app; source `electron/services/DarkHub.VaultBridgeHost.cs`).
- `bridge.cfg`: loopback port + random secret, rewritten every time the app starts the bridge and deleted on exit.
- `pairings.json`: paired browsers (SHA-256 of their tokens, never the tokens).

**Unregister** removes the registry key (only if it still points at our manifest) and the manifest file.
The loopback listener only runs while at least one browser is registered.

## 2. Load the extension

**Chrome / Edge** (unpacked):
1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** → pick this `browser-extension` folder (DarkHub's "Open extension folder" button opens it).
3. The ID must be `dpibeiimcolhiofphhncmjbejgcfblgh` (fixed by the `key` field in `manifest.json`). If it differs,
   the browser refuses to start the host.

**Firefox** (temporary add-on):
1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `manifest.json` here.
2. In `about:addons` → DarkHub Vault → **Permissions**, allow access to all websites (Firefox makes MV3 host
   permissions opt-in), otherwise the inline icon and form detection do not run.
3. Temporary add-ons are removed when Firefox closes. A permanent install needs the extension signed by Mozilla
   (the gecko id `vault@darkhub.app` must be kept).

## 3. Pair

Click the extension icon → **Pair with DarkHub**. The popup shows a 6-digit code and DarkHub shows a dialog with a
code: accept only if they match. Paired browsers are listed in DarkHub (Password vault → Browser extension) and can
be revoked there; the extension can also unpair itself.

## Using it

- **Popup**: lists the logins saved for the current tab's site, with a **Fill** button each.
- **Inline icon**: focusing a username/password field shows a small lock icon; click it to pick a login.
- **Save**: after you submit a login form, the toolbar icon gets a `+` badge; open the popup and click
  **Send to DarkHub**. DarkHub asks for confirmation before anything is saved (toggle "Offer to save logins" off to
  disable this).

## Security model

- Nothing is answered while the vault is locked. The vault also locks on Windows lock-screen / sleep.
- The app never sends the vault: a query returns only usernames of entries for the page's site. The password of one
  entry is returned only on an explicit fill (user click), and only after the app re-checks that the entry matches
  the page URL reported by the browser (not by the page).
- Matching: exact host first (`www.` ignored), then same registrable domain (eTLD+1, built-in list of multi-label
  suffixes and hosting platforms such as `github.io`). Ports must match. `http://` pages only match entries saved
  explicitly as `http://...` (exact host), except localhost; entries saved as `https://` never match `http://`
  pages. IPs and localhost match exactly only. Entries whose site is not a host name (e.g. "Gmail") never match.
- Frames: a frame only gets logins when it is same-site with the top page.
- Requests are rate limited per paired browser (queries 60/min, fills 20/min, save prompts 6/min, pairing 3 per
  10 min).
- Transport: the host↔app link is TCP bound to `127.0.0.1` only, authenticated both ways with HMAC-SHA256 over the
  per-start secret in `bridge.cfg` (user-profile ACL). On top of that each browser needs its pairing token.

## Development

There is no build step; the files are loaded as-is. Unit tests of the app-side rules live in
`tests/vaultBridge.test.ts`.
