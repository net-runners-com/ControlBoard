/* 管理画面のセクション一覧。App.jsx のサイドバーと、RagAssistant.jsx の
   「該当ページを開く」リンクの両方がここを参照する(表示名・必要権限を
   二重管理しないため)。`need` はそのセクションに要る権限で、無いものは
   誰でも開ける。 */
export const SECTIONS = [
  { key: "dashboard", label: "ダッシュボード" },
  { key: "inquiries", label: "お問い合わせ", need: "inquiries" },
  { key: "news", label: "お知らせ", need: "content" },
  { key: "jobs", label: "募集要項", need: "content" },
  { key: "site", label: "サイト編集", need: "content" },
  { key: "links", label: "リンク管理", need: "content" },
  { key: "history", label: "変更履歴", need: "history" },
  { key: "users", label: "ユーザー管理", need: "users" },
  { key: "password", label: "パスワード変更" },
];
