import { describe, it, expect, vi } from "vitest";
vi.mock("../src/build-admin.js", () => ({ buildAdmin: vi.fn(async () => {}) }));
import controlboard from "../src/index.js";
import { ROUTES } from "../src/routes-table.js";
import { buildAdmin } from "../src/build-admin.js";
import { existsSync } from "node:fs";

async function runSetup(command) {
  const injected = [];
  const mws = [];
  const updates = [];
  await controlboard().hooks["astro:config:setup"]({
    config: { root: new URL("file:///tmp/site/") },
    command,
    injectRoute: (r) => injected.push(r),
    addMiddleware: (m) => mws.push(m),
    updateConfig: (u) => updates.push(u),
    logger: { info() {}, warn() {} },
  });
  return { injected, mws, updates };
}

describe("integration", () => {
  it("全 API ルートを注入し、実在するファイルを指す", async () => {
    const { injected } = await runSetup("build");
    expect(injected.map((r) => r.pattern)).toEqual(ROUTES.map((r) => r.pattern));
    for (const r of injected) expect(existsSync(r.entrypoint)).toBe(true);
    expect(injected.map((r) => r.pattern)).toContain("/media/[...path]");
  });
  it("middleware を pre で登録し、仮想モジュールを入れる", async () => {
    const { mws, updates } = await runSetup("dev");
    expect(mws[0].order).toBe("pre");
    expect(existsSync(mws[0].entrypoint)).toBe(true);
    expect(updates[0].vite.plugins[0].name).toBe("controlboard-config");
  });
  it("build と dev のときだけ管理画面をビルドする", async () => {
    buildAdmin.mockClear();
    await runSetup("build");
    await runSetup("sync");
    expect(buildAdmin).toHaveBeenCalledTimes(1);
    expect(buildAdmin.mock.calls[0][0]).toEqual({ configPath: "/tmp/site/controlboard.config.js", outDir: "/tmp/site/public/admin" });
  });
});
