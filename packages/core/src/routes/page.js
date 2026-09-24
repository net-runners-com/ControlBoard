import { json, requirePerm } from "../runtime/api.js";
import { getContent } from "../runtime/content.js";
import { defaultDataFor, pageDef, PAGES } from "../runtime/pages.js";
import { recordVersion } from "../runtime/versions.js";
export const prerender = false;

/* 固定ページはいつでも通す。追加したページは content に書いてあるものだけ通す
   （pageDef が知らない名前には null を返す）。 */
const idOf = (url) => url.searchParams.get("id") || "home";

// Public: the page document the site renders. Falls back to the layout
// generated from the CMS content when the page has never been saved.
export async function GET({ url, locals }) {
  const env = locals.runtime.env;
  const id = idOf(url);
  const content = await getContent(env);
  if (!pageDef(id, content)) return json({ error: "unknown_page" }, 404);
  const saved = await env.CMS.get("page:" + id, "json");
  if (saved && Array.isArray(saved.content)) return json({ id, data: saved, saved: true });
  return json({ id, data: defaultDataFor(id, content), saved: false });
}

// Admin: replace the page document.
export async function PUT({ request, url, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  const s = guard.session;
  const id = idOf(url);
  const cur = (await env.CMS.get("content", "json")) || {};
  const def = pageDef(id, cur);
  if (!def) return json({ error: "unknown_page" }, 404);
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || !Array.isArray(body.content)) {
    return json({ error: "invalid" }, 400);
  }
  const doc = { root: body.root || { props: {} }, content: body.content };
  await env.CMS.put("page:" + id, JSON.stringify(doc));
  /* ページ名はメニューと管理画面のページ一覧にも出る。ページの文書を全部
     読みに行くわけにはいかないので、保存のたびに共通の内容へ控えておく。
     fixed のページ（記事の共通レイアウトなど）は対象外。 */
  if (id !== "home" && !(PAGES[id] && PAGES[id].fixed)) {
    const jp = String(((doc.root || {}).props || {}).jp || "").trim();
    const titles = Object.assign({}, cur.pageTitles);
    if (jp && jp !== def.label) titles[id] = jp; else delete titles[id];
    if (JSON.stringify(titles) !== JSON.stringify(cur.pageTitles || {})) {
      cur.pageTitles = titles;
      await env.CMS.put("content", JSON.stringify(cur));
    }
  }
  await recordVersion(env, {
    user: s.user, kind: "page", pageId: id,
    label: def.label || id, data: doc,
  });
  return json({ ok: true, id });
}
