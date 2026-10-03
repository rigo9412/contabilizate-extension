import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "app/src") } },
  test: { include: ["app/src/**/*.test.ts"], setupFiles: ["fake-indexeddb/auto"] },
});
