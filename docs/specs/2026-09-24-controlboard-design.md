# ControlBoard 設計書

- 日付: 2026-09-24
- 状態: レビュー待ち

## 1. 目的

compass-hp（コンパス会計社サイト）の管理画面の仕組みを複製し、他の Astro + Cloudflare Pages サイトでも使える独立したフレームワーク **ControlBoard** にする。

- 使い回すもの: 管理画面の「形」＝ログイン/ユーザー権限、画面構成、Puck 編集フロー（インライン編集・Before/After・公開）、画像ライブラリ、変更履歴と復元、問い合わせ、短縮リンク、統計、RAG アシスタント。
- サイトごとに差し替えるもの: デザイン（CSS）、ブロック、共通設定の項目、既定コンテンツ、SEO 固定メタ。

## 2. 前提と制約

- 対象サイトはすべて **Astro 5（`output: "server"`）+ Cloudflare Pages + KV + R2** 構成。
- **compass-hp には一切触れない。** コードは読み取って複製するのみで、compass-hp のファイル・git・デプロイ・Cloudflare アカウント・KV には変更を加えない。compass の載せ替えも本プロジェクトの範囲外。
- 先方（compass）の Cloudflare アカウント・資格情報は使わない。開発はローカル（`wrangler dev`）と netrunners アカウントのみ。
- 本番デプロイは範囲外。

## 3. 全体構成

```
~/.superset/projects/ControlBoard/     独立 git リポジトリ（pnpm workspace）
├─ packages/
│  ├─ core/    @controlboard/core   Astro integration
│  │   ├─ API ルート（injectRoute）
│  │   ├─ middleware（admin. ホスト振り分け・staging Basic 認証）
│  │   └─ lib（認証・権限・履歴・KV/R2 アクセス）
│  ├─ admin/   @controlboard/admin  React 19 管理画面 SPA（ビルド済みで配布）
│  └─ cli/     controlboard コマンド（init / setup / deploy）
├─ playground/  開発検証用の最小サイト
└─ docs/
```

サイトは ControlBoard の外（別リポジトリ）に置き、次の形で利用する。

1. `package.json` に依存を追加。当面 `"@controlboard/core": "file:../ControlBoard/packages/core"`、安定後は GitHub タグ参照。
2. `astro.config.mjs` に `integrations: [controlboard(config)]` を1行追加。
3. サイト側が書くのは `controlboard.config.js`・ブロック部品・CSS のみ。

### 3.1 core が提供する API

compass-hp の `site/src/pages/api/` を複製・汎用化する。

| ルート | メソッド | 権限 |
|---|---|---|
| login / logout / me / password | POST / POST / GET / POST | — |
| config | GET | ログイン済（管理画面向けにサイト設定の公開可能部分を返す） |
| content | GET（公開）, PUT, PATCH | content |
| page?id= | GET（公開）, PUT | content |
| pages | POST / PUT / DELETE | content |
| preview | POST（KV に 15 分 TTL） | content |
| upload / media | POST / GET・PATCH・DELETE | content |
| links | GET / POST / PUT / DELETE | content |
| versions | GET / POST（復元） | history |
| users | GET / POST / PUT / DELETE | users |
| inquiries | GET / PUT / DELETE | inquiries |
| inquiry | POST（公開フォーム・Resend 通知） | — |
| stats | GET | stats |
| track | POST（公開） | — |
| admin/rag-ask | POST（SSE） | ログイン済 |
| /media/[...path] | GET（R2 配信・immutable） | — |

`modules` で無効にした機能のルートは注入しない。

### 3.2 認証と権限

compass-hp と同じ。

- PBKDF2-SHA256（100,000 回）で自前 ID/パスワード。
- KV `session:<token>`、TTL 7日。Cookie `sid`（HttpOnly / Secure / SameSite=Lax）。
- 役割 owner / admin / editor、権限 content / inquiries / stats / history / users。個別上書き可。オーナーが 0 人になる操作は拒否。
- staging（`SITE_ENV=staging`）は middleware で Basic 認証を前段に置く。

### 3.3 管理画面（admin）

compass-hp の `site/admin-src/` を複製し、サイト固有部分を除去する。

- 画面: ダッシュボード / 問い合わせ / お知らせ / 募集要項 / サイト編集（Puck）/ 画像 / リンク / 変更履歴 / ユーザー / パスワード変更 / RAG アシスタント。`modules` に応じて表示を切り替える。
- ビルド済み SPA を core が `/admin/` と `admin.` ホストの `/` で配信する。サイトのビルドで管理画面を再ビルドしない。
- サイト固有の情報は起動時に `/api/config` から取得する。
- Puck のブロック定義はサイトの JS に含まれるため、サイト編集画面は **サイト側で Puck config をバンドルした小さなエントリ**を core の integration がビルドして読み込ませる（管理画面本体はビルド済み、ブロックだけサイトごとにビルド）。

## 4. データ

### 4.1 KV / R2 のキー

サイトごとに KV・R2 を分けるため、キーに接頭辞は付けない。compass-hp と同一。

| キー | 中身 |
|---|---|
| `content` | サイト設定・お知らせ・募集要項・ページ一覧メタ（customPages / hiddenPages / pageOrder / pageTitles）など |
| `page:<id>` | Puck ドキュメント `{root:{props}, content:[{type, props}]}` |
| `preview:<tok>` | 下書き（15 分 TTL） |
| `session:<tok>` | セッション |
| `users` | 管理ユーザー |
| `verindex`, `ver:<n>` | 変更履歴（最大 60 件） |
| `links`, `linkhits:<code>` | 短縮リンクと件数 |
| `medianames` | 画像の表示名 |
| `inq:*` | 問い合わせ |
| R2 `uploads/`（staging は `staging/uploads/`） | 画像 |

### 4.2 `controlboard.config.js`

```js
export default {
  site: { name: "○○事務所", url: "https://example.jp" },
  blocks: { home: homeConfig, sub: subConfig },
  settings: [
    { group: "基本情報", fields: [
      { key: "contact.tel",    label: "電話番号", type: "text" },
      { key: "contact.access", label: "アクセス", type: "textarea" },
    ]},
    { group: "配色", fields: [{ key: "theme.primary", label: "メイン色", type: "color" }]},
    { group: "ロゴ", fields: [{ key: "logo", label: "ロゴ", type: "image" }]},
  ],
  modules: { news: true, jobs: false, inquiries: true, links: true, stats: true, rag: false },
  defaults: { content: {}, pages: { home: [] } },
  seo: { pages: { home: { title: "", desc: "" } }, org: {} },
};
```

- 設定項目の型: `text` / `textarea` / `richtext` / `color` / `image` / `url` / `list`（繰り返し）/ `group`。
- 共通設定タブのフォームは `settings` から自動生成する。
- Before/After 比較の項目名は `settings[].fields[].label` から引く（compass の直書きラベルを廃止）。
- お知らせ・募集要項は compass の画面をそのまま「モジュール」として持つ。汎用コレクション機構は作らない。
- `content` 読み出しは `defaults.content` に KV 値を上書きマージ。KV 失敗時は既定値で表示。
- SEO の固定メタ・JSON-LD の元データは `config.seo` から読む（compass の `seo.js` の `PAGE_META` を置き換える）。

### 4.3 データの流れ

- 共通設定・お知らせ・募集要項: `PATCH /api/content`（変更したトップレベルキーのみ）→ サーバーでマージ → KV `content`（`updatedAt` 付与）→ 履歴記録。
- ページ: Puck の公開 → `PUT /api/page?id=` → KV `page:<id>` → `content.pageTitles` に控え → 履歴記録。
- 公開ページは SSR でリクエスト毎に KV を読むため、保存後の次のリクエストで反映。`?preview=<token>` で下書き描画。

IndexNow 通知は `config.site.url` がある場合のみ行う。

## 5. CLI とデプロイ

```
npx controlboard init          サイトリポジトリで実行。config・ブロック見本・CSS・wrangler.jsonc 雛形を生成
npx controlboard setup         KV / R2 作成 → ID を wrangler.jsonc に書き込み → 最初のオーナー作成
npx controlboard deploy [--stg]
```

- アカウントはサイトごとに `.cfauth` で分離（既存の cfauth 方式）。
- `--stg`: staging 用 KV / R2 プレフィックス・`SITE_ENV=staging`・Basic 認証（compass の `deploy-stg` と同じ考え方）。
- 本番デプロイは確認プロンプトを必須にする。

## 6. エラー処理

- KV 読み出し失敗 → `defaults` で表示。
- 権限不足 → 403。未ログイン → 401。
- オーナー 0 人になる変更 → 400。
- アップロードは画像のみ・5MB 上限。
- `modules` で無効な機能への API アクセス → 404（ルート自体を注入しない）。

## 7. テストと完了条件

- 開発検証は `playground/` を `wrangler dev`（ローカル KV / R2）で動かす。実アカウントに触れない。
- API テスト（vitest）: ログイン、権限、content の PUT/PATCH マージ、ページ保存、履歴記録と復元、画像アップロード、モジュール無効時の 404。
- E2E（Playwright 最小限）: ログイン → 共通設定変更 → 保存 → 公開ページに反映。Puck でブロック追加 → 公開。
- **完了条件**: playground 上で、compass-hp の管理画面機能（税務固有部品を除く）がすべて動作すること。

## 8. 範囲外

- compass-hp の変更・載せ替え（触れない）。
- 本番デプロイ。
- 先方アカウントの使用。
- Astro / Cloudflare 以外の構成への対応。
- 汎用コレクション機構、SEO 設定画面、下書き保存機能（compass にない機能の追加）。
