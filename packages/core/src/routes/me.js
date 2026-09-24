import { json, getSession } from "../runtime/api.js";
import { findUser, permsOf } from "../runtime/users.js";
export const prerender = false;

/* 管理画面に「いまどちらを触っているか」を伝える。ログイン前から必要なので、
   認証されていない応答にも入れる。 */
const envName = (env) => (String(env.SITE_ENV || "") === "staging" ? "staging" : "production");

export async function GET({ request, locals }) {
  const env = locals.runtime.env;
  const s = await getSession(env, request);
  if (!s) return json({ authenticated: false, env: envName(env) });
  const u = await findUser(env, s.user);
  if (!u || u.disabled) return json({ authenticated: false });
  return json({
    authenticated: true,
    env: envName(env),
    user: u.user,
    name: u.name || "",
    role: u.role,
    perms: permsOf(u),
    mustChange: !!u.mustChange,
  });
}
