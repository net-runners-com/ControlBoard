import { json, requirePerm } from "../runtime/api.js";
import { readNames, setName, dropName, nameFor, mediaPrefix } from "../runtime/media.js";
export const prerender = false;

// Admin: the uploaded-image library. 本番は uploads/ 、試験は staging/uploads/ を
// 一覧する（同じバケットの中で頭の文字で分ける）。
export async function GET({ request, url, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  const s = guard.session;

  const cursor = url.searchParams.get("cursor") || undefined;
  const [list, names] = await Promise.all([
    env.MEDIA.list({ prefix: mediaPrefix(env), limit: 100, cursor }),
    readNames(env),
  ]);
  const items = (list.objects || []).map((o) => ({
    key: o.key,
    url: "/media/" + o.key,
    name: nameFor(names, o.key),
    size: o.size,
    at: o.uploaded ? new Date(o.uploaded).toISOString() : null,
  }));
  // Newest first: R2 lists lexicographically and the keys are random.
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return json({ items, cursor: list.truncated ? list.cursor : null });
}

// Renaming only touches the label. The URL a page stores keeps working.
export async function PATCH({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  const key = body && body.key;
  if (typeof key !== "string" || !key.startsWith(mediaPrefix(env))) return json({ error: "invalid" }, 400);
  const name = String((body && body.name) || "").trim().slice(0, 80);
  await setName(env, key, name);
  return json({ ok: true, name: name || key.split("/").pop() });
}

export async function DELETE({ request, url, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  const s = guard.session;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  const key = body && body.key;
  if (typeof key !== "string" || !key.startsWith(mediaPrefix(env))) return json({ error: "invalid" }, 400);
  await env.MEDIA.delete(key);
  await dropName(env, key);
  // Best effort: the Cache API only reaches the colo handling this request, so
  // other regions may keep serving the file until its entry ages out.
  try { await caches.default.delete(new URL("/media/" + key, url).toString()); } catch (e) {}
  return json({ ok: true });
}
