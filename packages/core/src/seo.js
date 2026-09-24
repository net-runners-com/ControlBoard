import config from "virtual:controlboard/config";
import { pageDef } from "./runtime/pages.js";

/* ページの title / description / canonical。固定ページは config.seo.pages、
   管理画面で足したページは content.customPages の desc を使う。 */
export function seoFor(pageId, content, url) {
  const site = config.site.name;
  const fixed = config.seo.pages[pageId];
  const def = pageDef(pageId, content) || {};
  const custom = def.custom ? ((content.customPages || []).find((p) => "/" + p.slug === def.url) || {}) : {};
  const title = (fixed && fixed.title) || [def.jp || def.label, site].filter(Boolean).join("｜");
  const desc = (fixed && fixed.desc) || custom.desc || "";
  const base = config.site.url || url.origin;
  return { title, desc, canonical: new URL(url.pathname, base).toString() };
}

export function orgJsonLd(content) {
  const c = (content && content.contact) || {};
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.site.name,
    url: config.site.url,
    ...(c.tel ? { telephone: c.tel } : {}),
    ...config.seo.org,
  };
}
