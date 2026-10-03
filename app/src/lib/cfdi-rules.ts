// Reglas de los catálogos del SAT (CFDI 4.0) que el portal valida al sellar.
// Se revisan antes de emitir para no llegar al SAT con una factura que rechazará.
import { cfdiUsages, taxRegimes } from "./catalogs";
import type { BillDraft, GlobalInfo } from "./types";

export const RFC_GENERIC = "XAXX010101000";
export const GLOBAL_RECEPTOR_NAME = "PUBLICO EN GENERAL";

/** Completa mes y año vacíos con los de la fecha del comprobante. */
export function resolveGlobalInfo(bill: Pick<BillDraft, "globalInfo" | "date">): GlobalInfo | undefined {
  if (!bill.globalInfo) return undefined;
  return {
    ...bill.globalInfo,
    meses: bill.globalInfo.meses || bill.date.slice(5, 7),
    anio: bill.globalInfo.anio || bill.date.slice(0, 4),
  };
}

// c_RegimenFiscal: qué tipo de persona puede tener cada régimen.
const REGIMES_FISICA = ["605", "606", "607", "608", "610", "611", "612", "614", "615", "616", "621", "625", "626"];
const REGIMES_MORAL = ["601", "603", "610", "620", "622", "623", "624", "626"];

const BUSINESS_REGIMES = ["601", "603", "606", "612", "620", "621", "622", "623", "624", "625", "626"];
const DEDUCTION_REGIMES = ["605", "606", "607", "608", "611", "612", "614", "615", "625"];
const ALL_REGIMES = Object.keys(taxRegimes);

// c_UsoCFDI: tipo de persona y regímenes del receptor permitidos para cada uso.
const USO_RULES: Record<string, { fisica: boolean; moral: boolean; regimes: string[] }> = {
  ...Object.fromEntries(
    ["G01", "G02", "G03", "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08"].map((k) => [
      k,
      { fisica: true, moral: true, regimes: BUSINESS_REGIMES },
    ]),
  ),
  ...Object.fromEntries(
    ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10"].map((k) => [
      k,
      { fisica: true, moral: false, regimes: DEDUCTION_REGIMES },
    ]),
  ),
  S01: { fisica: true, moral: true, regimes: ALL_REGIMES },
  CP01: { fisica: true, moral: true, regimes: ALL_REGIMES },
  CN01: { fisica: true, moral: false, regimes: ["605"] },
};

const normalizeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** RFC de 13 caracteres = persona física, 12 = moral. */
function personType(rfc: string): "fisica" | "moral" | null {
  if (rfc.length === 13) return "fisica";
  if (rfc.length === 12) return "moral";
  return null;
}

/** Errores del receptor que harían que el SAT rechace la factura al sellar. */
export function receptorErrors(bill: BillDraft): string[] {
  const errors: string[] = [];
  const rfc = (bill.rfcReceptor ?? "").trim().toUpperCase();
  const regime = bill.typeReceptorRegistration ?? "";
  const uso = bill.useCFDIReceptor ?? "";
  if (!rfc || !regime || !uso) return errors;

  if (rfc === RFC_GENERIC) {
    const name = normalizeName(bill.nameReceptor ?? "");
    const isPublicName = name === GLOBAL_RECEPTOR_NAME || name === "PUBLICO GENERAL";
    if (bill.globalInfo) {
      if (name !== GLOBAL_RECEPTOR_NAME) {
        errors.push(`En una factura global el nombre del receptor debe ser "${GLOBAL_RECEPTOR_NAME}".`);
      }
      if (bill.typeBill && bill.typeBill !== "I") errors.push("La factura global debe ser de tipo Ingreso.");
      const year = Number(bill.globalInfo.anio);
      const currentYear = new Date().getFullYear();
      if (bill.globalInfo.anio && !(year === currentYear || year === currentYear - 1)) {
        errors.push(`El año de la factura global debe ser ${currentYear} o ${currentYear - 1}.`);
      }
    } else if (isPublicName) {
      errors.push(
        'Con RFC XAXX010101000 y nombre "PUBLICO EN GENERAL" el SAT la trata como factura global: ' +
          'marca "Factura global" para capturar periodicidad, mes y año, o escribe el nombre de la persona.',
      );
    }
    if (regime !== "616") errors.push("Con RFC XAXX010101000 el régimen fiscal debe ser 616 - Sin obligaciones fiscales.");
    if (uso !== "S01") errors.push("Con RFC XAXX010101000 el uso del CFDI debe ser S01 - Sin efectos fiscales.");
    if (bill.postalCodeEmisor && bill.postalCodeReceptor && bill.postalCodeReceptor !== bill.postalCodeEmisor) {
      errors.push(
        `Con RFC XAXX010101000 el código postal del receptor debe ser el de tu lugar de expedición (${bill.postalCodeEmisor}).`,
      );
    }
    return errors;
  }

  const type = personType(rfc);
  if (type === "fisica" && !REGIMES_FISICA.includes(regime)) {
    errors.push(`El régimen ${regime} no es válido para una persona física (RFC de 13 caracteres).`);
  }
  if (type === "moral" && !REGIMES_MORAL.includes(regime)) {
    errors.push(`El régimen ${regime} no es válido para una persona moral (RFC de 12 caracteres).`);
  }

  const rule = USO_RULES[uso];
  const usoLabel = `${uso} - ${cfdiUsages[uso] ?? uso}`;
  if (!rule) {
    errors.push(`El uso del CFDI ${usoLabel} no es válido en CFDI 4.0.`);
  } else {
    if (type && !rule[type]) {
      errors.push(`El uso ${usoLabel} no aplica para una persona ${type === "fisica" ? "física" : "moral"}.`);
    }
    if (!rule.regimes.includes(regime)) {
      errors.push(`El uso ${usoLabel} no corresponde al régimen ${regime} - ${taxRegimes[regime] ?? regime}.`);
    }
  }
  return errors;
}
