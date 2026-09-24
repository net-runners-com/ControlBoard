import { json, requirePerm, randHex } from "../runtime/api.js";
export const prerender = false;

// Draft previews live in KV just long enough for the admin to look at them.
export const PREVIEW_TTL = 900; // 15 min

// Admin: stash a draft content document and hand back a token. The site pages
// render that draft when called with ?preview=<token>, so the before/after
// panes in the admin are the real pages, not a re-implementation of them.
export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid" }, 400);
  const token = randHex(16);
  await env.CMS.put("preview:" + token, JSON.stringify(body), { expirationTtl: PREVIEW_TTL });
  return json({ ok: true, token, ttl: PREVIEW_TTL });
}
