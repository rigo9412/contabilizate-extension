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

    // Agregar el manejador para el formulario JSON
    document.getElementById("jsonForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const jsonInput = document.getElementById("jsonInput");
        if (!jsonInput) {
          throw new Error("No se encontró el campo de entrada JSON");
        }

        const jsonData = JSON.parse(jsonInput.value);
        const storageData = {
          rfc: jsonData.rfc,
          razonSocial: jsonData.razonSocial,
          codigoPostal: jsonData.codigoPostal,
          regimenFiscal: jsonData.regimenFiscal,
          usoCFDI: jsonData.usoCFDI,
          conceptoDescripcion: jsonData.concepto?.descripcion,
          conceptoProducto: jsonData.concepto?.producto,
          conceptoUnidad: jsonData.concepto?.unidad,
          conceptoCantidad: jsonData.concepto?.cantidad,
          conceptoValor: jsonData.concepto?.valor,
          conceptoId: jsonData.concepto?.id,
          conceptoImpuesto: jsonData.concepto?.impuesto,
          conceptoIva: jsonData.concepto?.iva,
          conceptoRetIva: jsonData.concepto?.retIva,
          conceptoRetIsr: jsonData.concepto?.retIsr,
          total: jsonData?.total,
          subtotal: jsonData?.subtotal,
          impuestosTrasladados: jsonData?.impuestosTrasladados,
          impuestosRetenidos: jsonData?.impuestosRetenidos



        };

        // Guardar en storage
        await new Promise((resolve, reject) => {
          chrome.storage.local.set(storageData, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });

        showMessage("Datos JSON guardados correctamente", "success");
        initDataBill(); // Actualizar la visualización
      } catch (error) {
        console.error("Error al procesar el JSON:", error);
        showMessage(`Error: ${error.message}`, "error");
      }
    });

    // Agregar botón para cargar ejemplo JSON
    document.getElementById("loadJsonExample")?.addEventListener("click", () => {
      const jsonExample = {
        "rfc": "XAXX010101000",
        "razonSocial": "PUBLICO GENERAL",
        "codigoPostal": "88240",
        "regimenFiscal": "Sin obligaciones fiscales",
        "usoCFDI": "Sin efectos fiscales.",
        "concepto": {
          "descripcion": "Servicio basico",
          "producto": "Programadores de computador",
          "unidad": "Unidad de servicio",
          "cantidad": "1",
          "valor": "1.00",
          "id": "1",
          "impuesto": "02",
          "iva": "16",
          "retIva": "00",
          "retIsr": "00"
        },
        "total": "1.16",
        "subtotal": "1.00",
        "impuestosTrasladados": "0.16",
        "impuestosRetenidos": ""
      }
      

      const jsonInput = document.getElementById("jsonInput");
      if (jsonInput) {
        jsonInput.value = JSON.stringify(jsonExample, null, 2);
      }
    });

    // Agregar botón para copiar ejemplo JSON
    document.getElementById("copyJsonExample")?.addEventListener("click", () => {
      const jsonExample = {
        "rfc": "XAXX010101000",
        "razonSocial": "PUBLICO GENERAL",
        "codigoPostal": "88240",
        "regimenFiscal": "Sin obligaciones fiscales",
        "usoCFDI": "Sin efectos fiscales.",
        "concepto": {
          "descripcion": "Servicio basico",
          "producto": "Programadores de computador",
          "unidad": "Unidad de servicio",
          "cantidad": "1",
          "valor": "1.00",
          "id": "1",
          "impuesto": "02",
          "iva": "16",
          "retIva": "00",
          "retIsr": "00"
        },
        "total": "1.16",
        "subtotal": "1.00",
        "impuestosTrasladados": "0.16",
        "impuestosRetenidos": ""
      }
      

      // Copiar al portapapeles
      navigator.clipboard.writeText(JSON.stringify(jsonExample, null, 2))
        .then(() => {
          showMessage("JSON copiado al portapapeles", "success");
        })
        .catch(err => {
          console.error('Error al copiar:', err);
          showMessage("Error al copiar el JSON", "error");
        });
    });

    initConfiguration();
    initDataBill();

    
    // Función helper para mostrar mensajes
    function showMessage(message, type) {
      // Implementar según tu UI (puede ser un toast, alert, etc.)
      const messageElement = document.createElement("div");
      messageElement.className = `alert alert-${type}`;
      messageElement.textContent = message;
      document.getElementById("alert-container").appendChild(messageElement);
      
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
          inputCertificadoStatus.classList.add("bg-success");
          inputCertificadoStatus.textContent = "Cargado";
        })
        .catch(() => {
          inputCertificadoStatus.classList?.remove("bg-success");
          inputCertificadoStatus.textContent = "No Cargado";
        });

      formConfig
        .readFile("llave.key")
        .then((data) => {
          inputCertificadoKeyStatus.classList?.add("bg-success");
          inputCertificadoKeyStatus.textContent = "Cargada";
        })
        .catch(() => {
          inputCertificadoKeyStatus.textContent = "No Cargada";
          inputCertificadoKeyStatus.classList?.remove("bg-success");
        });

      chrome.storage.local.get(["rfc"], function (result) {
        if (result.rfc) {
          rfcStatus.classList.add("bg-success");
          rfcStatus.textContent = "Cargado";
        } else {
          rfcStatus.classList.remove("bg-success");
          rfcStatus.textContent = "No Cargado";
        }
      });

      chrome.storage.local.get(["passwordCertificado"], function (result) {
        if (result.passwordCertificado) {
          passwordStatus.classList.add("bg-success");
          passwordStatus.textContent = "Cargada";
        } else {
          passwordStatus.classList.remove("bg-success");
          passwordStatus.textContent = "No Cargada";
        }
      });
    }

    function initDataBill() {
      chrome.storage.local.get(null, (result) => {
     
      
          const rfc = document.getElementById("rfc");
          if (rfc) rfc.innerHTML = result.rfc ?? "No RFC";

          // If you have more fields in your HTML, you can display them like this:
          const razonSocial = document.getElementById("razonSocial");
          if (razonSocial)
            razonSocial.innerHTML =
              result.razonSocial ?? "No Razón Social";

          const codigoPostal = document.getElementById("codigoPostal");
          if (codigoPostal)
            codigoPostal.innerHTML =
              result.codigoPostal ?? "No CP";

          const regimentFiscal = document.getElementById("regimentFiscalId");
          if (regimentFiscal)
            regimentFiscal.innerHTML =
              result.regimentFiscalId ?? "No Régimen";

          const usoCFDI = document.getElementById("usoCFDI");
          if (usoCFDI)
            usoCFDI.innerHTML =
              result.useCFDI ?? "No Uso CFDI";

          const conceptoDescripcion = document.getElementById("conceptoDescripcion");
          if (conceptoDescripcion)
            conceptoDescripcion.innerHTML =
              result.conceptoDescripcion ?? "No Descripción";

          const conceptoProducto = document.getElementById("conceptoProducto");
          if (conceptoProducto)
            conceptoProducto.innerHTML =
              result.conceptoProducto ?? "No Producto";

          const conceptoUnidad = document.getElementById("conceptoUnidad");
          if (conceptoUnidad)
            conceptoUnidad.innerHTML =
              result.conceptoUnidad ?? "No Unidad";

          const conceptoCantidad = document.getElementById("conceptoCantidad");
          if (conceptoCantidad)
            conceptoCantidad.innerHTML =
              result.conceptoCantidad ?? "No Cantidad";

          const conceptoValor = document.getElementById("conceptoValor");
          if (conceptoValor)
            conceptoValor.innerHTML =
              result.conceptoValor ?? "No Valor";

          const conceptoSujectoImpuesto = document.getElementById("conceptoSujectoImpuesto");
          if (conceptoSujectoImpuesto)
            conceptoSujectoImpuesto.innerHTML =
              result.conceptoImpuesto ?? "No Impuesto";

          const conceptoIVA = document.getElementById("conceptoIVA");
          if (conceptoIVA)
            conceptoIVA.innerHTML =
              result.conceptoIva ?? "No IVA";

          const conceptoRetencionIVA = document.getElementById("conceptoRetencionIVA");
          if (conceptoRetencionIVA)
            conceptoRetencionIVA.innerHTML =
              result.conceptoRetIva ?? "No RetIVA";

          const conceptoRetencionISR = document.getElementById("conceptoRetencionISR");
          if (conceptoRetencionISR)
            conceptoRetencionISR.innerHTML =
              result.conceptoRetIsr ?? "No RetISR";

          const total = document.getElementById("total");
          if (total)
            total.innerHTML =
              result.total ?? "No Total";
          const subtotal = document.getElementById("subtotal");
          if (subtotal)
            subtotal.innerHTML =
              result.subtotal ?? "No Subtotal";
          const impuestosTrasladados = document.getElementById("impuestosTrasladados");
          if (impuestosTrasladados)
            impuestosTrasladados.innerHTML =
              result.impuestosTrasladados ?? "No Impuestos Trasladados";
          const impuestosRetenidos = document.getElementById("impuestosRetenidos");
          if (impuestosRetenidos)
            impuestosRetenidos.innerHTML =  result.impuestosRetenidos ?? "No Impuestos Retenidos";
        
      });
    }

    // You can now use the imported modules
    console.log("Modules imported successfully");
  } catch (error) {
    console.error("Error importing modules:", error);
  }
})();
