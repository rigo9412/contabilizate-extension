const CONFIG = {
  TIMEOUTS: {
    VISIBILITY: 2500,
    DELAY: 500,
    SHORT_DELAY: 25,
    WAIT_MENU: 200,
  },
};

var bodyElement = document.body;
var FORM_BILL_KEYS = {
  rfc: {
    "view-model": "E1350003PFAC085Descrip",
    tabindex: "13",
    id: "135textboxautocomplete55",
  },
  razonSocial: {
    "view-model": "E1350003PFAC008",
    tabindex: "14",
    id: "135textbox60",
  },
  codigoPostal: {
    "view-model": "E1350003PFAC101",

    tabindex: "15",
    id: "135textbox61",
  },
  regimenFiscal: {
    "view-model": "E1350003PFAC103",

    tabindex: "16",
    id: "135textboxautocomplete62",
  },
  usoFactura: {
    "view-model": "E1350003PFAC009Descrip",

    tabindex: "17",
    id: "135textboxautocomplete66",
  },

  concepto_descripcion: {
    "view-model": "E1350001PFAC083",
    tabindex: "30",
    id: "135textboxautocomplete113",
  },
  concepto_cantidad: {
    "view-model": "E1350001PFAC016",

    tabindex: "34",
    id: "135textbox114",
  },
  concepto_valorUnitario: {
    "view-model": "E1350001PFAC017",

    tabindex: "35",
    id: "135textbox119",
  },
  concepto_noIdentificacion: {
    "view-model": "E1350001PFAC020",

    tabindex: "39",
    id: "135textbox120",
  },
  concepto_unidadDeMedida: {
    "view-model": "E1350001PFAC015",

    tabindex: "32",
    id: "135textboxautocomplete123",
  },
  concepto_productoServicio: {
    "view-model": "E1350001PFAC013",

    tabindex: "31",
    id: "135textboxautocomplete118",
  },
  concepto_descuento: {
    "view-model": "E1350001PFAC019",

    tabindex: "37",
    id: "135textbox129",
  },
  concepto_impuesto: {
    "view-model": "E1350001PFAC104",

    tabindex: "",
    id: "135select115",
  },
  concepto_impuesto_2: {
    "view-model": "E1350010PObjetoImp",

    tabindex: "",
    id: "135select79",
  },
 

  concepto_no_impuesto: {
    "view-model": "E1350001PFAC069",

    tabindex: "34",
    id: "135checkbox145",
  },

  concepto_cobradoIVA: {
    "view-model": "E1350001PIvaCobradoConSimbolo",

    tabindex: "38",
    id: "135textboxautocomplete158",
  },
  concepto_retencionIVA: {
    "view-model": "E1350001PRetencionIvaConSimbolo",
    tabindex: "42",
    id: "135textboxautocomplete169",
  },
  concepto_retencionISR: {
    "view-model": "E1350001PRetencionIsrConSimbolo",
    tabindex: "46",
    id: "135textboxautocomplete179",
  },
  impuestos_trasladados_total: {
    id: "135textbox268",
  },
  impuestos_retenidos_total: {
    id: "135textbox269",
  },
  subtotal: {
    id: "135textbox266",
  },
  total: {
    id: "135textbox270",
  },
};

async function getStorageData() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

async function loadConfigFromStorage() {
  try {
    const storageData = await getStorageData();
    if (!storageData || Object.keys(storageData).length === 0) {
      console.log("No hay datos almacenados en el storage");
      return null;
    }

    return {
      RFC: storageData.rfc || "",
      RAZON_SOCIAL: storageData.razonSocial || "",
      USO_CFDI: storageData.usoCFDI || "",
      CODIGO_POSTAL: storageData.codigoPostal || "",
      REGIMEN_FISCAL: storageData.regimenFiscal || "",
      CONCEPTO: {
        DESCRIPCION: storageData.conceptoDescripcion || "",
        PRODUCTO: storageData.conceptoProducto || "",
        UNIDAD: storageData.conceptoUnidad || "",
        CANTIDAD: storageData.conceptoCantidad || "",
        VALOR: storageData.conceptoValor || "",
        ID: storageData.conceptoId || "",
        IMPUESTO: storageData.conceptoImpuesto || "",
        IVA: storageData.conceptoIva || "",
        RET_IVA: storageData.conceptoRetIva || "",
        RET_ISR: storageData.conceptoRetIsr || "",
      },
      SUBTOTAL: storageData.subtotal || "",
      IMPUESTOS_TRASLADADOS: storageData.impuestosTrasladados || "",
      IMPUESTOS_RETENIDOS: storageData.impuestosRetenidos || "",
      TOTAL: storageData.total || "",
    };
  } catch (error) {
    console.error("Error loading storage data:", error);
    return null;
  }
}

async function waitForVisibility(
  selector,
  timeout = CONFIG.TIMEOUTS.VISIBILITY
) {
  return new Promise((resolve, reject) => {
    let timeoutId;

    const observer = new MutationObserver(() => {
      const element = document.getElementById(selector);
      if (element && element.offsetParent !== null) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(element);
      }
    });

    // Observe changes to the DOM that might affect visibility
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    // Initial check
    const element = document.getElementById(selector);
    if (element && element.offsetParent !== null) {
      observer.disconnect();
      resolve(element);
      return;
    }

    // Set timeout
    timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector} to become visible`));
    }, timeout);
  });
}

function simulateKeydown(inputText, key) {
  const keyCodeMap = {
    Enter: 13,
    ArrowDown: 40,
    Tab: 9,
  };

  const event = new KeyboardEvent("keydown", {
    key: key, // 'Enter', 'ArrowDown', or 'Tab'
    code: key, // Code of the key
    keyCode: keyCodeMap[key] || 40, // Numeric key code
    bubbles: true, // Allow event bubbling
    cancelable: true, // Allow event to be canceled
  });

  inputText.dispatchEvent(event);
}

function simulateSelectOptionById(option, selectInput) {
  const selectElement = document.getElementById(selectInput);
  if (!selectElement) {
    console.log("No se encontró el select", selectInput);
    return;
  }

  // If the select is disabled, enable it temporarily
  const wasDisabled = selectElement.disabled;
  if (wasDisabled) {
    selectElement.disabled = false;
  }

  // Handle both value-only and text-based option selection
  const optionElement = Array.from(selectElement.options).find(opt => 
    opt.value === option || opt.text.toLowerCase().includes(option.toLowerCase())
  );

  if (optionElement) {
    selectElement.value = optionElement.value;
  } else {
    selectElement.value = option;
  }

  // Dispatch both change and input events for better compatibility
  selectElement.dispatchEvent(new Event('change', { bubbles: true }));
  selectElement.dispatchEvent(new Event('input', { bubbles: true }));

  // Restore disabled state if it was disabled
  if (wasDisabled) {
    selectElement.disabled = true;
  }
}

function simulateClick(className, entityID) {
  const elements = document.getElementsByClassName(className);
  const element = Array.from(elements).find(
    (el) => el.getAttribute("entidad") === entityID
  );
  if (element) {
    element.click();
  }
}

function simulateClickLink(className, tabindex) {
  const elements = document.getElementsByClassName(className);
  if (elements.length > 0) {
    for (const element of elements) {
      if (element.getAttribute("tabindex") === tabindex) {
        element.click();
        break;
      }
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAutocompleteMenu() {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const autocompleteMenus = document.querySelectorAll(
            ".ui-menu.ui-widget.ui-widget-content.ui-autocomplete.ui-front"
          );
          if (
            Array.from(autocompleteMenus).some(
              (menu) => menu.style.display !== "none"
            )
          ) {
            observer.disconnect();
            resolve();
            break;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function waitForInputChange(input) {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "value"
        ) {
          observer.disconnect();
          resolve();
          break;
        }
      }
    });

    observer.observe(input, {
      attributes: true,
      attributeFilter: ["value"],
    });
  });
}

function waitForInputEvent(input, eventName) {
  return new Promise((resolve) => {
    const handler = () => {
      input.removeEventListener(eventName, handler);
      resolve();
    };
    input.addEventListener(eventName, handler);
  });
}

async function typeCharByChar(inputElement, text) {
  // for (const char of text) {
  //   if (!simulateCharInput(inputElement, char)) {
  //     console.log(`Character ${char} was prevented`);
  //     continue;
  //   }
  //   await delay(CONFIG.TIMEOUTS.SHORT_DELAY);
  // }
  inputElement.value = text;
  inputElement.dispatchEvent(new Event("input", { bubbles: true }));
}

async function InputTypeTextById(input, value) {
  const inputText = document.getElementById(input);
  if (!inputText) return false;

  inputText.value = "";
  inputText.focus();
  inputText.click();

  await delay(CONFIG.TIMEOUTS.DELAY);

  await typeCharByChar(inputText, value);

  await delay(CONFIG.TIMEOUTS.DELAY);

  simulateKeydown(inputText, "Enter");

  await delay(CONFIG.TIMEOUTS.SHORT_DELAY);

  inputText.dispatchEvent(new Event("change"));
  inputText.dispatchEvent(new Event("blur"));

  return true;
}

async function waitForMenuItem(text, timeout = CONFIG.TIMEOUTS.WAIT_MENU) {
  return new Promise((resolve, reject) => {
    let timeoutId;

    const flattenText = (element) => {
      // Get all text content, normalize spaces and remove special characters
      return element.innerText
        .replace(/\s+/g, " ") // normalize multiple spaces to single space
        .toLowerCase() // convert to lowercase for case-insensitive matching
        .trim(); // remove leading/trailing spaces
    };

    const findAndMatchMenuItem = (menuItems, searchText) => {
      const normalizedSearch = searchText.toLowerCase().trim();

      for (const item of menuItems) {
        const flattenedText = flattenText(item);
        //console.log('Comparing:', flattenedText, 'with:', normalizedSearch); // Debug log

        if (
          flattenedText === normalizedSearch ||
          flattenedText.includes(normalizedSearch)
        ) {
          console.log("Found menu item:", flattenedText); // Debug log
          item.click();
          return true;
        }
      }
      return false;
    };

    const observer = new MutationObserver(() => {
      const menuItems = document.querySelectorAll("li.ui-menu-item");
      if (findAndMatchMenuItem(menuItems, text)) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial check
    const menuItems = document.querySelectorAll("li.ui-menu-item");
    if (findAndMatchMenuItem(menuItems, text)) {
      observer.disconnect();
      resolve(true);
      return;
    }

    timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for menu item: ${text}`));
    }, timeout);
  });
}

async function waitForAutocompleteResults() {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const menus = document.querySelectorAll(".ui-autocomplete");
        for (const menu of menus) {
          if (
            menu.children.length > 0 &&
            window.getComputedStyle(menu).display !== "none"
          ) {
            observer.disconnect();
            resolve();
            return;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    // También resolver después de un tiempo máximo para evitar bloqueos
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 3000);
  });
}

async function InputTypeAutocomplete(input, value) {
  const inputText = document.getElementById(input);
  if (!inputText) return false;

  // Limpiar el input y enfocarlo
  inputText.value = "";
  inputText.focus();
  inputText.click();

  await delay(CONFIG.TIMEOUTS.DELAY);

  // Escribir el valor carácter por carácter
  await typeCharByChar(inputText, value);

  // Esperar a que aparezcan los resultados del autocomplete
  await waitForAutocompleteResults();

  // Intentar encontrar y hacer clic en el elemento del menú que coincida
  try {
    await waitForMenuItem(value);
    await delay(CONFIG.TIMEOUTS.SHORT_DELAY);
  } catch (error) {
    console.log(
      "No se encontró el elemento exacto en el menú, intentando con navegación manual"
    );
    // Si no se encuentra el elemento exacto, usar el método de navegación manual
    simulateKeydown(inputText, "ArrowDown");
    await delay(CONFIG.TIMEOUTS.SHORT_DELAY);
    simulateKeydown(inputText, "Enter");
  }

  // Asegurarse de que el valor fue seleccionado
  inputText.dispatchEvent(new Event("change"));
  inputText.dispatchEvent(new Event("blur"));

  return true;
}

async function FillBillInput(key, data) {
  const input = FORM_BILL_KEYS[key];
  let result = await InputTypeTextById(input.id, data);
  if (result) return;

  result = await InputTypeTextByAttribute(
    `tabindex=${input["tabindex"]}`,
    data
  );
  if (result) return;

  result = await InputTypeTextByAttribute(
    `view-model=${input["view-model"]}`,
    data
  );
  if (result) return;

  console.log("No se encontró el input", key, data);
}

function SelectBillOption(key, optionValue) {
  const input = FORM_BILL_KEYS[key];
  simulateSelectOptionById(optionValue, input.id);
}

function InputFillAutocomplete(key, data) {
  const input = FORM_BILL_KEYS[key];
  return InputTypeAutocomplete(input.id, data);
}

const checkValue = async (elementId, expectedValue) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.log(`No se encontró el elemento con ID: ${elementId}`);
    return false;
  }
   console.log("Elemento encontrado", element.value);
  if (element.value !== expectedValue) {
    console.log(
      `El valor ${elementId} no coincide. Esperado: ${expectedValue}, Actual: ${element.value}`
    );
    return false;
  }
  return true;
};


async function verifyTotals(expectedValues) {


  const subtotalOk = await checkValue(FORM_BILL_KEYS.subtotal.id, expectedValues.subtotal);
  const impuestosTrasladadosOk = await checkValue(FORM_BILL_KEYS.impuestos_trasladados_total.id, expectedValues.impuestosTransladados);
  const impuestosRetenidosOk = await checkValue(FORM_BILL_KEYS.impuestos_retenidos_total.id,expectedValues.impuestosRetenidos);
  const totalOk = await checkValue( FORM_BILL_KEYS.total.id, expectedValues.total);

  if (
    !subtotalOk ||
    !impuestosTrasladadosOk ||
    !impuestosRetenidosOk ||
    !totalOk
  ) {
    document.body.style.backgroundColor = "lightsalmon";
    throw new Error("Los totales no coinciden con los valores esperados");
  }

  console.log("Totales verificados correctamente");
  document.body.style.backgroundColor = "lightgreen";

  return true;
}

async function FillBillProcess() {
  const storageConfig = await loadConfigFromStorage();
  if (!storageConfig) {
    console.log("No hay datos en el storage, el proceso no se ejecutará");
    return;
  }

  if (!bodyElement.classList.contains("client-info-filled")) {
    document.body.style.backgroundColor = "lightblue";

    if (
      !storageConfig.RFC ||
      !storageConfig.RAZON_SOCIAL ||
      !storageConfig.USO_CFDI ||
      !storageConfig.CODIGO_POSTAL ||
      !storageConfig.REGIMEN_FISCAL
    ) {
      console.log("Faltan datos del cliente en el storage");
      return;
    }

    await InputFillAutocomplete("rfc", storageConfig.RFC);
    await InputFillAutocomplete("razonSocial", storageConfig.RAZON_SOCIAL);
    await InputFillAutocomplete("usoFactura", storageConfig.USO_CFDI);
    await FillBillInput("codigoPostal", storageConfig.CODIGO_POSTAL);
    await InputFillAutocomplete("regimenFiscal", storageConfig.REGIMEN_FISCAL);

    bodyElement.classList.add("client-info-filled");
  }

  if (!bodyElement.classList.contains("concept-info-filled")) {
    if (
      !storageConfig.CONCEPTO.DESCRIPCION ||
      !storageConfig.CONCEPTO.PRODUCTO ||
      !storageConfig.CONCEPTO.UNIDAD ||
      !storageConfig.CONCEPTO.CANTIDAD ||
      !storageConfig.CONCEPTO.VALOR ||
      !storageConfig.CONCEPTO.ID
    ) {
      console.log("Faltan datos del concepto en el storage");
      return;
    }

    simulateClick("btnNewItem", "1350001");

    // Esperar a que el formulario de concepto esté visible
    await waitForVisibility(FORM_BILL_KEYS["concepto_descripcion"].id);
    await InputFillAutocomplete(
      "concepto_productoServicio",
      storageConfig.CONCEPTO.PRODUCTO
    );
    await FillBillInput(
      "concepto_descripcion",
      storageConfig.CONCEPTO.DESCRIPCION
    );

    await FillBillInput(
      "concepto_unidadDeMedida",
      storageConfig.CONCEPTO.UNIDAD
    );
    await FillBillInput("concepto_cantidad", storageConfig.CONCEPTO.CANTIDAD);
    await FillBillInput("concepto_valorUnitario", storageConfig.CONCEPTO.VALOR);
    await FillBillInput("concepto_noIdentificacion", storageConfig.CONCEPTO.ID);

    if (storageConfig.CONCEPTO.IMPUESTO) {
     
      SelectBillOption("concepto_impuesto", storageConfig.CONCEPTO.IMPUESTO);
      SelectBillOption("concepto_impuesto_2", storageConfig.CONCEPTO.IMPUESTO);
    }
    bodyElement.classList.add("concept-info-filled");
  }

  if (!bodyElement.classList.contains("concept-info-filled-tax")) {
    if (
      !storageConfig.CONCEPTO.IVA ||
      !storageConfig.CONCEPTO.RET_IVA ||
      !storageConfig.CONCEPTO.RET_ISR
    ) {
      console.log("Faltan datos de impuestos en el storage");
      return;
    }

    await waitForVisibility(FORM_BILL_KEYS["concepto_no_impuesto"].id);

    const checkbox = document.getElementById(
      FORM_BILL_KEYS["concepto_no_impuesto"].id
    );
    if (checkbox.checked) {
      checkbox.click();
    }

    await FillBillInput(
      "concepto_cobradoIVA",
      storageConfig.CONCEPTO.IVA + "%"
    );
    if (
      storageConfig.CONCEPTO.RET_IVA !== "" &&
      Number(storageConfig.CONCEPTO.RET_IVA) > 0
    ) {
      await FillBillInput(
        "concepto_retencionIVA",
        storageConfig.CONCEPTO.RET_IVA + "%"
      );
    }
    if (
      storageConfig.CONCEPTO.RET_ISR !== "" &&
      Number(storageConfig.CONCEPTO.RET_ISR) > 0
    ) {
      await FillBillInput(
        "concepto_retencionISR",
        storageConfig.CONCEPTO.RET_ISR + "%"
      );
    }
    
    await delay(CONFIG.TIMEOUTS.DELAY/2);
    simulateClick("btnAddItem", "1350001");
  }

  if (!bodyElement.classList.contains("totals-verified")) {
    try {
      await delay(CONFIG.TIMEOUTS.DELAY * 2);
      await verifyTotals({
        subtotal: storageConfig.SUBTOTAL,
        impuestosTransladados:
          storageConfig.IMPUESTOS_TRASLADADOS,
        impuestosRetenidos:
          storageConfig.IMPUESTOS_RETENIDOS,
        total: storageConfig.TOTAL
      });
      bodyElement.classList.add("totals-verified");
      //sellar
      document.querySelector('a.btn-sellar-factura[tabindex="2002"]').click();

    } catch (error) {
      console.error("Error al verificar totales:", error.message);
      return;
    }
  }

 
 



}

function StartBillMutationObserver() {
  const config = {
    attributes: true, // Observar cambios en los atributos
    attributeFilter: ["class"], // Filtra solo cambios en la clase
  };

  const observer = new MutationObserver(async (mutationsList) => {
    for (const mutation of mutationsList) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class" &&
        bodyElement.className.trim() == "pace-done"
      ) {
        FillBillProcess();
      }
    }
  });
  observer.observe(bodyElement, config);
}

StartBillMutationObserver();
