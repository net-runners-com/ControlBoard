import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { configPlugin } from "./vite-plugin.js";

const require = createRequire(import.meta.url);
const ADMIN_ROOT = dirname(require.resolve("@controlboard/admin/package.json"));

/* 管理画面をサイトの Puck 設定ごとビルドする。React / Puck / core を1つに寄せないと、
   サイト側の node_modules の React と二重になり、フックが動かない。 */
export async function buildAdmin({ configPath, outDir }) {
  await build({
    configFile: false,
    root: ADMIN_ROOT,
    base: "/admin/",
    logLevel: "warn",
    plugins: [react(), configPlugin(configPath)],
    resolve: { dedupe: ["react", "react-dom", "@measured/puck", "@controlboard/core"] },
    build: { outDir, emptyOutDir: true, sourcemap: false },
  });
}
