#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite, ownerRecord, setupPlan, deployPlan, kvPutPlan } from "./commands.js";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes("--" + n);
const opt = (n) => { const i = rest.indexOf("--" + n); return i >= 0 ? rest[i + 1] : undefined; };

/* wrangler はサイトの作業フォルダで動かす。アカウントの切り替えは cfauth に任せる。 */
function run(argv, dry) {
  console.log("$ " + argv.join(" "));
  if (dry) return;
  const r = spawnSync("npx", argv, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

async function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a;
}

const USAGE = "使い方: controlboard init | create-owner --user <名前> [--password <pw>] [--remote] | setup --name <名前> [--stg] [--dry-run] | deploy --name <名前> [--stg] [--dry-run] | rag-index | mcp --url <サイトのURL> [--token <t>] [--basic <user:pass>]";

if (cmd === "init") {
  const w = await initSite(process.cwd());
  console.log(w.length ? "作成: " + w.join(", ") : "作るファイルはありません");
} else if (cmd === "create-owner") {
  const password = opt("password") || (await ask("パスワード（8文字以上）: "));
  const rec = await ownerRecord({ user: opt("user"), password });
  if (flag("no-change")) rec.items[0].mustChange = false;
  const file = join(await mkdtemp(join(tmpdir(), "cb-")), "users.json");
  await writeFile(file, JSON.stringify(rec));
  const remote = flag("remote");
  if (remote && (await ask("本番の KV に書き込みます。よろしいですか？ (yes/no): ")) !== "yes") process.exit(1);
  run(kvPutPlan({ file, remote }), false);
} else if (cmd === "setup") {
  for (const argv of setupPlan({ name: opt("name"), staging: flag("stg") })) run(argv, flag("dry-run"));
  if (!flag("dry-run")) console.log("表示された KV の id を wrangler.jsonc に書き込んでください");
} else if (cmd === "deploy") {
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
  const argv = deployPlan({ name: opt("name"), staging: flag("stg"), branch });
  if (!flag("dry-run") && !flag("stg") && (await ask("本番にデプロイします。よろしいですか？ (yes/no): ")) !== "yes") process.exit(1);
  run(["astro", "build"], flag("dry-run"));
  run(argv, flag("dry-run"));
} else if (cmd === "mcp") {
  const { startMcp } = await import("./mcp/server.js");
  const env = process.env;
  try {
    await startMcp({
      url: opt("url") || env.CONTROLBOARD_URL,
      token: opt("token") || env.CONTROLBOARD_TOKEN,
      basic: opt("basic") || env.CONTROLBOARD_BASIC,
    });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
} else if (cmd === "rag-index") {
  await import("./rag-index.mjs");
} else {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
