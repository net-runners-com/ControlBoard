import { json, requirePerm } from "../runtime/api.js";
import { readUsers, can } from "../runtime/users.js";
import { readTokens, writeTokens, createToken, publicToken } from "../runtime/tokens.js";
export const prerender = false;

/* 自分のトークンは誰でも発行・取り消しできる。ユーザー管理の権限があれば全員分を見て消せる。
   発行と取り消しはログインしている人だけ（漏れたトークンで増やされないように）。 */

const visible = (items, user) => (can(user, "users") ? items : items.filter((t) => t.userId === user.id));

export async function GET({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, null);
  if (guard.error) return guard.error;
  const [items, users] = await Promise.all([readTokens(env), readUsers(env)]);
  return json({ items: visible(items, guard.user).map((t) => publicToken(t, users)) });
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, null);
  if (guard.error) return guard.error;
  if (!guard.session.sid) return json({ error: "forbidden", message: "トークンの発行は管理画面から行ってください。" }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const { raw, item } = await createToken(env, guard.user, b && b.label);
  return json({ ok: true, token: raw, item });
}

export async function DELETE({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, null);
  if (guard.error) return guard.error;
  if (!guard.session.sid) return json({ error: "forbidden", message: "トークンの取り消しは管理画面から行ってください。" }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const items = await readTokens(env);
  const t = visible(items, guard.user).find((x) => x.id === (b && b.id));
  if (!t) return json({ error: "not_found" }, 404);
  await writeTokens(env, items.filter((x) => x.id !== t.id));
  return json({ ok: true });
}
