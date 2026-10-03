import { describe, expect, it } from "vitest";
import { receptorErrors } from "./cfdi-rules";
import type { BillDraft } from "./types";

const bill = (fields: Partial<BillDraft>) =>
  ({
    rfcReceptor: "XAXX010101000",
    nameReceptor: "JUAN PEREZ LOPEZ",
    typeReceptorRegistration: "616",
    useCFDIReceptor: "S01",
    postalCodeReceptor: "88240",
    postalCodeEmisor: "88240",
    ...fields,
  }) as BillDraft;

describe("receptorErrors", () => {
  it("acepta el RFC genérico con nombre de persona, 616, S01 y el CP del emisor", () => {
    expect(receptorErrors(bill({}))).toEqual([]);
  });

  it("detecta los dos errores que devolvió el SAT", () => {
    const errors = receptorErrors(bill({ nameReceptor: "PUBLICO EN GENERAL", useCFDIReceptor: "G03" }));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("factura global");
    expect(errors[1]).toBe("Con RFC XAXX010101000 el uso del CFDI debe ser S01 - Sin efectos fiscales.");
    expect(receptorErrors(bill({ nameReceptor: "Público General" }))[0]).toContain("factura global");
  });

  it("con RFC genérico exige el CP del lugar de expedición", () => {
    expect(receptorErrors(bill({ postalCodeReceptor: "03330" }))).toEqual([
      "Con RFC XAXX010101000 el código postal del receptor debe ser el de tu lugar de expedición (88240).",
    ]);
  });

  it("valida el uso contra el régimen y el tipo de persona", () => {
    // TecNM: persona moral, 603, G03 → válido.
    expect(receptorErrors(bill({ rfcReceptor: "TNM140723GFA", typeReceptorRegistration: "603", useCFDIReceptor: "G03" }))).toEqual([]);
    // Deducciones personales no aplican a personas morales.
    expect(receptorErrors(bill({ rfcReceptor: "TNM140723GFA", typeReceptorRegistration: "603", useCFDIReceptor: "D01" }))).toEqual([
      "El uso D01 - Honorarios médicos, dentales y gastos hospitalarios no aplica para una persona moral.",
      "El uso D01 - Honorarios médicos, dentales y gastos hospitalarios no corresponde al régimen 603 - Personas Morales con Fines no Lucrativos.",
    ]);
    // Persona física asalariada solo puede usar deducciones, S01, CP01 o CN01.
    expect(receptorErrors(bill({ rfcReceptor: "PELJ800101AB1", typeReceptorRegistration: "605", useCFDIReceptor: "G03" }))).toEqual([
      "El uso G03 - Gastos en general no corresponde al régimen 605 - Sueldos y Salarios e Ingresos Asimilados a Salarios.",
    ]);
    expect(receptorErrors(bill({ rfcReceptor: "PELJ800101AB1", typeReceptorRegistration: "601", useCFDIReceptor: "S01" }))).toEqual([
      "El régimen 601 no es válido para una persona física (RFC de 13 caracteres).",
    ]);
    expect(receptorErrors(bill({ rfcReceptor: "TNM140723GFA", typeReceptorRegistration: "603", useCFDIReceptor: "P01" }))[0]).toContain(
      "no es válido en CFDI 4.0",
    );
  });
});
