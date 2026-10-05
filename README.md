# contabilizate-extension

A Chrome extension designed to automate form filling in the Mexican SAT (Tax Administration Service) portal, specifically for electronic invoicing (CFDI).

## Features

- Automated login using e.firma (electronic signature)
- Automated bill/invoice form filling (including global invoices)
- Monthly dashboard: income, expenses and margin computed from your CFDI, with VAT and withholdings
- Credit card spending: import PDF statements (BBVA and Nu) and analyze spending by category
- Download CFDI from the SAT or import XML files by dragging them in
- Client/concept templates, with automatic dates in descriptions
- Amounts hidden by default (privacy mode)
- Local-first storage, encrypted backups and Google Drive sync

## Installation

1. Clone this repository and run `npm install && npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `dist/` directory

Use `npm run dev` to rebuild on every change, and `npm test` to run the tests.
`npm run typecheck` runs TypeScript only, and `npm run package` builds and
creates `contabilizate-<version>.zip` for the Chrome Web Store (without the
manifest `key`, which the store rejects).

## Full app (React)

The popup's "Abrir app completa" button opens a full-page React app
(`app/`) that works without the Contabilizate website:

- Data lives locally in IndexedDB (Dexie). Every record has `updatedAt` and
  soft deletes, so backups merge by "newest wins", and the same rule will
  power sync between devices.
- The e.firma is stored encrypted (AES-GCM, key derived from the e.firma
  password). Unlocking it puts the files in `chrome.storage.session` for the
  sign-in script; it is cleared when the browser closes unless you choose to
  keep it unlocked.
- Pages: dashboard, invoices (with a month filter), templates, SAT downloads,
  credit cards (statement import and spending analysis), profile/e.firma and
  backup.
- Statement import: PDFs are parsed locally in the browser (BBVA and Nu
  formats); nothing is uploaded.
- Backup: export everything to a `.json` file (optionally encrypted with a
  password) and import it in another browser.

## Configuration

The extension requires:
- Your e.firma certificate file (.cer)
- Your e.firma private key file (.key)
- Certificate password
- Invoice information such as:
  - RFC (Tax ID)
  - Business name
  - Postal code
  - Tax regime
  - CFDI usage

## Usage

The toolbar popup is a small launcher: it shows whether the e.firma is
unlocked and whether an invoice is waiting to be issued (with a button to
discard it). Everything else lives in the full app ("Abrir Contabilizate"):
profile and e.firma, invoices, templates (including importing the old popup
JSON/CSV), downloading CFDI from the SAT, and backups.

## Google Drive sync

The app can sync its data between browsers through Google Drive's hidden app
folder (`appDataFolder`, scope `drive.appdata`): only this extension can read
it and it doesn't show up among your files. Each sync downloads the remote
copy, merges it with the local database (newest record wins, deletions travel
as tombstones) and uploads the result. It runs when the app opens, a few
seconds after each change and when you come back to the tab.

Users don't configure anything: they click **Conectar con Google Drive** and
sign in. The extension ships with a fixed ID and a Google OAuth Client ID tied
to it.

### Fixed extension ID

`manifest.json` has a `key` (public key), so the extension ID is always
`bmjbdlkhekcomlilcaehabmpdpcdbjdo`, no matter which folder `dist/` is loaded
from or on which computer. The matching private key lives in `.keys/` (git
ignored); it's only needed to pack a `.crx` by hand. If the extension is
published to the Chrome Web Store, replace `key` with the public key the store
shows in the developer dashboard (Package → View public key) and update the
OAuth client with the new ID.

### Google OAuth client (one time, by whoever publishes the extension)

1. In [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Google Drive API**.
2. Configure the **OAuth consent screen** as External, add the `drive.appdata` scope and **publish the app**
   (status *In production*). `drive.appdata` is a non-sensitive scope, so only basic verification applies;
   while the app stays in *Testing* only the listed test users can connect.
3. Under **Credentials** create an **OAuth client ID** of type **Chrome Extension** with item ID
   `bmjbdlkhekcomlilcaehabmpdpcdbjdo`.
4. Put the Client ID in `manifest.json` → `oauth2.client_id` and commit it. A Client ID is not a secret.
5. Run `npm run build`.

While `oauth2.client_id` is still the `__GOOGLE_CLIENT_ID__` placeholder the
build drops `oauth2` and the app says Drive isn't available.

## File Structure

```
├── manifest.json        # Extension configuration
├── index.html           # Popup (launcher)
├── app/                 # Full React app (Vite), built into dist/app
│   └── src/             # pages/, components/, features/, lib/ (db, sync, parsers)
├── docs/                # Landing page and privacy policy (GitHub Pages)
├── store/               # Chrome Web Store listing and assets
├── scripts/package.mjs  # Builds the store .zip
├── js/
│   ├── background.js    # Injects the fill scripts on SAT pages
│   ├── popup.js         # Popup logic
│   └── forms/           # Scripts that fill the SAT login and invoice forms
└── dist/                # Build output: load this folder in chrome://extensions
```

## Security

This extension stores sensitive information locally in your browser. Make sure to:
- Keep your certificate files secure
- Never share your private key
- Use strong passwords
- Only install the extension on trusted devices

## Permissions

The extension requires permissions to:
- Access SAT domains
- Access active tabs
- Execute scripts
- Access local storage (including unlimited storage for the local database)
- Download files (CFDI and backups)
- Sign in with Google (`identity`) for Drive sync

## Development

Built with:
- TypeScript, React 19 and Vite
- Tailwind CSS and Radix UI
- Dexie (IndexedDB), pdf.js for statements
- Vitest for tests
- Chrome Extension APIs (Manifest V3)

## License

[MIT](LICENSE)
