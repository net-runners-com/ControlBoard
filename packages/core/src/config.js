/* サイトの controlboard.config.js を検査し、省略された項目を埋める。
   書き間違いは黙って無視せず、ビルドの時点で項目名入りで止める。 */

export const MODULES = ["news", "jobs", "inquiries", "links", "stats", "rag"];
export const FIELD_TYPES = ["text", "textarea", "richtext", "color", "image", "url", "list", "group"];

function checkField(f, where) {
  if (!f || typeof f !== "object" || !f.key || !f.label) {
    throw new Error(`controlboard: ${where} に key と label のないフィールドがあります`);
  }
  if (!FIELD_TYPES.includes(f.type)) {
    throw new Error(`controlboard: unknown field type "${f.type}" for ${f.key}`);
  }
  if (f.type === "list" || f.type === "group") {
    return { ...f, fields: (f.fields || []).map((x) => checkField(x, f.key)) };
  }
  return { ...f };
}

export function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("controlboard: config must export an object");
  if (!raw.blocks || !raw.blocks.home || !raw.blocks.sub) {
    throw new Error("controlboard: config.blocks.home and config.blocks.sub are required");
  }
  const unknown = Object.keys(raw.modules || {}).filter((k) => !MODULES.includes(k));
  if (unknown.length) throw new Error("controlboard: unknown module: " + unknown.join(", "));
  const modules = {};
  for (const m of MODULES) modules[m] = !!(raw.modules && raw.modules[m] === true);

  const pages = raw.pages || { home: { label: "トップページ", url: "/" } };
  if (!pages.home) throw new Error("controlboard: config.pages.home is required");

  const settings = (raw.settings || []).map((g) => ({
    group: String(g.group || ""),
    fields: (g.fields || []).map((f) => checkField(f, g.group)),
  }));

  return {
    site: { name: "", url: "", logo: "", manualUrl: "", canvasCss: "", ...raw.site },
    blocks: raw.blocks,
    pages,
    settings,
    modules,
    defaults: { content: {}, pages: {}, ...raw.defaults },
    seo: { pages: {}, org: {}, ...raw.seo },
    csp: { img: [], frame: [], script: [], connect: [], ...raw.csp },
  };
}

/* 共通設定タブの「保存」で送るトップレベルキー。 */
export const settingsTopKeys = (settings) =>
  [...new Set(settings.flatMap((g) => g.fields.map((f) => f.key.split(".")[0])))];

/* 変更前後の比較画面で、キーを日本語の項目名に置き換えるための表。 */
export function labelsFromSettings(settings) {
  const out = {};
  const walk = (fields) => fields.forEach((f) => {
    out[f.key.split(".").pop()] = f.label;
    if (f.fields) walk(f.fields);
  });
  settings.forEach((g) => {
    g.fields.forEach((f) => { const top = f.key.split(".")[0]; if (!out[top]) out[top] = g.group; });
    walk(g.fields);
  });
  return out;
}

/* 変更履歴に出す「どこを保存したか」の名前。 */
export function sectionLabels(config) {
  const out = {
    news: "お知らせ", jobs: "募集要項", recruit: "採用情報",
    pageOrder: "ページの並び順", pageTitles: "ページ名", customPages: "ページ", hiddenPages: "ページ",
  };
  config.settings.forEach((g) => g.fields.forEach((f) => {
    const top = f.key.split(".")[0];
    if (!out[top]) out[top] = g.group;
  }));
  return out;
}
