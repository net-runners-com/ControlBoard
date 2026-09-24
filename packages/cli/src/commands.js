import { cp, readdir, stat, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setPassword } from "@controlboard/core/runtime/users";
import { randHex } from "@controlboard/core/runtime/api";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));
const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p))); else out.push(p);
  }
  return out;
}

/* 既にあるファイルは触らない。書き出したものだけを返す。 */
export async function initSite(dir) {
  const written = [];
  for (const src of await walk(TEMPLATES)) {
    let rel = relative(TEMPLATES, src);
    if (rel === "gitignore") rel = ".gitignore";
    const dest = join(dir, rel);
    if (await exists(dest)) continue;
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest);
    written.push(rel);
  }
  return written;
}

/* KV の users に入れる JSON。平文のパスワードは残さない。 */
export async function ownerRecord({ user, password }) {
  if (!user) throw new Error("ユーザー名を指定してください");
  if (!password || password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  const u = {
    id: randHex(8), user, name: "", role: "owner", perms: null,
    mustChange: true, disabled: false, createdAt: new Date().toISOString(),
  };
  await setPassword(u, password);
  return { items: [u] };
}

export function setupPlan({ name, staging }) {
  if (!name) throw new Error("--name を指定してください");
  const s = staging ? "-stg" : "";
  return [
    ["wrangler", "kv", "namespace", "create", `${name}-cms${s}`],
    ["wrangler", "r2", "bucket", "create", `${name}-media${s}`],
  ];
}

export function deployPlan({ name, staging, branch }) {
  if (!name) throw new Error("--name を指定してください");
  if (!staging && branch !== "main") throw new Error("本番へのデプロイは main ブランチからだけです（今は " + branch + "）");
  return ["wrangler", "pages", "deploy", "dist", "--project-name", staging ? `${name}-stg` : name, "--branch", branch];
}

export function kvPutPlan({ file, remote }) {
  return ["wrangler", "kv", "key", "put", "users", "--path", file, "--binding", "CMS", remote ? "--remote" : "--local"];
}
