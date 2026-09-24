import { json, requirePerm } from "../runtime/api.js";
import { readIndex, getVersion, applyVersion, recordVersion } from "../runtime/versions.js";
export const prerender = false;

// Admin: the save history. GET lists it, GET ?seq= returns one snapshot so the
// admin can diff it against what is live, POST { seq } puts that version back.
export async function GET({ request, url, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "history");
  if (guard.error) return guard.error;
  const s = guard.session;

  const raw = url.searchParams.get("seq");
  if (raw == null) {
    const idx = await readIndex(env);
    return json({ items: idx.items });
  }
  const v = await getVersion(env, Number(raw));
  if (!v) return json({ error: "not_found" }, 404);
  return json(v);
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "history");
  if (guard.error) return guard.error;
  const s = guard.session;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  const v = await getVersion(env, Number(body && body.seq));
  if (!v) return json({ error: "not_found" }, 404);

  if (!(await applyVersion(env, v))) return json({ error: "not_restorable" }, 400);
  // Recorded so the state that was replaced is still reachable in the list.
  const meta = await recordVersion(env, {
    user: s.user,
    kind: v.kind,
    pageId: v.pageId,
    label: v.label ? v.label + "（復元）" : "復元",
    data: v.data,
  });
  return json({ ok: true, restored: v.seq, seq: meta.seq });
}
