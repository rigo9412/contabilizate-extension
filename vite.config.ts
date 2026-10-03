import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = import.meta.dirname;

// Archivos de la extensión clásica (popup, scripts de llenado, manifest) que
// se copian tal cual a dist/ junto a la app de React.
const LEGACY_FILES = ["128.png", "index.html", "js"];

function copyLegacyExtension(googleClientId: string | undefined): Plugin {
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
      // El Client ID de Google viene de .env (VITE_GOOGLE_CLIENT_ID); sin él se
      // quita oauth2 y la app muestra cómo configurarlo.
      const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
      if (googleClientId) manifest.oauth2.client_id = googleClientId;
      else delete manifest.oauth2;
      writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 4) + "\n");
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, "VITE_");
  return {
    root: "app",
    base: "./",
    envDir: ROOT,
    plugins: [react(), copyLegacyExtension(env.VITE_GOOGLE_CLIENT_ID?.trim())],
    resolve: {
      alias: { "@": resolve(ROOT, "app/src") },
    },
    build: {
      outDir: resolve(ROOT, "dist/app"),
      emptyOutDir: true,
    },
  };
});
