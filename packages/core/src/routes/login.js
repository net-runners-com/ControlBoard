import { json, pbkdf2, safeEqual, randHex, sessionCookie, SESSION_TTL, PBKDF2_ITER } from "../runtime/api.js";
import { findUser, permsOf } from "../runtime/users.js";
export const prerender = false;

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const name = (body?.user || "").trim();
  const password = body?.password || "";
  if (!name || !password) return json({ error: "missing" }, 400);

  const u = await findUser(env, name);
  // Hash even when the account is unknown, so a wrong ID and a wrong password
  // take the same time to answer.
  const salt = (u && u.salt) || "00000000000000000000000000000000";
  const hash = await pbkdf2(password, salt, (u && u.iterations) || PBKDF2_ITER);
  if (!u || u.disabled || !safeEqual(hash, u.hash)) return json({ error: "invalid_credentials" }, 401);

  const token = randHex(24);
  await env.CMS.put("session:" + token, JSON.stringify({ user: u.user }), { expirationTtl: SESSION_TTL });
  return json(
    { ok: true, mustChange: !!u.mustChange, role: u.role, perms: permsOf(u) },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}
