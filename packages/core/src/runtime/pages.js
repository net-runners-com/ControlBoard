import config from "virtual:controlboard/config";
import { previewToken } from "./content.js";

/* Puck のページ文書は KV の page:<id>。一度も保存していないページは
   サイト設定の defaults.pages から組み立てる（空白のページを出さない）。 */

export const PAGES = config.pages;
export const PAGE_IDS = Object.keys(PAGES);

/* 管理画面から増やしたページ。定義は content.customPages に、中身は page:<id> に入る。 */
export const CUSTOM_PREFIX = "custom-";
export const isCustomId = (id) => String(id || "").startsWith(CUSTOM_PREFIX);
export const slugOfId = (id) => String(id || "").slice(CUSTOM_PREFIX.length);
export const idOfSlug = (slug) => CUSTOM_PREFIX + slug;

/* 住所に使える形だけ通す。英数字とハイフンに限る。 */
export const cleanSlug = (v) =>
  String(v || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40);

const RESERVED = new Set(
  PAGE_IDS.map((id) => PAGES[id].url.replace(/^\//, ""))
    .concat(["admin", "api", "media", "assets", "rag-admin", "manual", "sitemap.xml", "robots.txt"])
    .filter(Boolean)
);

export const customPages = (content) => {
  const list = (content || {}).customPages;
  return Array.isArray(list) ? list.filter((p) => p && p.slug) : [];
};
export const slugTaken = (slug, content) =>
  RESERVED.has(slug) || customPages(content).some((p) => p.slug === slug);

/* 固定ページの「削除」は、公開側に出さない印を content に持つだけ。印を外せば戻る。 */
export const hiddenPageIds = (content) => {
  const list = (content || {}).hiddenPages;
  return Array.isArray(list) ? list.filter((id) => PAGES[id]) : [];
};
export const isPageHidden = (id, content) => hiddenPageIds(content).includes(id);
/* トップと fixed の付いたページ（記事の共通レイアウトなど）は消せない。 */
export const DELETABLE_PAGE_IDS = PAGE_IDS.filter((id) => id !== "home" && !PAGES[id].fixed);
export const findCustom = (content, slug) =>
  customPages(content).find((p) => p.slug === slug) || null;

/* 固定ページと追加ページを同じ形で返す。知らない名前には null。 */
export function pageDef(id, content) {
  if (PAGES[id]) return PAGES[id];
  if (!isCustomId(id)) return null;
  const p = findCustom(content, slugOfId(id));
  if (!p) return null;
  return {
    label: p.label || p.jp || p.slug,
    url: "/" + p.slug,
    en: p.en || "Page",
    jp: p.jp || p.label || p.slug,
    image: p.image || "",
    imageSp: p.imageSp || "",
    custom: true,
  };
}

/* サイト編集で並べ替えた順。知らない名前が混ざっても全ページを返す。 */
export function allPageIds(content) {
  const known = PAGE_IDS.concat(customPages(content).map((p) => idOfSlug(p.slug)));
  const saved = ((content || {}).pageOrder || []).filter((id) => known.includes(id));
  return saved.concat(known.filter((id) => !saved.includes(id)));
}

/* defaults.pages[id] は文書そのものか、content を受け取って文書を返す関数。 */
export function defaultDataFor(id, content) {
  const d = config.defaults.pages[id];
  const doc = typeof d === "function" ? d(content || {}) : d;
  if (doc && Array.isArray(doc.content)) return JSON.parse(JSON.stringify(doc));
  return { root: { props: {} }, content: [] };
}

export async function getPage(env, id, url, content) {
  const token = previewToken(url);
  if (token) {
    try {
      const draft = await env.CMS.get("preview:" + token, "json");
      const page = draft && draft.__pages && draft.__pages[id];
      if (page && Array.isArray(page.content)) return page;
    } catch (e) { /* 期限切れ → 保存済みへ */ }
  }
  try {
    const saved = await env.CMS.get("page:" + id, "json");
    if (saved && Array.isArray(saved.content)) return saved;
  } catch (e) { /* KV 不調 → 既定の並びへ */ }
  return defaultDataFor(id, content);
}
