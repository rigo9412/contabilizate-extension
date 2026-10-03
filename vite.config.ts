import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Archivos de la extensión clásica (popup, scripts de llenado, manifest) que
// se copian tal cual a dist/ junto a la app de React.
const LEGACY_FILES = ["manifest.json", "128.png", "index.html", "js"];

function copyLegacyExtension(): Plugin {
  return {
    name: "copy-legacy-extension",
    closeBundle() {
      // Borra lo copiado en builds anteriores (dist/app lo limpia Vite).
      const dist = resolve(import.meta.dirname, "dist");
      for (const entry of existsSync(dist) ? readdirSync(dist) : []) {
        if (entry !== "app") rmSync(resolve(dist, entry), { recursive: true, force: true });
      }
      for (const file of LEGACY_FILES) {
        cpSync(resolve(import.meta.dirname, file), resolve(import.meta.dirname, "dist", file), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [react(), copyLegacyExtension()],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "app/src") },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist/app"),
    emptyOutDir: true,
  },
});
