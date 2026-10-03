# contabilizate-extension

A Chrome extension designed to automate form filling in the Mexican SAT (Tax Administration Service) portal, specifically for electronic invoicing (CFDI).

## Features

- Automated login using e.firma (electronic signature)
- Automated bill/invoice form filling
- Support for digital certificate management
- Automatic tax calculations and verification
- Smart form field population with saved data

## Installation

1. Clone this repository and run `npm install && npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `dist/` directory

Use `npm run dev` to rebuild on every change, and `npm test` to run the tests.

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

It needs a Google OAuth Client ID (one time, free):

1. In [Google Cloud Console](https://console.cloud.google.com) create a project and enable the **Google Drive API**.
2. Configure the **OAuth consent screen** as External and add your Gmail account as a test user.
3. Under **Credentials** create an **OAuth client ID** of type **Chrome Extension**, using the extension ID
   shown in `chrome://extensions` (also shown in the app under "Respaldo y sincronización").
4. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID`.
5. Run `npm run build` and reload the extension.

The extension ID of an unpacked extension depends on the folder it was loaded
from; if you move `dist/` the ID changes and the OAuth client must be updated.

## File Structure

```
├── manifest.json        # Extension configuration
├── index.html           # Popup (launcher)
├── app/                 # Full React app (Vite), built into dist/app
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
- Access local storage
- Handle native messaging

## Development

Built with:
- JavaScript
- Chrome Extension APIs
- HTML/CSS
- Bootstrap for styling

## License

[Add your license information here]
