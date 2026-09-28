import config from "virtual:controlboard/config";

/* 管理画面の色。サイトごとに config.site.adminColor で変えられる。CSS は --brand から
   残りの色を作るので、ここで決めるのは1色だけ。グラフなど JS で色を渡す所もこれを使う。 */
export const BRAND = config.site.adminColor || "#2563eb";
export const SUB = "#94a3b8";
export const SERIES = [BRAND, "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function applyTheme() {
  if (config.site.adminColor) document.documentElement.style.setProperty("--brand", config.site.adminColor);
}
