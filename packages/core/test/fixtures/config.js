import { normalizeConfig } from "../../src/config.js";

const blocks = { home: { components: {} }, sub: { components: {} } };

export default normalizeConfig({
  site: { name: "テスト事務所", url: "https://example.test", logo: "", manualUrl: "" },
  blocks,
  pages: {
    home: { label: "トップページ", url: "/" },
    about: { label: "私たちについて", url: "/about", jp: "私たちについて", en: "About" },
    news: { label: "お知らせ", url: "/news", jp: "お知らせ", en: "News", fixed: true },
  },
  settings: [
    { group: "基本情報", fields: [
      { key: "contact.tel", label: "電話番号", type: "text" },
      { key: "contact.access", label: "アクセス", type: "textarea" },
    ] },
    { group: "配色", fields: [{ key: "theme.primary", label: "メイン色", type: "color" }] },
  ],
  modules: { news: true, jobs: false, inquiries: true, links: false, stats: false, rag: false },
  defaults: {
    content: { contact: { tel: "03-0000-0000" }, theme: { primary: "#123456" } },
    pages: { home: { root: { props: { title: "ようこそ" } }, content: [] } },
  },
  seo: { pages: { home: { title: "テスト事務所", desc: "説明" } }, org: { name: "テスト事務所" } },
});
