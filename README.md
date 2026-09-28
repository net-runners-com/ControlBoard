# ControlBoard

Astro + Cloudflare Pages のサイトに、管理画面（ログイン・ユーザー権限・Puck でのページ編集・画像・変更履歴・お問い合わせ・お知らせ・募集要項・短縮リンク・統計・アシスタント）を1行で組み込む Astro integration。

## 構成

| パス | 中身 |
|---|---|
| `packages/core` | `@controlboard/core`。API ルート・middleware の注入、サイト設定の読み込み、実行時ライブラリ |
| `packages/admin` | 管理画面（React）。サイトのビルド時に、そのサイトの Puck ブロックと一緒にビルドされる |
| `packages/cli` | `controlboard` コマンド（init / create-owner / setup / deploy / rag-index） |
| `playground` | 動作確認用のサイト（ローカル専用） |
| `examples/office` | 作例のサイト（架空の会計事務所）。`pnpm dev` で http://localhost:4410/ |

データは KV（binding `CMS`）と R2（binding `MEDIA`）に置く。

## サイトへの組み込み

```bash
pnpm add @controlboard/core@file:../ControlBoard/packages/core
npx controlboard init   # controlboard.config.js・ブロックの見本・ページの雛形を書き出す（既存ファイルは触らない）
```

`astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import controlboard from "@controlboard/core";

export default defineConfig({
  output: "server",
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [react(), controlboard()],
});
```

サイト側で書くのは `controlboard.config.js`・`src/blocks.jsx`（Puck のブロック）・CSS だけ。

### `controlboard.config.js`

```js
import { homeConfig, subConfig } from "./src/blocks.jsx";

export default {
  site: { name: "○○事務所", url: "https://example.jp", logo: "/logo.png", manualUrl: "", canvasCss: "/site.css", adminColor: "#2563eb" },  // adminColor: 管理画面の色（省略時は青）
  blocks: { home: homeConfig, sub: subConfig },          // Puck の設定。quick: [{ type, t, d }] で「追加」の先頭に出す部品を選べる
  pages: {                                               // 固定ページ。home は必須
    home: { label: "トップページ", url: "/" },
    about: { label: "私たちについて", url: "/about", jp: "私たちについて", en: "About" },
    contact: { label: "お問合せ", url: "/contact", fixed: true },   // fixed: 削除させない
    // newsArticle: { label: "お知らせ（記事）", url: "/news", template: true },  // template: ページではなく枠
  },
  settings: [                                            // 共通設定タブのフォームはここから作られる
    { group: "基本情報", fields: [
      { key: "contact.tel", label: "電話番号", type: "text" },
      { key: "contact.email", label: "通知先メール", type: "text" },
    ] },
  ],
  modules: { news: true, jobs: false, inquiries: true, links: true, stats: false, rag: false },
  defaults: { content: {}, pages: { home: { root: { props: {} }, content: [] } } },
  seo: { pages: { home: { title: "○○事務所", desc: "" } }, org: {} },
  csp: { img: [], frame: [], script: [], connect: [] },  // 外部の読み込み先を足す
};
```

- 設定項目の型: `text` / `textarea` / `richtext` / `color` / `image` / `url` / `list` / `group`
- 書き間違い（未知の型・未知のモジュール）はビルド時にエラーで止まる
- 無効にしたモジュールの API は 404

### ページでの使い方

```astro
---
import { Render } from "@measured/puck";
import config from "virtual:controlboard/config";
import { getContent } from "@controlboard/core/runtime/content";
import { getPage } from "@controlboard/core/runtime/pages";
const env = Astro.locals.runtime.env;
const content = await getContent(env, Astro.url);
const data = await getPage(env, "home", Astro.url, content);
---
<Render config={config.blocks.home} data={data} />
```

SEO は `@controlboard/core/seo` の `seoFor(pageId, content, url)` と `orgJsonLd(content)`。ブロックのリッチテキスト・画像の入力欄は `@controlboard/core/puck` の `richField(label)` / `imageField(label, hint)`。

## コマンド

| コマンド | 内容 |
|---|---|
| `controlboard setup --name <名前> [--stg] [--dry-run]` | KV と R2 を作る |
| `controlboard create-owner --user <名前> [--remote]` | 最初のオーナーを作る（既定はローカルの KV） |
| `controlboard deploy --name <名前> [--stg] [--dry-run]` | ビルドしてデプロイ。本番は main ブランチからだけ・確認あり |
| `controlboard rag-index` | `rag-docs/` からアシスタントの索引を作る |
| `controlboard mcp --url <サイトのURL> [--token <t>] [--basic <user:pass>]` | AI から操作するための MCP サーバー（stdio） |

アカウントはサイトごとに cfauth（`.cfauth`）で分ける。

## AI から操作する（MCP）

管理画面でできることは、Claude などの AI から MCP 経由でもできる。

1. 管理画面の「AI連携」でトークンを発行する（表示は発行直後の一度だけ）。権限は発行した人と同じ
2. AI のクライアントに登録する

```bash
# Claude Code
claude mcp add controlboard -e CONTROLBOARD_TOKEN=cb_... -- npx controlboard mcp --url https://example.jp
```

```json
// Claude Desktop など
{ "mcpServers": { "controlboard": {
  "command": "npx", "args": ["controlboard", "mcp", "--url", "https://example.jp"],
  "env": { "CONTROLBOARD_TOKEN": "cb_..." }
} } }
```

- ツール: サイト構成の取得（`get_site_schema`）、共通の内容・お知らせ・募集要項、ページの取得・保存・追加・削除、プレビュー、変更履歴と復元、画像、短縮リンク、お問い合わせ、統計、マニュアルへの質問、ユーザー管理
- 取り消せない操作（削除・復元・ユーザー変更など）には `destructiveHint` を付けている
- トークンは `x-controlboard-token` ヘッダーで送る。staging の Basic 認証は `--basic` か `CONTROLBOARD_BASIC` で別に渡す
- 持ち主を停止・削除すると、そのトークンも使えなくなる。トークンの発行と取り消しは管理画面（ログイン）からだけ
- 環境変数 `CONTROLBOARD_URL` / `CONTROLBOARD_TOKEN` / `CONTROLBOARD_BASIC` でも渡せる

## 環境変数

| 名前 | 用途 |
|---|---|
| `SITE_ENV=staging` | 試験用。Basic 認証と画像の置き場（`staging/uploads/`）を切り替える |
| `BASIC_USER` / `BASIC_PASS` | staging の Basic 認証。未設定なら誰も入れない |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_FROM_NAME` | お問い合わせの通知メール |
| `CF_ACCOUNT_ID` / `CF_ANALYTICS_TOKEN` / `CF_RUM_SITE_TAG` / `CLICKS_DATASET` | アクセス統計 |

## 開発

```bash
pnpm install
pnpm test                                   # 単体テスト（vitest）
cd playground && pnpm dev                   # http://localhost:4400/admin/
node ../packages/cli/src/index.js create-owner --user admin --no-change   # ローカル KV にオーナーを作る
pnpm e2e                                    # Playwright（ローカルのみ）
```
