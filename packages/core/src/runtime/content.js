import config from "virtual:controlboard/config";

// Tokens minted by /api/preview (randHex(16) → 32 hex chars).
const PREVIEW_TOKEN = /^[0-9a-f]{32}$/;

export function previewToken(url) {
  const t = url && url.searchParams ? url.searchParams.get("preview") : null;
  return t && PREVIEW_TOKEN.test(t) ? t : null;
}

/* KV の content を、サイト設定の既定値の上にトップレベルで重ねる。
   ?preview=<token> のときは保存前の下書きで描く（管理画面の変更前後の比較枠が読む）。 */
export async function getContent(env, url) {
  const DEFAULT = config.defaults.content;
  const token = previewToken(url);
  if (token) {
    try {
      const draft = await env.CMS.get("preview:" + token, "json");
      if (draft && typeof draft === "object" && Object.keys(draft).length) return Object.assign({}, DEFAULT, draft);
    } catch (e) { /* 期限切れ・KV 不調 → 公開中の内容へ */ }
  }
  try {
    const live = await env.CMS.get("content", "json");
    if (live && typeof live === "object" && Object.keys(live).length) return Object.assign({}, DEFAULT, live);
  } catch (e) { /* KV 不調 → 既定値 */ }
  return DEFAULT;
}
