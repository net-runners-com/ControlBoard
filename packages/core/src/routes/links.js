import { json, requirePerm, randHex } from "../runtime/api.js";
import { readLinks, writeLinks, findLink, readHits, summarise, sumDays, seriesDays } from "../runtime/links.js";
export const prerender = false;

const bad = (message) => json({ error: "invalid", message }, 400);

export async function GET({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  const items = await readLinks(env);
  const today = new Date().toISOString();
  /* The statistics screen asks for one period at a time; the manager screen
     asks for nothing and gets its usual four figures. */
  const days = Math.min(90, Math.max(0, parseInt(new URL(request.url).searchParams.get("days") || "0", 10) || 0));
  const withHits = await Promise.all(items.map(async (l) => {
    const hits = await readHits(env, l.code);
    const out = Object.assign({}, l, { hits: summarise(hits, today) });
    if (days) {
      out.views = sumDays(hits, today, days);
      /* One point per day is enough to see a trend; a single-day window has
         nothing to trend, so skip it there. */
      if (days > 1) out.series = seriesDays(hits, today, days);
    }
    return out;
  }));
  return json({ items: withHits });
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const label = String(b.label || "").trim().slice(0, 60);
  const url = String(b.url || "").trim();
  if (!label) return bad("添付先を入れてください。");
  if (!url) return bad("移動先を入れてください。");

  const items = await readLinks(env);
  /* The address is generated, not typed, and carries nothing but itself: it
     sits at the top level of the site, so it has to be short and cannot clash
     with a page name. */
  let code = "";
  for (let i = 0; i < 12 && !code; i++) {
    const candidate = randHex(3);
    if (!findLink(items, candidate)) code = candidate;
  }
  if (!code) return bad("アドレスを作れませんでした。もう一度お試しください。");

  items.unshift({
    code, url,
    label,
    note: String(b.note || "").trim().slice(0, 120),
    disabled: false,
    createdAt: new Date().toISOString(),
  });
  await writeLinks(env, items);
  return json({ ok: true });
}

export async function PUT({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const items = await readLinks(env);
  const l = findLink(items, b.code);
  if (!l) return json({ error: "not_found" }, 404);

  /* The code is the printed address, so it stays put; everything else can move. */
  if (b.url !== undefined) {
    const url = String(b.url).trim();
    if (!url) return bad("移動先のURLを入れてください。");
    l.url = url;
  }
  if (b.label !== undefined) l.label = String(b.label).trim().slice(0, 60);
  if (b.note !== undefined) l.note = String(b.note).trim().slice(0, 120);
  if (b.disabled !== undefined) l.disabled = !!b.disabled;
  await writeLinks(env, items);
  return json({ ok: true });
}

export async function DELETE({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const items = await readLinks(env);
  if (!findLink(items, b.code)) return json({ error: "not_found" }, 404);
  await writeLinks(env, items.filter((l) => l.code !== b.code));
  /* The counts go too — keeping them would resurface under a reused code. */
  await env.CMS.delete("linkhits:" + b.code);
  return json({ ok: true });
}
