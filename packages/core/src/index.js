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
            /* Workers には MessageChannel がない。本番ビルドだけ react-dom の edge 版を使う
               （開発サーバーは Node で動くので不要。入れると CJS のまま読まれて落ちる）。 */
            ...(command === "build" ? { resolve: { alias: { "react-dom/server": "react-dom/server.edge" } } } : {}),
          },
        });
        for (const r of ROUTES) injectRoute({ pattern: r.pattern, entrypoint: r.file, prerender: false });
        addMiddleware({ entrypoint: fileURLToPath(new URL("./middleware.js", import.meta.url)), order: "pre" });
        if (command === "build" || command === "dev") {
          logger.info("管理画面をビルドしています");
          await buildAdmin({ configPath, outDir: resolve(root, "public/admin") });
        }
      },
      /* 開発サーバーは /admin/ をフォルダの index.html に解決しない。本番（Pages）と同じにする。 */
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/admin" || req.url === "/admin/" || req.url.startsWith("/admin/?")) {
            req.url = "/admin/index.html" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
          }
          next();
        });
      },
      "astro:build:done": async ({ dir }) => {
        await appendFile(new URL("_headers", dir), ADMIN_HEADERS);
      },
    },
  };
}
