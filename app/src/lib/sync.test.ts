import { beforeEach, describe, expect, it } from "vitest";
import { db, save, softDelete } from "./db";
import type { DriveClient } from "./drive";
import { syncWith } from "./sync";
import type { Template } from "./types";

/** Drive simulado: un solo archivo compartido por los "dispositivos". */
function fakeDrive() {
  const state: { content: string | null; uploads: number } = { content: null, uploads: 0 };
  const client: DriveClient = {
    async find() {
      return state.content === null ? null : { id: "file-1" };
    },
    async download() {
      return state.content!;
    },
    async upload(content, id) {
      state.uploads++;
      state.content = content;
      return { id: id ?? "file-1" };
    },
  };
  return { client, state };
}

const template = (id: string, alias: string) =>
  save<Template>(db.templates, { id, alias, bill: {} as Template["bill"] });

/** Simula cambiar de navegador: cada uno tiene su propia base local. */
async function switchDevice() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

beforeEach(switchDevice);

describe("syncWith", () => {
  it("la primera vez sube lo local sin bajar nada", async () => {
    const { client, state } = fakeDrive();
    await template("a", "Cliente A");
    expect(await syncWith(client)).toEqual({ added: 0, updated: 0 });
    expect(state.uploads).toBe(1);
    expect(JSON.parse(state.content!).tables.templates).toHaveLength(1);
  });

  it("combina lo de dos navegadores y ambos terminan con todo", async () => {
    const { client, state } = fakeDrive();
    await template("a", "Del navegador 1");
    await syncWith(client);

    await switchDevice();
    await template("b", "Del navegador 2");
    expect(await syncWith(client)).toEqual({ added: 1, updated: 0 });
    expect((await db.templates.toArray()).map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(JSON.parse(state.content!).tables.templates).toHaveLength(2);
  });

  it("propaga ediciones y borrados al otro navegador", async () => {
    const { client } = fakeDrive();
    await template("a", "Original");
    await template("b", "Se va a borrar");
    await syncWith(client);
    const device1 = await db.templates.toArray();

    // Navegador 2 edita "a" y borra "b".
    await switchDevice();
    await syncWith(client);
    await new Promise((r) => setTimeout(r, 2));
    await template("a", "Editada");
    await softDelete(db.templates, "b");
    await syncWith(client);

    // Navegador 1 todavía tiene las versiones viejas.
    await switchDevice();
    await db.templates.bulkPut(device1);
    expect(await syncWith(client)).toEqual({ added: 0, updated: 2 });
    expect((await db.templates.get("a"))?.alias).toBe("Editada");
    expect((await db.templates.get("b"))?.deletedAt).toBeTruthy();
  });

  it("no pisa datos si Drive tiene un formato más nuevo", async () => {
    const { client, state } = fakeDrive();
    state.content = JSON.stringify({ app: "contabilizate-sync", version: 99, tables: {} });
    await expect(syncWith(client)).rejects.toThrow("versión más nueva");
    expect(state.uploads).toBe(0);
  });
});
