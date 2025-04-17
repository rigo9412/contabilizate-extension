//import { saveFile } from "./form-configuration-extension.js";

(async () => {
  try {
    const formConfig = await import(
      chrome.runtime.getURL("js/utils/form-configuration-extension.js")
    );
    
    document.getElementById("btnSite")?.addEventListener("click", () => {
      chrome.tabs.create({
        url: "https://portal.facturaelectronica.sat.gob.mx/",
      });
    });

    document.getElementById("btnStartProcess")?.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            SignUpByFirmaElectronica();
          },
        });
      });
    });

    document.getElementById("formKeys")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      
      try {
        // Obtener elementos del DOM una sola vez
        const elements = {
          certificado: document.getElementById("fileInputCertificado"),
          certificadoKey: document.getElementById("fileInputCertificadoKey"),
          password: document.getElementById("passwordInputCertificado"),
          rfc: document.getElementById("rfcInput")
        };
    
        // Validar que todos los campos requeridos estén presentes
        if (!elements.certificado || !elements.certificadoKey || !elements.password || !elements.rfc) {
          throw new Error("No se encontraron todos los elementos del formulario");
        }
    
        // Guardar archivos
        const savePromises = [];
        
        if (elements.certificado.files.length > 0) {
          savePromises.push(formConfig.saveFile(elements.certificado.files[0], "certificado.cer"));
        }
    
        if (elements.certificadoKey.files.length > 0) {
          savePromises.push(formConfig.saveFile(elements.certificadoKey.files[0], "llave.key"));
        }
    
        // Esperar a que se guarden los archivos
        await Promise.all(savePromises);
    
        // Guardar datos en storage
        const storageData = {};
        
        if (elements.password.value.trim()) {
          storageData.passwordCertificado = elements.password.value;
        }
    
        if (elements.rfc.value.trim()) {
          // Validar formato RFC
          const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
          if (!rfcRegex.test(elements.rfc.value)) {
            throw new Error("Formato de RFC inválido");
          }
          storageData.rfc = elements.rfc.value;
        }
    
        // Guardar en storage solo si hay datos para guardar
        if (Object.keys(storageData).length > 0) {
          await new Promise((resolve, reject) => {
            chrome.storage.local.set(storageData, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          });
        }
    
        // Mostrar mensaje de éxito
        showMessage("Información guardada correctamente", "success");
        
      } catch (error) {
        console.error("Error al guardar la información:", error);
        showMessage(`Error: ${error.message}`, "error");
      }
    });


    

    initConfiguration();
    initDataBill();


    
    // Función helper para mostrar mensajes
    function showMessage(message, type) {
      // Implementar según tu UI (puede ser un toast, alert, etc.)
      const messageElement = document.createElement("div");
      messageElement.className = `alert alert-${type}`;
      messageElement.textContent = message;
      document.getElementById("formKeys").appendChild(messageElement);
      
      // Remover mensaje después de 3 segundos
      setTimeout(() => messageElement.remove(), 3000);
    }

    function initConfiguration() {
      const passwordStatus = document.getElementById("passwordStatus");
      const rfcStatus = document.getElementById("rfcStatus");
      const inputCertificadoStatus = document.getElementById(
        "fileInputCertificadoStatus"
      );
      const inputCertificadoKeyStatus = document.getElementById(
        "fileInputCertificadoKeyStatus"
      );

      if(!passwordStatus || !rfcStatus || !inputCertificadoStatus || !inputCertificadoKeyStatus ) return

      formConfig
        .readFile("certificado.cer")
        .then((data) => {
          inputCertificadoStatus.classList.add("green");
          inputCertificadoStatus.textContent = "Cargado";
        })
        .catch(() => {
          inputCertificadoStatus.classList?.remove("green");
          inputCertificadoStatus.textContent = "No Cargado";
        });

      formConfig
        .readFile("llave.key")
        .then((data) => {
          inputCertificadoKeyStatus.classList?.add("green");
          inputCertificadoKeyStatus.textContent = "Cargada";
        })
        .catch(() => {
          inputCertificadoKeyStatus.textContent = "No Cargada";
          inputCertificadoKeyStatus.classList?.remove("green");
        });

      chrome.storage.local.get(["rfc"], function (result) {
        if (result.rfc) {
          rfcStatus.classList.add("green");
          rfcStatus.textContent = "Cargado";
        } else {
          rfcStatus.classList.remove("green");
          rfcStatus.textContent = "No Cargado";
        }
      });

      chrome.storage.local.get(["passwordCertificado"], function (result) {
        if (result.passwordCertificado) {
          passwordStatus.classList.add("green");
          passwordStatus.textContent = "Cargada";
        } else {
          passwordStatus.classList.remove("green");
          passwordStatus.textContent = "No Cargada";
        }
      });
    }

    function initDataBill() {
      chrome.storage.local.get(["contabilizateData"], function (result) {
     
        if (result.contabilizateData) {
          const rfc = document.getElementById("rfc");
          if (rfc) rfc.innerHTML = result.contabilizateData.rfc ?? "No RFC";

          // If you have more fields in your HTML, you can display them like this:
          const razonSocial = document.getElementById("razonSocial");
          if (razonSocial)
            razonSocial.innerHTML =
              result.contabilizateData.razonSocial ?? "No Razón Social";

          const codigoPostal = document.getElementById("codigoPostal");
          if (codigoPostal)
            codigoPostal.innerHTML =
              result.contabilizateData.codigoPostal ?? "No CP";

          const regimentFiscal = document.getElementById("regimentFiscalId");
          if (regimentFiscal)
            regimentFiscal.innerHTML =
              result.contabilizateData.regimentFiscalId ?? "No Régimen";

          const usoCFDI = document.getElementById("usoCFDI");
          if (usoCFDI)
            usoCFDI.innerHTML =
              result.contabilizateData.useCFDI ?? "No Uso CFDI";
        }
      });
    }

    // You can now use the imported modules
    console.log("Modules imported successfully");
  } catch (error) {
    console.error("Error importing modules:", error);
  }
})();
