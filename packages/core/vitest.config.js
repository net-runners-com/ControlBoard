import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* 実行時コードは virtual:controlboard/config を読む。テストでは固定の設定に向ける。 */
export default defineConfig({
  resolve: {
    alias: {
      "virtual:controlboard/config": fileURLToPath(new URL("./test/fixtures/config.js", import.meta.url)),
    },
  },
  esbuild: { jsx: "automatic" },
  test: { environment: "node", testTimeout: 20000 },
});
