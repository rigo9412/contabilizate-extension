import { db, save, VAULT_ID } from "./db";
import { decryptJson, encryptJson } from "./crypto";
import type { Vault, VaultSecrets } from "./types";

// Llaves que leen los scripts de llenado (js/forms/fill-form-sign-in.js).
const LEGACY_KEYS = ["certificado.cer", "llave.key", "passwordCertificado"] as const;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Cifra el .cer, el .key y la contraseña con la propia contraseña de la e.firma. */
export async function saveVault(cer: File, key: File, password: string): Promise<void> {
  const secrets: VaultSecrets = {
    cer: await readAsDataUrl(cer),
    key: await readAsDataUrl(key),
    password,
  };
  await save<Vault>(db.vault, {
    id: VAULT_ID,
    cerFileName: cer.name,
    keyFileName: key.name,
    payload: await encryptJson(secrets, password),
  });
}

export async function readVault(password: string): Promise<VaultSecrets> {
  const vault = await db.vault.get(VAULT_ID);
  if (!vault || vault.deletedAt) throw new Error("No hay e.firma guardada");
  return decryptJson<VaultSecrets>(vault.payload, password);
}

function legacyEntries(secrets: VaultSecrets) {
  const file = (dataUrl: string) => ({
    content: dataUrl,
    type: dataUrl.slice(5, dataUrl.indexOf(";")),
    timestamp: Date.now(),
  });
  return {
    "certificado.cer": file(secrets.cer),
    "llave.key": file(secrets.key),
    passwordCertificado: secrets.password,
  };
}

/**
 * Deja la e.firma descifrada disponible para los scripts que inician sesión en
 * el SAT. Por defecto va a storage.session (solo en memoria, se borra al cerrar
 * el navegador); `remember` la deja en storage.local como hacía el popup.
 */
export async function unlockVault(password: string, remember: boolean): Promise<void> {
  const secrets = await readVault(password);
  const entries = legacyEntries(secrets);
  if (remember) {
    await chrome.storage.local.set(entries);
  } else {
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
    await chrome.storage.session.set(entries);
  }
}

export async function lockVault(): Promise<void> {
  await chrome.storage.session.remove([...LEGACY_KEYS]);
  await chrome.storage.local.remove([...LEGACY_KEYS]);
}

export async function vaultStatus(): Promise<"locked" | "session" | "remembered"> {
  const [session, local] = await Promise.all([
    chrome.storage.session.get("llave.key"),
    chrome.storage.local.get("llave.key"),
  ]);
  if (local["llave.key"]) return "remembered";
  if (session["llave.key"]) return "session";
  return "locked";
}
