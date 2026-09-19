# Contabilizate · app iOS

Port de la extensión de Chrome a una app iOS (Capacitor 8) para facturar y
descargar CFDI desde el iPhone, **con la e.firma almacenada únicamente en el
dispositivo**. No hay servidor: el `.cer`, el `.key` y la contraseña viven en el
Keychain de iOS y nunca salen del teléfono.

## Cómo funciona

La extensión automatizaba el portal del SAT inyectando JS en las páginas desde
Chrome. Aquí se hace lo mismo, pero el motor es un **WKWebView oculto** dentro
de la app, controlado por `@capgo/capacitor-inappbrowser`.

```
┌─────────────────────────────────────────┐
│ App (Capacitor)                         │
│                                         │
│  WebView UI  ──── sat-bridge.js ────┐   │
│  (www/)                             │   │
│                                     ▼   │
│  Keychain  ◄── secure-store.js   WebView oculto
│  (.cer/.key/pwd)                  portal del SAT
└─────────────────────────────────────────┘
```

Dos detalles que hacen que esto funcione:

- **`invisibilityMode: FAKE_VISIBLE`** — el webview queda invisible (`alpha = 0`)
  pero reporta dimensiones de pantalla completa. Con el modo `AWARE` por defecto
  reporta dimensiones cero y DevExpress no renderiza ni considera "visibles" sus
  campos, así que el llenado del formulario falla.
- **User-Agent de Safari de escritorio** — obliga al SAT a servir su layout
  desktop, que es del que dependen los ids ya mapeados en la extensión
  (`135textbox61`, `E1350003PFAC101`, …). Sin esto habría que remapear todo.

### El puente (`src/sat-bridge.js`)

Es la pieza central y sustituye a `chrome.scripting.executeScript`. El plugin
ofrece `executeScript()` pero devuelve `Promise<void>`, así que el puente
envuelve cada función inyectada en código que devuelve el resultado vía
`window.mobileApp.postMessage()` con un id de correlación, y resuelve la promesa
correspondiente del lado de la app. El resultado es una API equivalente:

```js
// Antes (extensión)
const [res] = await chrome.scripting.executeScript({ target, func, args });
res.result

// Ahora
await bridge.run(func, args)
```

### Equivalencias con las APIs de Chrome

| Extensión | App iOS |
|---|---|
| `chrome.scripting.executeScript({func, args})` | `bridge.run(fn, args)` |
| `chrome.scripting.executeScript({files})` | `bridge.runFile(path)` |
| `chrome.tabs.update({url})` | `bridge.navigate(url)` |
| `chrome.tabs.onUpdated` (`complete`) | `bridge.waitForLoad()` |
| `chrome.storage.local` (credenciales) | `secure-store.js` → Keychain |
| `chrome.storage.local` (datos factura) | `secure-store.js` → localStorage |
| `chrome.downloads.download(dataUrl)` | `@capacitor/filesystem` (pendiente) |

La descarga es más fácil de lo que parece: `download-manager.js` ya obtiene los
bytes con `fetch()` dentro de la página y los pasa a data URL; sólo hay que
cambiar el destino final.

## Estado actual

Esto es un **scaffold con un spike de validación**, no el port terminado.

Listo:
- Proyecto Capacitor 8 + iOS generado, 4 plugins enlazados.
- `src/sat-bridge.js` — puente de inyección con valores de retorno.
- `src/secure-store.js` — Keychain (`whenPasscodeSetThisDeviceOnly`) + Face ID.
- `src/spike.js` — valida la arquitectura contra el portal real.
- UI mínima para cargar credenciales y correr el spike.

Pendiente:
- Portar `js/forms/fill-form-bill.js` (869 líneas) sobre el puente.
- Portar `js/download/download-manager.js` (685 líneas) + escritura con Filesystem.
- Portar la UI completa desde `index.html` de la extensión.
- Manejo de suspensión en background durante descargas largas.

## Antes de poder compilar: arreglar Xcode

`xcodebuild` está roto en esta máquina:

```
Symbol not found: _XPCTypeBool
```

Es Xcode 16.0 sobre macOS 26.6.2 — versiones incompatibles. Hay que actualizar
Xcode desde el App Store antes de poder compilar nada. **Ninguna parte de este
código se ha ejecutado todavía en un dispositivo.**

## Uso

```bash
npm install
npm run build       # esbuild: src/ → www/bundle.js
npx cap sync ios
npm run ios         # abre Xcode
```

En Xcode: seleccionar el equipo de firma en *Signing & Capabilities* y correr en
un iPhone físico (el spike necesita red y Keychain reales).

Luego, en la app:
1. **"Probar arquitectura"** — sin credenciales. Verifica el puente, el layout
   de escritorio, los ids del formulario y, sobre todo, si
   `input.files = dataTransfer.files` funciona en WebKit.
2. **"Probar login real"** — carga primero la e.firma, luego inyecta y envía.

El paso 1 es el que decide si todo el enfoque es viable. Si el setter de `files`
falla, el spike prueba automáticamente el plan B (redefinir la propiedad `files`
sobre el elemento), que debería bastar porque la página del SAT lee
`input.files[0]` desde su propio JS.

## Nota sobre biometría

`@aparajita/capacitor-biometric-auth` no trae `Package.swift`, así que Capacitor
lo excluye del build SPM (sólo trae podspec). El código lo maneja: si el plugin
no responde, se degrada a la protección del Keychain sin Face ID. Para
habilitarlo hay dos caminos:

- regenerar la plataforma con CocoaPods:
  `npx cap add ios --packagemanager CocoaPods`, o
- sustituirlo por un plugin de biometría con soporte SPM.

Conviene decidirlo una vez que Xcode compile, para poder verificarlo.

## Seguridad

- La e.firma se guarda con `whenPasscodeSetThisDeviceOnly`: no se sincroniza a
  iCloud, no aparece en backups y se borra si se quita el código del dispositivo.
- La lectura pide Face ID, con caché de 5 minutos para no interrumpir una
  descarga masiva de cientos de pasos.
- El desbloqueo se invalida al mandar la app a background.
- Esto es estrictamente mejor que la extensión, que guarda el `.key` y la
  contraseña en texto plano en `chrome.storage.local`.
