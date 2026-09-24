import { json, requirePerm, randHex } from "../runtime/api.js";
import { recordVersion } from "../runtime/versions.js";
import config from "virtual:controlboard/config";
import { sectionLabels } from "../config.js";
export const prerender = false;

const SECTION_LABELS = sectionLabels(config);
const labelFor = (keys) => keys.map((k) => SECTION_LABELS[k] || k).join("・");

/* Each announcement has its own page, so it needs an address that survives
   edits to its date or title. Stamped here rather than in the admin so an
   entry can never be stored without one. */
function withNewsIds(doc) {
  if (!Array.isArray(doc.news)) return doc;
  let added = false;
  const news = doc.news.map((n) => {
    if (n && typeof n === "object" && !n.id) { added = true; return Object.assign({ id: randHex(5) }, n); }
    return n;
  });
  return added ? Object.assign({}, doc, { news }) : doc;
}

/* Same reasoning as withNewsIds: a job posting's address on /recruit has to
   survive edits to its title, so the id is stamped server-side. */
function withJobIds(doc) {
  if (!Array.isArray(doc.jobs)) return doc;
  let added = false;
  const jobs = doc.jobs.map((j) => {
    if (j && typeof j === "object" && !j.id) { added = true; return Object.assign({ id: randHex(5) }, j); }
    return j;
  });
  return added ? Object.assign({}, doc, { jobs }) : doc;
}

export async function GET({ locals }) {
  const content = await locals.runtime.env.CMS.get("content", "json");
  return json(content || {});
}

export async function PUT({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  const s = guard.session;
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid" }, 400);
  body = withJobIds(withNewsIds(body));
  body.updatedAt = new Date().toISOString();
  await env.CMS.put("content", JSON.stringify(body));
  await recordVersion(env, { user: s.user, kind: "content", label: "サイト設定", data: body });
  return json({ ok: true });
}

// Admin: merge only the provided top-level keys into the stored document.
// Used by per-section saves so a stale admin tab can no longer roll back
// unrelated sections with a whole-document overwrite.
export async function PATCH({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  const s = guard.session;
  let partial;
  try { partial = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  if (!partial || typeof partial !== "object" || Array.isArray(partial) || !Object.keys(partial).length) {
    return json({ error: "invalid" }, 400);
  }
  const current = (await env.CMS.get("content", "json")) || {};
  const merged = withJobIds(withNewsIds(Object.assign({}, current, partial)));
  merged.updatedAt = new Date().toISOString();
  await env.CMS.put("content", JSON.stringify(merged));
  await recordVersion(env, {
    user: s.user, kind: "content", label: labelFor(Object.keys(partial)), data: merged,
  });
  return json({ ok: true, updated: Object.keys(partial) });
}
