// Cliente mínimo de Google Drive (API v3) para la carpeta oculta de la app
// (appDataFolder): solo esta extensión la ve y no aparece entre tus archivos.

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const SYNC_FILE_NAME = "contabilizate-sync.json";

export interface DriveFile {
  id: string;
  modifiedTime?: string;
}

export interface DriveClient {
  find(): Promise<DriveFile | null>;
  download(id: string): Promise<string>;
  upload(content: string, id?: string): Promise<DriveFile>;
}

export class DriveNotConfiguredError extends Error {
  constructor() {
    super("Falta configurar el Client ID de Google en la extensión");
  }
}

export function isDriveConfigured(): boolean {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id;
  return Boolean(clientId && !clientId.startsWith("__"));
}

/**
 * Token de la cuenta de Google con la que está conectado el perfil de Chrome.
 * Sin `interactive` falla si el usuario nunca dio permiso, en vez de abrir la ventana.
 */
export async function getToken(interactive: boolean): Promise<string> {
  if (!isDriveConfigured()) throw new DriveNotConfiguredError();
  const result = await chrome.identity.getAuthToken({ interactive });
  if (!result.token) throw new Error("Google no devolvió un token");
  return result.token;
}

export async function disconnect(): Promise<void> {
  try {
    const token = await getToken(false);
    await chrome.identity.removeCachedAuthToken({ token });
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // Si no había token no hay nada que revocar.
  }
}

export function createDriveClient(token: string): DriveClient {
  const request = async (url: string, init: RequestInit = {}) => {
    const resp = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (resp.status === 401) {
      // Token vencido o revocado: se descarta para que el siguiente intento pida otro.
      await chrome.identity.removeCachedAuthToken({ token });
      throw new Error("La sesión de Google expiró, vuelve a sincronizar");
    }
    if (!resp.ok) throw new Error(`Google Drive respondió ${resp.status}: ${await resp.text()}`);
    return resp;
  };

  return {
    async find() {
      const q = encodeURIComponent(`name = '${SYNC_FILE_NAME}' and trashed = false`);
      const resp = await request(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
      const { files } = (await resp.json()) as { files: DriveFile[] };
      return files[0] ?? null;
    },

    async download(id) {
      const resp = await request(`${API}/files/${id}?alt=media`);
      return resp.text();
    },

    async upload(content, id) {
      if (id) {
        const resp = await request(`${UPLOAD}/files/${id}?uploadType=media&fields=id,modifiedTime`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: content,
        });
        return resp.json();
      }
      const boundary = `contabilizate-${crypto.randomUUID()}`;
      const metadata = { name: SYNC_FILE_NAME, parents: ["appDataFolder"], mimeType: "application/json" };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
      const resp = await request(`${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      return resp.json();
    },
  };
}
