import { json, requirePerm } from "../runtime/api.js";
import config from "virtual:controlboard/config";
import { getContent } from "../runtime/content.js";
import { allPageIds, pageDef, hiddenPageIds, DELETABLE_PAGE_IDS, isCustomId } from "../runtime/pages.js";
export const prerender = false;

/* 管理画面は設定をビルドに焼き込んでいるが、外から API を使う側（MCP）は知らない。
   何を編集できるか（ページ・共通設定の項目・ブロックの部品）をここで渡す。 */

/* Puck のフィールドには関数（custom の render など）が混ざるので、JSON にできる部分だけ残す。 */
function plain(v, depth = 0) {
  if (depth > 8 || typeof v === "function") return undefined;
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1)).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    if (v.$$typeof) return undefined; // React の要素
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const p = plain(x, depth + 1);
      if (p !== undefined) out[k] = p;
    }
    return out;
  }
  return v;
}

const blocksOf = (puck) => {
  const out = {};
  for (const [name, c] of Object.entries((puck && puck.components) || {})) {
    out[name] = { label: c.label || name, fields: plain(c.fields || {}), defaultProps: plain(c.defaultProps || {}) };
  }
  return { components: out, root: plain(((puck && puck.root) || {}).fields || {}) };
};

export async function GET({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, null);
  if (guard.error) return guard.error;
  const content = await getContent(env);
  const hidden = hiddenPageIds(content);
  const pages = allPageIds(content).map((id) => {
    const d = pageDef(id, content) || {};
    return {
      id, label: d.label || id, url: d.url || "", custom: !!d.custom,
      template: !!d.template, fixed: !!d.fixed, hidden: hidden.includes(id),
      deletable: isCustomId(id) || DELETABLE_PAGE_IDS.includes(id),
      blocks: id === "home" ? "home" : "sub",
    };
  });
  return json({
    site: config.site,
    modules: config.modules,
    pages,
    settings: config.settings,
    blocks: { home: blocksOf(config.blocks.home), sub: blocksOf(config.blocks.sub) },
  });
}
