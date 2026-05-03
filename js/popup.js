//import { saveFile } from "./form-configuration-extension.js";

(async () => {
  try {
    // Inicializar pestañas primero para que funcionen aun si hay errores en la carga de datos
    initTabs();

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

    // Descargar plantilla JSON
    document.getElementById("downloadJsonTemplate")?.addEventListener("click", () => {
      const jsonTemplate = {
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
          "iva": "0",
          "retIva": "0",
          "retIsr": "0"
        },
        "total": "0.00",
        "subtotal": "0.00",
        "impuestosTrasladados": "0.00",
        "impuestosRetenidos": "0.00"
      };
      const blob = new Blob([JSON.stringify(jsonTemplate, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla-factura.json";
      a.click();
      URL.revokeObjectURL(url);
      showMessage("Plantilla JSON descargada", "success");
    });

    // Descargar plantilla CSV
    document.getElementById("downloadCsvTemplate")?.addEventListener("click", () => {
      const headers = [
        "rfc","razonSocial","codigoPostal","regimenFiscal","usoCFDI",
        "conceptoDescripcion","conceptoProducto","conceptoUnidad","conceptoCantidad","conceptoValor",
        "conceptoId","conceptoImpuesto","conceptoIva","conceptoRetIva","conceptoRetIsr",
        "total","subtotal","impuestosTrasladados","impuestosRetenidos"
      ];
      const exampleRow = [
        "XAXX010101000","PUBLICO GENERAL","88240","Sin obligaciones fiscales","Sin efectos fiscales.",
        "Servicio basico","Programadores de computador","Unidad de servicio","1","1.00",
        "1","02","0","0","0",
        "0.00","0.00","0.00","0.00"
      ];
      const csvContent = [headers.join(","), exampleRow.join(",")].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla-factura.csv";
      a.click();
      URL.revokeObjectURL(url);
      showMessage("Plantilla CSV descargada", "success");
    });

    // Cargar CSV
    document.getElementById("loadCsv")?.addEventListener("click", async () => {
      const fileInput = document.getElementById("csvInput");
      if (!fileInput || fileInput.files.length === 0) {
        showMessage("Seleccione un archivo CSV primero", "error");
        return;
      }
      try {
        const file = fileInput.files[0];
        const text = await file.text();
        const rows = parseCsv(text);
        if (rows.length < 2) {
          throw new Error("El CSV no tiene datos (se requiere encabezado y al menos una fila)");
        }
        const headers = rows[0].map(h => h.trim());
        const dataRow = rows[1];
        const getValue = (name) => {
          const idx = headers.indexOf(name);
          return idx >= 0 ? dataRow[idx] : "";
        };
        const storageData = {
          rfc: getValue("rfc"),
          razonSocial: getValue("razonSocial"),
          codigoPostal: getValue("codigoPostal"),
          regimenFiscal: getValue("regimenFiscal"),
          usoCFDI: getValue("usoCFDI"),
          conceptoDescripcion: getValue("conceptoDescripcion"),
          conceptoProducto: getValue("conceptoProducto"),
          conceptoUnidad: getValue("conceptoUnidad"),
          conceptoCantidad: getValue("conceptoCantidad"),
          conceptoValor: getValue("conceptoValor"),
          conceptoId: getValue("conceptoId"),
          conceptoImpuesto: getValue("conceptoImpuesto"),
          conceptoIva: getValue("conceptoIva"),
          conceptoRetIva: getValue("conceptoRetIva"),
          conceptoRetIsr: getValue("conceptoRetIsr"),
          total: getValue("total"),
          subtotal: getValue("subtotal"),
          impuestosTrasladados: getValue("impuestosTrasladados"),
          impuestosRetenidos: getValue("impuestosRetenidos")
        };
        await new Promise((resolve, reject) => {
          chrome.storage.local.set(storageData, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        showMessage("Datos CSV guardados correctamente", "success");
        initDataBill();
        // También poblar el textarea JSON para que el usuario vea los datos en JSON
        const jsonEquivalent = {
          rfc: storageData.rfc,
          razonSocial: storageData.razonSocial,
          codigoPostal: storageData.codigoPostal,
          regimenFiscal: storageData.regimenFiscal,
          usoCFDI: storageData.usoCFDI,
          concepto: {
            descripcion: storageData.conceptoDescripcion,
            producto: storageData.conceptoProducto,
            unidad: storageData.conceptoUnidad,
            cantidad: storageData.conceptoCantidad,
            valor: storageData.conceptoValor,
            id: storageData.conceptoId,
            impuesto: storageData.conceptoImpuesto,
            iva: storageData.conceptoIva,
            retIva: storageData.conceptoRetIva,
            retIsr: storageData.conceptoRetIsr
          },
          total: storageData.total,
          subtotal: storageData.subtotal,
          impuestosTrasladados: storageData.impuestosTrasladados,
          impuestosRetenidos: storageData.impuestosRetenidos
        };
        const jsonInput = document.getElementById("jsonInput");
        if (jsonInput) {
          jsonInput.value = JSON.stringify(jsonEquivalent, null, 2);
        }
      } catch (error) {
        console.error("Error al procesar el CSV:", error);
        showMessage(`Error: ${error.message}`, "error");
      }
    });

    function parseCsv(text) {
      const rows = [];
      let currentRow = [];
      let currentCell = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (inQuotes) {
          if (char === '"') {
            if (nextChar === '"') {
              currentCell += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            currentCell += char;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === ',') {
            currentRow.push(currentCell.trim());
            currentCell = "";
          } else if (char === '\n') {
            currentRow.push(currentCell.trim());
            if (currentRow.length > 1 || currentRow[0] !== "") {
              rows.push(currentRow);
            }
            currentRow = [];
            currentCell = "";
          } else if (char === '\r') {
            // skip carriage return, newline will be handled on \n
          } else {
            currentCell += char;
          }
        }
      }
      if (currentCell !== "" || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || currentRow[0] !== "") {
          rows.push(currentRow);
        }
      }
      return rows;
    }

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

      if (!passwordStatus || !rfcStatus || !inputCertificadoStatus || !inputCertificadoKeyStatus) return

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
          impuestosRetenidos.innerHTML = result.impuestosRetenidos ?? "No Impuestos Retenidos";

      });
    }

    // You can now use the imported modules
    console.log("Modules imported successfully");

    // Manual tab handler as fallback
    function initTabs() {
      const tabButtons = document.querySelectorAll('#mainTabs .nav-link');
      const tabPanes = document.querySelectorAll('.tab-pane');

      tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.preventDefault();

          // Remove active class from all buttons
          tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
          });

          // Add active class to clicked button
          button.classList.add('active');
          button.setAttribute('aria-selected', 'true');

          // Hide all panes
          tabPanes.forEach(pane => {
            pane.classList.remove('show', 'active');
          });

          // Show target pane
          const targetId = button.getAttribute('data-target');
          const targetPane = document.querySelector(targetId);
          if (targetPane) {
            targetPane.classList.add('show', 'active');
          }
        });
      });
    }

    // initTabs() movido al inicio

  } catch (error) {
    console.error("Error importing modules:", error);
  }
})();
