export const SAT_PORTAL_URL = "https://portal.facturaelectronica.sat.gob.mx/";

export const RFC_REGEX = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

export function openSatPortal() {
  chrome.tabs.create({ url: SAT_PORTAL_URL });
}
