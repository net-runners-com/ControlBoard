import { json, requirePerm } from "../runtime/api.js";
import { recordVersion } from "../runtime/versions.js";
import { cleanSlug, slugTaken, customPages, idOfSlug, PAGES, DELETABLE_PAGE_IDS, hiddenPageIds } from "../runtime/pages.js";
export const prerender = false;

/* Pages the client adds themselves. The definition (address, title, header
   image) rides along in the shared content document, so rendering a page never
   costs an extra lookup; the body lives in page:<id> like every other page. */

const bad = (message) => json({ error: "invalid", message }, 400);

const readContent = async (env) => (await env.CMS.get("content", "json")) || {};

async function writeContent(env, doc, user, label) {
  doc.updatedAt = new Date().toISOString();
  await env.CMS.put("content", JSON.stringify(doc));
  await recordVersion(env, { user, kind: "content", label, data: doc });
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const title = String(b.title || "").trim().slice(0, 60);
  if (!title) return bad("ページ名を入れてください。");

  const content = await readContent(env);
  /* 住所を書かなかったときは題名から作る。日本語だけの題名では作れないので、
     そのときは日付を混ぜた短い住所にする。 */
  let slug = cleanSlug(b.slug || title);
  if (!slug) slug = "page-" + Math.random().toString(36).slice(2, 7);
  if (slugTaken(slug, content)) return bad("その住所はすでに使われています。別の住所にしてください。");

  const page = {
    slug, label: title, jp: title,
    en: String(b.en || "Page").trim().slice(0, 40),
    desc: String(b.desc || "").trim().slice(0, 200),
    image: "", imageSp: "", inNav: !!b.inNav,
    createdAt: new Date().toISOString(),
  };
  content.customPages = customPages(content).concat([page]);
  await writeContent(env, content, guard.session.user, "ページを追加（" + title + "）");
  return json({ ok: true, id: idOfSlug(slug), page });
}

export async function PUT({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const content = await readContent(env);

  /* 決まったページの復元。hiddenPages の印を外すだけ。 */
  if (b.id && b.restore) {
    if (!PAGES[b.id]) return json({ error: "not_found" }, 404);
    content.hiddenPages = hiddenPageIds(content).filter((x) => x !== b.id);
    await writeContent(env, content, guard.session.user, "ページを復元（" + PAGES[b.id].label + "）");
    return json({ ok: true });
  }

  const list = customPages(content);
  const page = list.find((p) => p.slug === b.slug);
  if (!page) return json({ error: "not_found" }, 404);

  if (b.title !== undefined) {
    const title = String(b.title).trim().slice(0, 60);
    if (!title) return bad("ページ名を入れてください。");
    page.label = title; page.jp = title;
  }
  if (b.en !== undefined) page.en = String(b.en).trim().slice(0, 40);
  if (b.desc !== undefined) page.desc = String(b.desc).trim().slice(0, 200);
  if (b.inNav !== undefined) page.inNav = !!b.inNav;

  content.customPages = list;
  await writeContent(env, content, guard.session.user, "ページの設定（" + page.label + "）");
  return json({ ok: true, page });
}

export async function DELETE({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;

  let b;
  try { b = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const content = await readContent(env);

  /* 決まったページは実体を消す代わりに hiddenPages へ印を付ける。ルートや
     中身はそのままなので、復元すれば元通り。 */
  if (b.id) {
    if (!DELETABLE_PAGE_IDS.includes(b.id)) return bad("このページは削除できません。");
    const hidden = hiddenPageIds(content);
    if (!hidden.includes(b.id)) {
      content.hiddenPages = hidden.concat([b.id]);
      await writeContent(env, content, guard.session.user, "ページを削除（" + PAGES[b.id].label + "）");
    }
    return json({ ok: true });
  }

  const page = customPages(content).find((p) => p.slug === b.slug);
  if (!page) return json({ error: "not_found" }, 404);

  content.customPages = customPages(content).filter((p) => p.slug !== b.slug);
  /* 並び順にも名前が残るので、そこからも抜く。 */
  const id = idOfSlug(page.slug);
  if (Array.isArray(content.pageOrder)) content.pageOrder = content.pageOrder.filter((x) => x !== id);
  if (content.pageTitles) delete content.pageTitles[id];

  await writeContent(env, content, guard.session.user, "ページを削除（" + page.label + "）");
  /* 中身は消さずに残す。取り消したくなったとき、同じ住所で作り直せば戻る。 */
  return json({ ok: true });
}
