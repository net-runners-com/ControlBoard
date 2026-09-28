/* AI（MCP）などプログラムから API を呼ぶためのトークン。ログインの代わりに
   ヘッダーで送る。権限は持ち主のユーザーに従い、持ち主を止める・消すと使えなくなる。
   KV には SHA-256 の値だけを置き、平文は発行時に一度だけ返す。

   KV: tokens -> { items: [{ id, userId, label, hash, createdAt, lastUsedAt }] } */

import { randHex } from "./api.js";
import { readUsers } from "./users.js";

/* staging の Basic 認証が Authorization を使うので、別のヘッダーにする。 */
export const TOKEN_HEADER = "x-controlboard-token";
const PREFIX = "cb_";
/* 使うたびに書くと KV の書き込みがかさむので、最後に使った日時は1時間単位で控える。 */
const TOUCH_EVERY = 60 * 60 * 1000;

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readTokens(env) {
  const stored = await env.CMS.get("tokens", "json");
  return stored && Array.isArray(stored.items) ? stored.items : [];
}
export const writeTokens = (env, items) => env.CMS.put("tokens", JSON.stringify({ items }));

export const publicToken = (t, users) => {
  const u = users && users.find((x) => x.id === t.userId);
  return {
    id: t.id, label: t.label, userId: t.userId, user: u ? u.user : null,
    createdAt: t.createdAt || null, lastUsedAt: t.lastUsedAt || null,
  };
};

export async function createToken(env, user, label) {
  const raw = PREFIX + randHex(24);
  const item = {
    id: randHex(6), userId: user.id,
    label: String(label || "").trim().slice(0, 60) || "トークン",
    hash: await sha256(raw), createdAt: new Date().toISOString(), lastUsedAt: null,
  };
  const items = await readTokens(env);
  items.push(item);
  await writeTokens(env, items);
  return { raw, item: publicToken(item, [user]) };
}

/* 通れば持ち主のユーザー（users の要素）を、通らなければ null を返す。 */
export async function verifyToken(env, raw) {
  if (typeof raw !== "string" || !raw.startsWith(PREFIX)) return null;
  const hash = await sha256(raw);
  const items = await readTokens(env);
  const t = items.find((x) => x.hash === hash);
  if (!t) return null;
  const u = (await readUsers(env)).find((x) => x.id === t.userId);
  if (!u || u.disabled) return null;
  const now = Date.now();
  if (!t.lastUsedAt || now - Date.parse(t.lastUsedAt) > TOUCH_EVERY) {
    t.lastUsedAt = new Date(now).toISOString();
    await writeTokens(env, items);
  }
  return { ...u, tokenId: t.id };
}
