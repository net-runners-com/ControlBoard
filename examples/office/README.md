# 作例: みどり会計事務所

ControlBoard で作った、架空の税理士事務所のサイト。サイト側で書いたのは `controlboard.config.js`・`src/blocks.jsx`（9種類のブロック）・`src/pages/`・`public/site.css` だけ。

```bash
pnpm install            # リポジトリのルートで
cd examples/office
pnpm owner              # ローカルの KV に admin / admin-1234 を作る
pnpm dev                # http://localhost:4410/ ・ 管理画面は /admin/
```

管理画面で試せること:

- **サイト編集**: ページのブロック（メインビジュアル・選ばれる理由・料金表・スタッフ・よくある質問など）の並べ替え・追加・文言と画像の差し替え、ページの追加
- **共通設定**: 電話番号・受付時間・上部のお知らせバー・メインの色（サイト全体に反映）
- **お知らせ / 募集要項**: `/news`・`/recruit` に出る
- **お問い合わせ**: `/contact` のフォームから送ったものが届く
- **リンク管理・変更履歴・ユーザー管理・AI連携（MCP のトークン）**

KV が空のうちは `controlboard.config.js` の `defaults` の中身が表示される。
