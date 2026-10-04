import { beforeEach, describe, expect, it } from "vitest";
import { db, PROFILE_ID, save, softDelete } from "./db";
import { BackupNeedsPasswordError, exportBackup, importBackup, mergeSnapshot } from "./backup";
import { decryptJson, encryptJson, WrongPasswordError } from "./crypto";
import type { Profile, Template } from "./types";

const profile = (name: string, updatedAt: number): Profile => ({
  id: PROFILE_ID,
  name,
  rfc: "XAXX010101000",
  postalCode: "88240",
  regimenFiscal: "626",
  updatedAt,
});

const toFile = async (blob: Blob) => new File([await blob.text()], "respaldo.json");

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("crypto", () => {
  it("descifra con la contraseña correcta y falla con otra", async () => {
    const payload = await encryptJson({ a: 1 }, "secreta");
    expect(await decryptJson(payload, "secreta")).toEqual({ a: 1 });
    await expect(decryptJson(payload, "otra")).rejects.toBeInstanceOf(WrongPasswordError);
  });
});

describe("mergeSnapshot", () => {
  it("se queda con el registro más reciente", async () => {
    await db.profile.put(profile("local", 200));
    expect(await mergeSnapshot({ profile: [profile("viejo", 100)] })).toEqual({ added: 0, updated: 0 });
    expect((await db.profile.get(PROFILE_ID))?.name).toBe("local");

    expect(await mergeSnapshot({ profile: [profile("nuevo", 300)] })).toEqual({ added: 0, updated: 1 });
    expect((await db.profile.get(PROFILE_ID))?.name).toBe("nuevo");
  });

  it("propaga los borrados", async () => {
    const template = await save<Template>(db.templates, { id: "t1", alias: "Cliente", bill: {} as Template["bill"] });
    const exported = await toFile(await exportBackup({ includeVault: true }));
    await softDelete(db.templates, template.id);
    const deleted = await db.templates.get("t1");

    await db.templates.put(template);
    await mergeSnapshot({ templates: [deleted!] });
    expect((await db.templates.get("t1"))?.deletedAt).toBeTruthy();

    // Importar el respaldo anterior no revive el registro borrado.
    await importBackup(exported);
    expect((await db.templates.get("t1"))?.deletedAt).toBeTruthy();
  });
});

describe("exportBackup / importBackup", () => {
  it("restaura un respaldo cifrado solo con su contraseña", async () => {
    await db.profile.put(profile("yo", 100));
    const file = await toFile(await exportBackup({ password: "respaldo", includeVault: true }));
    expect(await file.text()).not.toContain("XAXX010101000");
    await db.profile.clear();

    await expect(importBackup(file)).rejects.toBeInstanceOf(BackupNeedsPasswordError);
    await expect(importBackup(file, "mala")).rejects.toBeInstanceOf(WrongPasswordError);
    expect(await importBackup(file, "respaldo")).toEqual({ added: 1, updated: 0 });
    expect((await db.profile.get(PROFILE_ID))?.name).toBe("yo");
  });

  it("puede excluir la e.firma", async () => {
    await db.vault.put({ id: "efirma", cerFileName: "a.cer", keyFileName: "a.key", payload: { salt: "", iv: "", data: "" }, updatedAt: 1 });
    const file = await toFile(await exportBackup({ includeVault: false }));
    expect(JSON.parse(await file.text()).tables.vault).toEqual([]);
  });

  it("rechaza archivos que no son respaldos", async () => {
    await expect(importBackup(new File(["{}"], "x.json"))).rejects.toThrow("no es un respaldo de Contabilizate");
    await expect(importBackup(new File(["nope"], "x.json"))).rejects.toThrow("no es un respaldo válido");
  });
});
