import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { appendFile } from "node:fs/promises";
import { configPlugin } from "./vite-plugin.js";
import { ROUTES } from "./routes-table.js";
import { buildAdmin } from "./build-admin.js";

/* 管理画面は静的ファイルとして配られ worker を通らないので、_headers で閉じる。 */
const ADMIN_HEADERS = `
/admin/*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
`;

export default function controlboard({ config = "./controlboard.config.js" } = {}) {
  return {
    name: "@controlboard/core",
    hooks: {
      "astro:config:setup": async ({ config: astro, command, injectRoute, addMiddleware, updateConfig, logger }) => {
        const root = fileURLToPath(astro.root);
        const configPath = resolve(root, config);
        updateConfig({
          vite: {
            plugins: [configPlugin(configPath)],
            /* Workers には MessageChannel がない。react-dom の edge 版を使う。 */
            resolve: { alias: { "react-dom/server": "react-dom/server.edge" } },
          },
        });
        for (const r of ROUTES) injectRoute({ pattern: r.pattern, entrypoint: r.file, prerender: false });
        addMiddleware({ entrypoint: fileURLToPath(new URL("./middleware.js", import.meta.url)), order: "pre" });
        if (command === "build" || command === "dev") {
          logger.info("管理画面をビルドしています");
          await buildAdmin({ configPath, outDir: resolve(root, "public/admin") });
        }
      },
      "astro:build:done": async ({ dir }) => {
        await appendFile(new URL("_headers", dir), ADMIN_HEADERS);
      },
    },
  };
}
