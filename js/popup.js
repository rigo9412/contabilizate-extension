// Popup mínimo: todo lo demás (e.firma, plantillas, descargas, respaldo) vive
// en la app completa (app/index.html).

const PORTAL_URL = "https://portal.facturaelectronica.sat.gob.mx/";

// Mismas llaves que escriben la app (app/src/lib/sat-fill.ts) y el popup anterior.
const BILL_KEYS = [
  "rfc", "razonSocial", "codigoPostal", "regimenFiscal", "usoCFDI",
  "conceptoDescripcion", "conceptoProducto", "conceptoUnidad", "conceptoCantidad",
  "conceptoValor", "conceptoId", "conceptoImpuesto", "conceptoIva", "conceptoRetIva",
  "conceptoRetIsr", "subtotal", "impuestosTrasladados", "impuestosRetenidos", "total",
  "billStagedBy",
];

async function showVaultStatus() {
  const el = document.getElementById("vaultStatus");
  const [session, local] = await Promise.all([
    chrome.storage.session.get("llave.key"),
    chrome.storage.local.get("llave.key"),
  ]);
  const unlocked = Boolean(session["llave.key"] || local["llave.key"]);
  el.textContent = unlocked ? "Desbloqueada" : "Bloqueada";
  el.classList.toggle("ok", unlocked);
}

async function showPendingBill() {
  const data = await chrome.storage.local.get(BILL_KEYS);
  const pending = document.getElementById("pending");
  if (!data.razonSocial || !data.conceptoDescripcion) {
    pending.hidden = true;
    return;
  }
  pending.hidden = false;
  document.getElementById("pendingTitle").textContent = data.razonSocial;
  const total = Number(data.total);
  document.getElementById("pendingDetail").textContent =
    `${data.conceptoDescripcion} · ${Number.isFinite(total) && data.total ? `$${total.toFixed(2)}` : "sin total"}`;
}

document.getElementById("btnOpenApp").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html") });
});

document.getElementById("btnPortal").addEventListener("click", () => {
  chrome.tabs.create({ url: PORTAL_URL });
});

document.getElementById("btnDiscard").addEventListener("click", async () => {
  await chrome.storage.local.remove(BILL_KEYS);
  showPendingBill();
});

showVaultStatus();
showPendingBill();
