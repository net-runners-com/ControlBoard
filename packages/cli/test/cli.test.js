import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite, ownerRecord, setupPlan, deployPlan, kvPutPlan } from "../src/commands.js";

describe("init", () => {
  it("雛形を書き出し、既存ファイルは上書きしない", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cb-init-"));
    await writeFile(join(dir, "astro.config.mjs"), "// mine");
    const written = await initSite(dir);
    expect(written).toContain("controlboard.config.js");
    expect(written).toContain("src/blocks.jsx");
    expect(written).not.toContain("astro.config.mjs");
    expect(await readFile(join(dir, "astro.config.mjs"), "utf8")).toBe("// mine");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain("public/admin/");
  });
});

describe("create-owner", () => {
  it("PBKDF2 のハッシュを持つオーナーを1人作り、平文を残さない", async () => {
    const rec = await ownerRecord({ user: "me", password: "longpass-1" });
    expect(rec.items).toHaveLength(1);
    expect(rec.items[0]).toMatchObject({ user: "me", role: "owner", iterations: 100000, mustChange: true });
    expect(JSON.stringify(rec)).not.toContain("longpass-1");
  });
  it("8文字未満のパスワードは断る", async () => {
    await expect(ownerRecord({ user: "me", password: "short" })).rejects.toThrow(/8文字/);
  });
  it("既定はローカルの KV に書く", () => {
    expect(kvPutPlan({ file: "/tmp/u.json", remote: false }).at(-1)).toBe("--local");
  });
});

describe("setup / deploy", () => {
  it("setup は KV と R2 を作るコマンドを返す", () => {
    expect(setupPlan({ name: "acme", staging: false })).toEqual([
      ["wrangler", "kv", "namespace", "create", "acme-cms"],
      ["wrangler", "r2", "bucket", "create", "acme-media"],
    ]);
    expect(setupPlan({ name: "acme", staging: true })[0]).toEqual(["wrangler", "kv", "namespace", "create", "acme-cms-stg"]);
  });
  it("deploy は Pages プロジェクトとブランチを指定する", () => {
    expect(deployPlan({ name: "acme", staging: false, branch: "main" })).toEqual(
      ["wrangler", "pages", "deploy", "dist", "--project-name", "acme", "--branch", "main"]);
    expect(deployPlan({ name: "acme", staging: true, branch: "staging" })).toEqual(
      ["wrangler", "pages", "deploy", "dist", "--project-name", "acme-stg", "--branch", "staging"]);
  });
  it("deploy は main 以外のブランチから本番へ出さない", () => {
    expect(() => deployPlan({ name: "acme", staging: false, branch: "feature" })).toThrow(/main/);
  });
  it("名前がなければ止まる", () => {
    expect(() => setupPlan({ staging: false })).toThrow(/--name/);
  });
});
