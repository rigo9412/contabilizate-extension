import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync } from "node:fs";
import { resolve } from "node:path";

// Archivos de la extensión clásica (popup, scripts de llenado, manifest) que
// se copian tal cual a dist/ junto a la app de React.
const LEGACY_FILES = ["manifest.json", "128.png", "index.html", "css", "js"];

function copyLegacyExtension(): Plugin {
  return {
    name: "copy-legacy-extension",
    closeBundle() {
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
