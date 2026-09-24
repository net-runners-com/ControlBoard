import { json, getSession, sessionCookie } from "../runtime/api.js";
export const prerender = false;

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const s = await getSession(env, request);
  if (s) await env.CMS.delete("session:" + s.sid);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
