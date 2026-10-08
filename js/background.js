const URL_SIGNATURE = "https://portal.facturaelectronica.sat.gob.mx/Sellado/Index/"
const URL_BILL =
  "https://portal.facturaelectronica.sat.gob.mx/Factura/GeneraFactura";
const URL_LOGIN_FIEL =
  "https://cfdiau.sat.gob.mx/nidp/app/login?id=SATx509Custom";
const URL_PASSWORD_LOGIN =
  "https://cfdiau.sat.gob.mx/nidp/wsfed/ep?id=SATUPCFDiCon";
// Login del portal de declaraciones (pstcdypisr): mismo formulario del SAT en otro
// dominio; el script de login solo actúa si ve "Acceso por contraseña" o "Acceso con e.firma".
const URL_DECLARATION_LOGIN = "https://loginda.siat.sat.gob.mx/nidp/";
const DECLARATION_REMINDER_ALARM = "monthly-declaration-reminder";
const DECLARATION_REMINDER_KEY = "monthlyDeclarationReminderEnabled";
const DECLARATION_REMINDER_PERMISSIONS = ["alarms", "notifications"];
let declarationAlarmListenerAdded = false;
let declarationNotificationListenerAdded = false;

function nextDeclarationReminderDate(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), 17, 9, 0, 0, 0);
  if (next <= now) next.setMonth(next.getMonth() + 1);
  return next;
}

function clearDeclarationReminderAlarm() {
  if (chrome.alarms) chrome.alarms.clear(DECLARATION_REMINDER_ALARM);
}

function registerDeclarationReminderListeners() {
  if (chrome.alarms && !declarationAlarmListenerAdded) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== DECLARATION_REMINDER_ALARM) return;

      chrome.storage.local.get(DECLARATION_REMINDER_KEY, (settings) => {
        if (!settings[DECLARATION_REMINDER_KEY]) return;
        if (!chrome.notifications) {
          console.error("No se pudo mostrar el recordatorio de declaración: faltan permisos de notificaciones.");
          return;
        }
        const reminderDate = new Date(alarm.scheduledTime);
        const period = new Intl.DateTimeFormat("es-MX", {
          month: "long",
          year: "numeric",
        }).format(new Date(reminderDate.getFullYear(), reminderDate.getMonth() - 1, 1));

        chrome.notifications.create("monthly-declaration-reminder", {
          type: "basic",
          iconUrl: "128.png",
          title: "Declaración mensual",
          message: `Recuerda revisar y presentar en el SAT la declaración de ${period}.`,
        }, () => {
          if (chrome.runtime.lastError) {
            console.error("No se pudo mostrar el recordatorio de declaración:", chrome.runtime.lastError.message);
          }
        });
        scheduleDeclarationReminder();
      });
    });
    declarationAlarmListenerAdded = true;
  }

  if (chrome.notifications && !declarationNotificationListenerAdded) {
    chrome.notifications.onClicked.addListener((notificationId) => {
      if (notificationId !== "monthly-declaration-reminder") return;
      chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html#/declaration") });
      chrome.notifications.clear(notificationId);
    });
    declarationNotificationListenerAdded = true;
  }
}

function scheduleDeclarationReminder() {
  chrome.storage.local.get(DECLARATION_REMINDER_KEY, (settings) => {
    if (!settings[DECLARATION_REMINDER_KEY]) {
      clearDeclarationReminderAlarm();
      return;
    }
    chrome.permissions.contains({ permissions: DECLARATION_REMINDER_PERMISSIONS }, (granted) => {
      if (!granted) {
        chrome.storage.local.set({ [DECLARATION_REMINDER_KEY]: false });
        clearDeclarationReminderAlarm();
        return;
      }
      registerDeclarationReminderListeners();
      chrome.alarms.create(DECLARATION_REMINDER_ALARM, {
        when: nextDeclarationReminderDate().getTime(),
      });
    });
  });
}

function disableDeclarationReminder(sendResponse) {
  chrome.storage.local.set({ [DECLARATION_REMINDER_KEY]: false }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    clearDeclarationReminderAlarm();
    sendResponse({ ok: true, enabled: false });
  });
}

chrome.runtime.onInstalled.addListener(scheduleDeclarationReminder);
chrome.runtime.onStartup.addListener(scheduleDeclarationReminder);
registerDeclarationReminderListeners();

chrome.permissions.onAdded.addListener((added) => {
  if (!added.permissions?.some((permission) => DECLARATION_REMINDER_PERMISSIONS.includes(permission))) return;
  registerDeclarationReminderListeners();
});

chrome.permissions.onRemoved.addListener((removed) => {
  if (!removed.permissions?.some((permission) => DECLARATION_REMINDER_PERMISSIONS.includes(permission))) return;
  chrome.storage.local.set({ [DECLARATION_REMINDER_KEY]: false });
  clearDeclarationReminderAlarm();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "declaration-reminder:get") {
    chrome.permissions.contains({ permissions: DECLARATION_REMINDER_PERMISSIONS }, (granted) => {
      chrome.storage.local.get(DECLARATION_REMINDER_KEY, (settings) => {
        sendResponse({ enabled: granted && settings[DECLARATION_REMINDER_KEY] === true });
      });
    });
    return true;
  }

  if (message?.type === "declaration-reminder:enable") {
    chrome.permissions.contains({ permissions: DECLARATION_REMINDER_PERMISSIONS }, (granted) => {
      if (!granted) {
        sendResponse({ ok: false, error: "Faltan los permisos para crear recordatorios." });
        return;
      }
      chrome.storage.local.set({ [DECLARATION_REMINDER_KEY]: true }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        scheduleDeclarationReminder();
        sendResponse({ ok: true, enabled: true });
      });
    });
    return true;
  }

  if (message?.type === "declaration-reminder:disable") {
    disableDeclarationReminder(sendResponse);
    return true;
  }
});

// Los scripts de llenado corren como content scripts y necesitan leer la
// e.firma desbloqueada que la app deja en storage.session.
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

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
      url.includes(URL_PASSWORD_LOGIN) ||
      url.startsWith(URL_DECLARATION_LOGIN)
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
