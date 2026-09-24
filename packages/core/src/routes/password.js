import { json, getSession, pbkdf2, safeEqual, PBKDF2_ITER } from "../runtime/api.js";
import { readUsers, writeUsers, setPassword } from "../runtime/users.js";
export const prerender = false;

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const s = await getSession(env, request);
  if (!s) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const current = body?.current || "";
  const next = body?.next || "";
  if (next.length < 8) return json({ error: "weak", message: "パスワードは8文字以上にしてください。" }, 400);

  const items = await readUsers(env);
  const u = items.find((x) => x.user === s.user);
  if (!u) return json({ error: "not_configured" }, 500);

  const curHash = await pbkdf2(current, u.salt, u.iterations || PBKDF2_ITER);
  if (!safeEqual(curHash, u.hash)) return json({ error: "invalid_current", message: "現在のパスワードが違います。" }, 401);

  await setPassword(u, next);
  u.mustChange = false;
  await writeUsers(env, items);
  return json({ ok: true });
}
