const FORM_BILL_KEYS = {
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
};

export async function launchPuppeteerBrowser() {
  return await chrome.runtime.sendMessage({ action: "createBrowser" });
}

async function waitForVisibility(page, selector, timeout = 5000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    return true;
  } catch (error) {
    console.error(`Element ${selector} not visible after ${timeout}ms`);
    return false;
  }
}

async function fillInput(page, selector, value) {
  try {
    await page.waitForSelector(selector);
    await page.click(selector);
    await page.type(selector, value, { delay: 100 });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    return true;
  } catch (error) {
    console.error(`Error filling input ${selector}: ${error.message}`);
    return false;
  }
}

async function handleAutocomplete(page, selector, value) {
  try {
    await page.waitForSelector(selector);
    await page.click(selector);
    await page.type(selector, value, { delay: 100 });
    // Wait for autocomplete dropdown
    await page.waitForSelector(".ui-menu-item", { visible: true });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    return true;
  } catch (error) {
    console.error(`Error handling autocomplete ${selector}: ${error.message}`);
    return false;
  }
}

async function selectOption(page, selector, value) {
  try {
    await page.select(selector, value);
    return true;
  } catch (error) {
    console.error(`Error selecting option ${selector}: ${error.message}`);
    return false;
  }
}

export async function FillBillProcess(page) {
  if (
    !(await page.evaluate(() =>
      document.body.classList.contains("client-info-filled")
    ))
  ) {
    await page.evaluate(
      () => (document.body.style.backgroundColor = "lightblue")
    );

    // Fill client information
    await fillInput(page, `#${FORM_BILL_KEYS.rfc.id}`, "TNM140723GFA");
    await fillInput(
      page,
      `#${FORM_BILL_KEYS.razonSocial.id}`,
      "TECNOLOGICO NACIONAL DE MEXICO"
    );
    await handleAutocomplete(
      page,
      `#${FORM_BILL_KEYS.usoFactura.id}`,
      "Gastos en general."
    );
    await fillInput(page, `#${FORM_BILL_KEYS.codigoPostal.id}`, "03330");
    await handleAutocomplete(
      page,
      `#${FORM_BILL_KEYS.regimenFiscal.id}`,
      "Personas Morales con Fines no Lucrativos"
    );

    await page.evaluate(() =>
      document.body.classList.add("client-info-filled")
    );
  }

  if (
    !(await page.evaluate(() =>
      document.body.classList.contains("concept-info-filled")
    ))
  ) {
    // Add new concept
    await page.click('.btnNewItem[entidad="1350001"]');

    await handleAutocomplete(
      page,
      `#${FORM_BILL_KEYS.concepto_descripcion.id}`,
      "Apoyo a la educación como Coordinador de Desarrollo de Sistemas en area de Centro de Cómputo del 2025-02-01 al 2025-02-15"
    );

    await handleAutocomplete(
      page,
      `#${FORM_BILL_KEYS.concepto_productoServicio.id}`,
      "Programadores de computador"
    );
    await handleAutocomplete(
      page,
      `#${FORM_BILL_KEYS.concepto_unidadDeMedida.id}`,
      "Unidad de servicio"
    );
    await fillInput(page, `#${FORM_BILL_KEYS.concepto_cantidad.id}`, "1");
    await fillInput(page, `#${FORM_BILL_KEYS.concepto_valorUnitario.id}`, "7200");
    await fillInput(page, `#${FORM_BILL_KEYS.concepto_noIdentificacion.id}`, "1");

    await selectOption(page, `#${FORM_BILL_KEYS.concepto_impuesto.id}`, "02");
    await page.evaluate(() =>
      document.body.classList.add("concept-info-filled")
    );
  }

  if (
    !(await page.evaluate(() =>
      document.body.classList.contains("concept-info-filled-tax")
    ))
  ) {
    await waitForVisibility(page, `#${FORM_BILL_KEYS.concepto_no_impuesto.id}`);

    const isChecked = await page.$eval(
      `#${FORM_BILL_KEYS.concepto_no_impuesto.id}`,
      (checkbox) => checkbox.checked
    );
    if (isChecked) {
      await page.click(`#${FORM_BILL_KEYS.concepto_no_impuesto.id}`);
    }

    await fillInput(page, `#${FORM_BILL_KEYS.concepto_cobradoIVA.id}`, "8");
    await fillInput(page, `#${FORM_BILL_KEYS.concepto_retencionIVA.id}`, "5.33");
    await fillInput(page, `#${FORM_BILL_KEYS.concepto_retencionISR.id}`, "1.25");

    await page.click('.btnAddItem[entidad="1350001"]');
    await page.evaluate(() =>
      document.body.classList.add("concept-info-filled-tax")
    );
  }

  await page.click('.btn-sellar-factura[tabindex="2002"]');
}