const URL_SIGNATURE = "https://portal.facturaelectronica.sat.gob.mx/Sellado/Index/"
const URL_BILL =
  "https://portal.facturaelectronica.sat.gob.mx/Factura/GeneraFactura";
const URL_LOGIN_FIEL =
  "https://cfdiau.sat.gob.mx/nidp/app/login?id=SATx509Custom";
const URL_PASSWORD_LOGIN =
  "https://cfdiau.sat.gob.mx/nidp/wsfed/ep?id=SATUPCFDiCon";

function ActiveQueryByURL(tabId, url) {
  if (url) {
  

    if (url.includes(URL_BILL)) {
      console.log("INJECTAR FACTURA:", url);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["js/forms/fill-form-bill.js"]
      });
    } else if (
      url.includes(URL_LOGIN_FIEL) ||
      url.includes(URL_PASSWORD_LOGIN)
    ) {
      console.log("INJECTAR LOGIN:", url);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["js/forms/fill-form-sign-in.js"]
      });
    }
    else if (url.includes(URL_SIGNATURE)) {
      console.log("INJECTAR SIGNATURE:", url);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["js/forms/fill-form-sello.js"]
      });
    }
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    ActiveQueryByURL(activeInfo.tabId, tab.url);
  });
});

// Listener para cambios en el estado de una pestaña
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
 
  if (changeInfo.status === "complete") {
    ActiveQueryByURL(tabId, tab.url);
   //console.log("La pestaña se actualizó:", tab.title, tab.url);
  }
});

 