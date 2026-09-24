import { homeConfig, subConfig } from "./src/blocks.jsx";

export default {
  site: { name: "サイト名", url: "", logo: "", manualUrl: "" },
  blocks: { home: homeConfig, sub: subConfig },
  pages: {
    home: { label: "トップページ", url: "/" },
    about: { label: "私たちについて", url: "/about", jp: "私たちについて", en: "About" },
    contact: { label: "お問合せ", url: "/contact", jp: "お問合せ", en: "Contact", fixed: true },
  },
  settings: [
    { group: "基本情報", fields: [
      { key: "contact.tel", label: "電話番号", type: "text" },
      { key: "contact.address", label: "住所", type: "textarea" },
      { key: "contact.email", label: "通知先メール", type: "text" },
    ] },
    { group: "配色", fields: [{ key: "theme.primary", label: "メイン色", type: "color" }] },
    { group: "SNS", fields: [
      { key: "sns.items", label: "リンク", type: "list", fields: [
        { key: "label", label: "名前", type: "text" },
        { key: "url", label: "URL", type: "url" },
      ] },
    ] },
  ],
  modules: { news: true, jobs: true, inquiries: true, links: true, stats: false, rag: false },
  defaults: {
    content: { contact: { tel: "03-0000-0000", address: "", email: "" }, theme: { primary: "#1f6feb" }, sns: { items: [] }, news: [], jobs: [] },
    pages: {
      home: { root: { props: {} }, content: [{ type: "Hero", props: { id: "hero-1", title: "ようこそ", image: "" } }] },
    },
  },
  seo: { pages: { home: { title: "サイト名", desc: "" } }, org: {} },
};
