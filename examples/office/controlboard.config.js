import { homeConfig, subConfig } from "./src/blocks.jsx";

/* 作例「みどり会計事務所」。defaults は KV が空のときに出る中身で、
   管理画面で一度保存すれば以後は KV の内容が使われる。 */

/* Puck は部品を足したときにしか defaultProps を入れないので、既定のページでは自分で重ねる。 */
const blocks = (list) => ({
  root: { props: {} },
  content: list.map(([type, props], i) => ({
    type, props: { id: type + "-" + i, ...homeConfig.components[type].defaultProps, ...props },
  })),
});

export default {
  site: { name: "みどり会計事務所", url: "", logo: "", manualUrl: "", canvasCss: "/site.css" },
  blocks: { home: homeConfig, sub: subConfig },
  pages: {
    home: { label: "トップページ", url: "/" },
    about: { label: "事務所案内", url: "/about", jp: "事務所案内", en: "About" },
    service: { label: "サービス・料金", url: "/service", jp: "サービス・料金", en: "Service" },
    news: { label: "お知らせ", url: "/news", jp: "お知らせ", en: "News", fixed: true },
    recruit: { label: "採用情報", url: "/recruit", jp: "採用情報", en: "Recruit", fixed: true },
    contact: { label: "お問い合わせ", url: "/contact", jp: "お問い合わせ", en: "Contact", fixed: true },
  },
  settings: [
    { group: "事務所情報", fields: [
      { key: "contact.tel", label: "電話番号", type: "text" },
      { key: "contact.hours", label: "受付時間", type: "text" },
      { key: "contact.address", label: "所在地", type: "textarea" },
      { key: "contact.email", label: "お問い合わせの通知先メール", type: "text" },
    ] },
    { group: "お知らせバー", fields: [
      { key: "notice.text", label: "サイト上部に出す一文（空なら出さない）", type: "text" },
      { key: "notice.url", label: "リンク先", type: "url" },
    ] },
    { group: "デザイン", fields: [{ key: "theme.primary", label: "メインの色", type: "color" }] },
    { group: "SNS", fields: [
      { key: "sns.items", label: "リンク", type: "list", fields: [
        { key: "label", label: "名前", type: "text" },
        { key: "url", label: "URL", type: "url" },
      ] },
    ] },
  ],
  modules: { news: true, jobs: true, inquiries: true, links: true, stats: false, rag: false },
  defaults: {
    content: {
      contact: { tel: "03-1234-5678", hours: "平日 9:00〜18:00", address: "東京都千代田区緑町1-2-3 グリーンビル5階", email: "" },
      notice: { text: "確定申告のご相談、1月末まで受付中です。", url: "/contact" },
      theme: { primary: "#1d7a55" },
      sns: { items: [] },
      news: [
        { id: "n3", date: "2026.09.01", title: "秋の創業セミナーを開催します", bodyHtml: "<p>10月15日（木）19時から、オンラインで創業セミナーを開催します。参加無料です。</p>" },
        { id: "n2", date: "2026.08.05", title: "夏季休業のお知らせ", bodyHtml: "<p>8月13日から16日まで休業いたします。</p>" },
        { id: "n1", date: "2026.07.01", title: "ホームページを新しくしました", bodyHtml: "<p>料金プランとよくある質問を見やすくしました。</p>" },
      ],
      recruit: { hiring: true },
      jobs: [
        { id: "j1", title: "税理士補助（正社員）", hiring: true, fields: [
          { label: "仕事内容", value: "記帳・月次決算・申告書作成の補助" },
          { label: "給与", value: "月給 25万円〜（経験により優遇）" },
          { label: "勤務時間", value: "9:00〜18:00（繁忙期を除き残業ほぼなし）" },
        ] },
      ],
    },
    pages: {
      home: blocks([
        ["Hero", {}],
        ["Features", {}],
        ["ImageText", { heading: "ごあいさつ", html: "<p>「税理士は敷居が高い」と言われることがあります。私たちは、決算のときだけでなく、日々の小さな迷いにも答えられる存在でありたいと考えています。</p><p>代表税理士　緑川 誠</p>" }],
        ["NewsList", {}],
        ["Cta", {}],
      ]),
      about: blocks([
        ["ImageText", { heading: "私たちについて", html: "<p>2012年開業。中小企業・個人事業主あわせて約180件の顧問先をお手伝いしています。</p>" }],
        ["Staff", {}],
        ["Text", { heading: "所在地", html: "<p>東京都千代田区緑町1-2-3 グリーンビル5階<br>緑町駅 3番出口から徒歩2分</p>" }],
      ]),
      service: blocks([["Services", {}], ["Faq", {}], ["Cta", {}]]),
    },
  },
  seo: {
    pages: { home: { title: "みどり会計事務所｜千代田区の税理士事務所", desc: "中小企業・個人事業主の税務と会計、創業支援。初回相談無料。" } },
    org: { "@type": "AccountingService" },
  },
};
