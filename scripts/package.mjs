// Empaqueta dist/ en un .zip para subirlo a la Chrome Web Store. La tienda
// rechaza el campo "key" (asigna su propia llave), así que se quita del
// manifest del paquete; dist/ conserva el suyo para cargarlo descomprimido.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "dist/manifest.json"), "utf8"));
delete manifest.key;

const staging = mkdtempSync(join(tmpdir(), "contabilizate-"));
cpSync(join(ROOT, "dist"), staging, { recursive: true });
writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");

const out = join(ROOT, `contabilizate-${manifest.version}.zip`);
rmSync(out, { force: true });
execFileSync("zip", ["-qr", "-X", out, ".", "-x", "*.DS_Store", "*.map"], { cwd: staging });
rmSync(staging, { recursive: true, force: true });
console.log(`Paquete listo: ${out}`);
