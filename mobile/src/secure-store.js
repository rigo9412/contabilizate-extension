/**
 * Almacén de credenciales. Reemplaza a chrome.storage.local de la extensión.
 *
 * La e.firma (.cer, .key y contraseña) vive en el Keychain de iOS con
 * whenPasscodeSetThisDeviceOnly: no se sincroniza a iCloud, no sale en backups
 * y se borra si el usuario quita el código del dispositivo. La lectura se
 * protege además con Face ID.
 *
 * Los datos de la factura (RFC, conceptos, totales) no son secretos y van a
 * localStorage para no pagar el costo de biometría en cada lectura.
 */
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';

const CREDENTIAL_KEYS = ['certificado.cer', 'llave.key', 'passwordCertificado'];
const BILL_PREFIX = 'bill:';

// NOTA SOBRE BIOMETRÍA
// -------------------
// El Face ID está deshabilitado a propósito. El plugin que lo proveía
// (@aparajita/capacitor-biometric-auth) no publica Package.swift, así que
// Capacitor lo excluye del build SPM pero lo sigue declarando en
// packageClassList: llamarlo dejaba la promesa sin resolver y colgaba la
// lectura de credenciales.
//
// La e.firma sigue protegida por el Keychain con whenPasscodeSetThisDeviceOnly
// (no sale del dispositivo, no va a iCloud, no aparece en backups). Lo que se
// pierde es la capa extra de confirmación por Face ID.
//
// Para reactivarlo: regenerar la plataforma con CocoaPods
// (npx cap add ios --packagemanager CocoaPods), o usar un plugin de biometría
// con soporte SPM. Ver mobile/README.md.

async function ensureUnlocked() {
  return;
}

/** Reservado: invalidará el desbloqueo biométrico cuando se reactive. */
export function lock() {}

/**
 * Guarda un archivo de la e.firma. `file` es un File/Blob del <input type=file>.
 * Se almacena como data URL, igual que hacía la extensión, para que los scripts
 * de inyección ya existentes funcionen sin cambios.
 */
export async function saveCredentialFile(file, name) {
  if (!file) throw new Error('No hay archivo que guardar');

  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

  await SecureStorage.set(
    name,
    JSON.stringify({ content, type: file.type, timestamp: Date.now() }),
    false,
    false,
    KeychainAccess.whenPasscodeSetThisDeviceOnly
  );
}

export async function savePassword(password) {
  await SecureStorage.set(
    'passwordCertificado',
    password,
    false,
    false,
    KeychainAccess.whenPasscodeSetThisDeviceOnly
  );
}

/** Lee una credencial. Pide Face ID si el desbloqueo caducó. */
export async function readCredential(name, reason) {
  await ensureUnlocked(reason);
  const raw = await SecureStorage.get(name, false, false);
  if (raw == null) throw new Error(`No hay datos guardados con el nombre: ${name}`);
  if (name === 'passwordCertificado') return raw;
  return JSON.parse(raw);
}

/** Estado de configuración para la UI, sin exponer los valores ni pedir Face ID. */
export async function credentialStatus() {
  const keys = await SecureStorage.keys(false);
  return CREDENTIAL_KEYS.reduce((acc, key) => {
    acc[key] = keys.includes(key);
    return acc;
  }, {});
}

export async function clearCredentials() {
  for (const key of CREDENTIAL_KEYS) {
    await SecureStorage.remove(key, false);
  }
  lock();
}

// --- datos de factura (no sensibles) ---------------------------------------

export function saveBillData(data) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    localStorage.setItem(BILL_PREFIX + key, String(value));
  }
}

export function readBillData() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BILL_PREFIX)) {
      out[key.slice(BILL_PREFIX.length)] = localStorage.getItem(key);
    }
  }
  return out;
}
