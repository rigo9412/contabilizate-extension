import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = import.meta.dirname;

// Archivos de la extensión clásica (popup, scripts de llenado, manifest) que
// se copian tal cual a dist/ junto a la app de React.
const LEGACY_FILES = ["128.png", "index.html", "js"];

function copyLegacyExtension(): Plugin {
  return {
    name: "copy-legacy-extension",
    closeBundle() {
      // Borra lo copiado en builds anteriores (dist/app lo limpia Vite).
      const dist = resolve(ROOT, "dist");
      for (const entry of existsSync(dist) ? readdirSync(dist) : []) {
        if (entry !== "app") rmSync(resolve(dist, entry), { recursive: true, force: true });
      }
      for (const file of LEGACY_FILES) {
        cpSync(resolve(ROOT, file), resolve(dist, file), { recursive: true });
      }
      // Mientras manifest.json no tenga el Client ID real de Google se quita
      // oauth2 (Chrome lo rechazaría) y la app avisa que Drive no está disponible.
      // También se quita "identity", que sin oauth2 no se usa.
      const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
      if (manifest.oauth2?.client_id?.startsWith("__")) {
        delete manifest.oauth2;
        manifest.permissions = manifest.permissions.filter((p: string) => p !== "identity");
      }
      writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");
    },
  };
}

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [react(), copyLegacyExtension()],
  resolve: {
    alias: { "@": resolve(ROOT, "app/src") },
  },
  build: {
    outDir: resolve(ROOT, "dist/app"),
    emptyOutDir: true,
  },
});
