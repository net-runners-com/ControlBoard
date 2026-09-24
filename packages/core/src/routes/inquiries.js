import { json, requirePerm } from "../runtime/api.js";
export const prerender = false;

async function readBodyKey(request) {
  let b;
  try { b = await request.json(); } catch { return null; }
  const key = b && typeof b.key === "string" ? b.key : "";
  if (!key.startsWith("inq:")) return null;
  return { key, body: b };
}

export async function GET({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "inquiries");
  if (guard.error) return guard.error;
  const s = guard.session;
  const list = await env.CMS.list({ prefix: "inq:", limit: 200 });
  const items = (
    await Promise.all(list.keys.map(async (k) => {
      const v = await env.CMS.get(k.name, "json");
      return v ? { key: k.name, ...v } : null;
    }))
  ).filter(Boolean);
  return json({ items });
}

export async function PUT({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "inquiries");
  if (guard.error) return guard.error;
  const s = guard.session;
  const p = await readBodyKey(request);
  if (!p) return json({ error: "invalid" }, 400);
  const v = await env.CMS.get(p.key, "json");
  if (!v) return json({ error: "not_found" }, 404);
  v.read = !!p.body.read;
  await env.CMS.put(p.key, JSON.stringify(v));
  return json({ ok: true });
}

export async function DELETE({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "inquiries");
  if (guard.error) return guard.error;
  const s = guard.session;
  const p = await readBodyKey(request);
  if (!p) return json({ error: "invalid" }, 400);
  await env.CMS.delete(p.key);
  return json({ ok: true });
}
