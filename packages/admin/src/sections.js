/* 管理画面のセクション一覧。App.jsx のサイドバーと、RagAssistant.jsx の
   「該当ページを開く」リンクの両方がここを参照する。`need` は必要な権限、
   `module` はサイト設定でオフにできる機能。 */
export const SECTIONS = [
  { key: "dashboard", label: "ダッシュボード" },
  { key: "inquiries", label: "お問い合わせ", need: "inquiries", module: "inquiries" },
  { key: "news", label: "お知らせ", need: "content", module: "news" },
  { key: "jobs", label: "募集要項", need: "content", module: "jobs" },
  { key: "site", label: "サイト編集", need: "content" },
  { key: "links", label: "リンク管理", need: "content", module: "links" },
  { key: "history", label: "変更履歴", need: "history" },
  { key: "users", label: "ユーザー管理", need: "users" },
  { key: "tokens", label: "AI連携" },
  { key: "password", label: "パスワード変更" },
];
