/* MCP のツール一覧。どれも管理画面が使っている /api/* をそのまま呼ぶ。
   権限はトークンの持ち主に従う（サーバー側で確かめる）。 */

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { readSse } from "./client.js";

const obj = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const str = (description) => ({ type: "string", description });
const bool = (description) => ({ type: "boolean", description });
const num = (description) => ({ type: "number", description });
const any = (description) => ({ type: "object", description, additionalProperties: true });

const READ = { readOnlyHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false };
const DESTROY = { readOnlyHint: false, destructiveHint: true };

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif" };

const pick = (a, keys) => Object.fromEntries(keys.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

export const TOOLS = [
  {
    name: "get_site_schema",
    description: "最初に呼ぶ。サイトの構成（ページの一覧と ID、共通設定の項目、ページで使えるブロック部品とその入力欄、有効なモジュール）を返す。編集の前にここで形を確かめること。",
    inputSchema: obj(), annotations: READ,
    run: (c) => c.call("GET", "/api/schema"),
  },
  {
    name: "whoami",
    description: "トークンの持ち主（ユーザー名・役割・権限）と、本番か staging かを返す。",
    inputSchema: obj(), annotations: READ,
    run: (c) => c.call("GET", "/api/me"),
  },

  /* ---- 共通の内容（設定・お知らせ・募集要項など） ---- */
  {
    name: "get_content",
    description: "サイト共通の内容ドキュメントを返す。共通設定（get_site_schema の settings の key）、お知らせ news[]、募集要項 jobs[]、追加ページ customPages[]、ページの並び pageOrder などがトップレベルのキーに入っている。",
    inputSchema: obj(), annotations: READ,
    run: (c) => c.call("GET", "/api/content"),
  },
  {
    name: "update_content",
    description: "内容ドキュメントのトップレベルのキーだけを差し替える（渡さなかったキーはそのまま）。例: お知らせを直すなら get_content で news を取り、配列全体を直して { patch: { news: [...] } } で送る。キーの中身は丸ごと置き換わるので、部分だけ送らないこと。変更履歴に残る。",
    inputSchema: obj({ patch: any("トップレベルのキー → 新しい値") }, ["patch"]), annotations: WRITE,
    run: (c, a) => c.call("PATCH", "/api/content", { body: a.patch }),
  },
  {
    name: "replace_content",
    description: "内容ドキュメント全体を置き換える。含めなかったキーは消える。通常は update_content を使うこと。変更履歴から復元はできる。",
    inputSchema: obj({ content: any("新しい内容ドキュメント全体") }, ["content"]), annotations: DESTROY,
    run: (c, a) => c.call("PUT", "/api/content", { body: a.content }),
  },
  {
    name: "create_preview",
    description: "保存せずに下書きの内容ドキュメントを15分だけ置き、そのプレビュー URL を返す。公開ページに ?preview= を付けると下書きで表示される。",
    inputSchema: obj({ content: any("下書きの内容ドキュメント全体"), path: str("プレビューしたいページのパス（既定 /）") }, ["content"]),
    annotations: WRITE,
    run: async (c, a) => {
      const r = await c.call("POST", "/api/preview", { body: a.content });
      const u = new URL(a.path || "/", c.origin);
      u.searchParams.set("preview", r.token);
      return { ...r, url: u.toString() };
    },
  },

  /* ---- ページ ---- */
  {
    name: "get_page",
    description: "ページの Puck 文書 { root, content[] } を返す。id は get_site_schema の pages[].id（追加ページは custom-<slug>）。saved:false なら既定のレイアウト。",
    inputSchema: obj({ id: str("ページ ID（既定 home）") }), annotations: READ,
    run: (c, a) => c.call("GET", "/api/page", { query: { id: a.id || "home" } }),
  },
  {
    name: "save_page",
    description: "ページの Puck 文書を丸ごと保存して公開する。content[] の各要素は { type: <ブロック名>, props: { id, ...入力欄 } }。ブロック名と入力欄は get_site_schema の blocks（home ページは home、それ以外は sub）に従う。先に get_page で今の文書を取り、直した全体を送ること。変更履歴に残る。",
    inputSchema: obj({ id: str("ページ ID"), data: any("{ root: { props }, content: [...] }") }, ["id", "data"]),
    annotations: WRITE,
    run: (c, a) => c.call("PUT", "/api/page", { query: { id: a.id }, body: a.data }),
  },
  {
    name: "create_page",
    description: "ページを追加する。slug を省くと題名から作る。中身は save_page で入れる（返る id を使う）。",
    inputSchema: obj({
      title: str("ページ名"), slug: str("URL の住所（英小文字・数字・-）"), en: str("英語の見出し"),
      desc: str("説明（200字まで）"), inNav: bool("メニューに出すか"),
    }, ["title"]),
    annotations: WRITE,
    run: (c, a) => c.call("POST", "/api/pages", { body: a }),
  },
  {
    name: "update_page_settings",
    description: "追加したページの題名・英語見出し・説明・メニュー表示を変える（住所は変えられない）。",
    inputSchema: obj({ slug: str("追加ページの slug"), title: str(""), en: str(""), desc: str(""), inNav: bool("") }, ["slug"]),
    annotations: WRITE,
    run: (c, a) => c.call("PUT", "/api/pages", { body: a }),
  },
  {
    name: "restore_page",
    description: "削除した固定ページ（config の pages にあるもの）を元に戻す。",
    inputSchema: obj({ id: str("固定ページの ID") }, ["id"]), annotations: WRITE,
    run: (c, a) => c.call("PUT", "/api/pages", { body: { id: a.id, restore: true } }),
  },
  {
    name: "delete_page",
    description: "ページを削除する。固定ページは id で（非表示になり restore_page で戻せる）、追加ページは slug で（定義が消える。中身は残るので同じ slug で作り直せば戻る）。",
    inputSchema: obj({ id: str("固定ページの ID"), slug: str("追加ページの slug") }), annotations: DESTROY,
    run: (c, a) => c.call("DELETE", "/api/pages", { body: pick(a, ["id", "slug"]) }),
  },

  /* ---- 変更履歴 ---- */
  {
    name: "list_versions",
    description: "保存の履歴（新しい順）。各項目の seq で get_version / restore_version を呼ぶ。",
    inputSchema: obj(), annotations: READ,
    run: (c) => c.call("GET", "/api/versions"),
  },
  {
    name: "get_version",
    description: "履歴の1件の中身（その時点の文書）を返す。",
    inputSchema: obj({ seq: num("履歴の番号") }, ["seq"]), annotations: READ,
    run: (c, a) => c.call("GET", "/api/versions", { query: { seq: a.seq } }),
  },
  {
    name: "restore_version",
    description: "履歴の1件を今の状態として書き戻す。置き換えられた状態も履歴に残る。",
    inputSchema: obj({ seq: num("履歴の番号") }, ["seq"]), annotations: DESTROY,
    run: (c, a) => c.call("POST", "/api/versions", { body: { seq: a.seq } }),
  },

  /* ---- 画像 ---- */
  {
    name: "list_media",
    description: "アップロード済みの画像（新しい順、100件ずつ）。url をページや設定の画像欄に入れて使う。",
    inputSchema: obj({ cursor: str("続きを読むときに前回の cursor") }), annotations: READ,
    run: (c, a) => c.call("GET", "/api/media", { query: { cursor: a.cursor } }),
  },
  {
    name: "upload_media",
    description: "画像をアップロードして url を返す（5MB まで、画像のみ）。手元のファイルなら path、データなら base64 と filename を渡す。",
    inputSchema: obj({
      path: str("手元の画像ファイルの絶対パス"), base64: str("画像データ（base64）"),
      filename: str("ファイル名（base64 のとき必須）"), mimeType: str("image/png など（省略時は拡張子から）"),
    }),
    annotations: WRITE,
    run: async (c, a) => {
      let buf, name;
      if (a.path) { buf = await readFile(a.path); name = basename(a.path); }
      else if (a.base64 && a.filename) { buf = Buffer.from(a.base64, "base64"); name = a.filename; }
      else throw new Error("path か、base64 と filename を渡してください");
      const type = a.mimeType || MIME[extname(name).toLowerCase()] || "application/octet-stream";
      const form = new FormData();
      form.append("file", new Blob([buf], { type }), name);
      return c.call("POST", "/api/upload", { form });
    },
  },
  {
    name: "rename_media",
    description: "画像の表示名を変える（url は変わらない）。",
    inputSchema: obj({ key: str("list_media の key"), name: str("新しい名前") }, ["key", "name"]), annotations: WRITE,
    run: (c, a) => c.call("PATCH", "/api/media", { body: a }),
  },
  {
    name: "delete_media",
    description: "画像を削除する。使っているページでは表示されなくなる。元に戻せない。",
    inputSchema: obj({ key: str("list_media の key") }, ["key"]), annotations: DESTROY,
    run: (c, a) => c.call("DELETE", "/api/media", { body: { key: a.key } }),
  },

  /* ---- 短縮リンク（links モジュール） ---- */
  {
    name: "list_links",
    description: "短縮リンクの一覧とアクセス数。days を渡すとその日数分の数も付く。",
    inputSchema: obj({ days: num("集計する日数（1〜90）") }), annotations: READ,
    run: (c, a) => c.call("GET", "/api/links", { query: { days: a.days } }),
  },
  {
    name: "create_link",
    description: "短縮リンクを作る。アドレス（code）は自動で決まる。",
    inputSchema: obj({ label: str("添付先（どこに載せるか）"), url: str("移動先の URL"), note: str("メモ") }, ["label", "url"]),
    annotations: WRITE,
    run: (c, a) => c.call("POST", "/api/links", { body: a }),
  },
  {
    name: "update_link",
    description: "短縮リンクの移動先・名前・メモ・停止を変える。",
    inputSchema: obj({ code: str(""), url: str(""), label: str(""), note: str(""), disabled: bool("止めるなら true") }, ["code"]),
    annotations: WRITE,
    run: (c, a) => c.call("PUT", "/api/links", { body: a }),
  },
  {
    name: "delete_link",
    description: "短縮リンクとそのアクセス数を削除する。印刷物に載ったアドレスは使えなくなる。元に戻せない。",
    inputSchema: obj({ code: str("") }, ["code"]), annotations: DESTROY,
    run: (c, a) => c.call("DELETE", "/api/links", { body: { code: a.code } }),
  },

  /* ---- お問い合わせ（inquiries モジュール） ---- */
  {
    name: "list_inquiries",
    description: "届いたお問い合わせ（最大200件）。各項目の key で既読・削除を操作する。個人情報を含むので扱いに注意。",
    inputSchema: obj(), annotations: READ,
    run: (c) => c.call("GET", "/api/inquiries"),
  },
  {
    name: "mark_inquiry",
    description: "お問い合わせを既読・未読にする。",
    inputSchema: obj({ key: str("inq: で始まる key"), read: bool("既読なら true") }, ["key", "read"]), annotations: WRITE,
    run: (c, a) => c.call("PUT", "/api/inquiries", { body: a }),
  },
  {
    name: "delete_inquiry",
    description: "お問い合わせを削除する。元に戻せない。",
    inputSchema: obj({ key: str("inq: で始まる key") }, ["key"]), annotations: DESTROY,
    run: (c, a) => c.call("DELETE", "/api/inquiries", { body: { key: a.key } }),
  },

  /* ---- 統計・アシスタント ---- */
  {
    name: "get_stats",
    description: "アクセス統計（Cloudflare Web Analytics）。configured:false なら未設定。",
    inputSchema: obj({ range: { type: "string", enum: ["24h", "7d", "30d", "90d"], description: "期間（既定 30d）" } }),
    annotations: READ,
    run: (c, a) => c.call("GET", "/api/stats", { query: { range: a.range } }),
  },
  {
    name: "ask_manual",
    description: "管理画面の使い方マニュアルに質問する（rag モジュール）。",
    inputSchema: obj({ question: str("質問") }, ["question"]), annotations: READ,
    run: async (c, a) => {
      const res = await c.raw("POST", "/api/admin/rag-ask", { body: { question: a.question } });
      return readSse(await res.text());
    },
  },

  /* ---- ユーザー ---- */
  {
    name: "list_users",
    description: "管理画面のユーザー一覧と、役割・権限の選択肢。",
    inputSchema: obj(), annotations: READ,
    run: (c) => c.call("GET", "/api/users"),
  },
  {
    name: "create_user",
    description: "ユーザーを追加する。role は owner / admin / editor。perms を渡すとその人だけの権限になる。",
    inputSchema: obj({
      user: str("ログインID（英数字と - _ . @、3〜40文字）"), password: str("はじめのパスワード（8文字以上）"),
      role: { type: "string", enum: ["owner", "admin", "editor"] }, name: str("表示名"),
      perms: { type: "array", items: { type: "string", enum: ["content", "inquiries", "stats", "history", "users"] } },
      mustChange: bool("初回ログインでパスワード変更を求める（既定 true）"),
    }, ["user", "password", "role"]),
    annotations: WRITE,
    run: (c, a) => c.call("POST", "/api/users", { body: a }),
  },
  {
    name: "update_user",
    description: "ユーザーの役割・権限・表示名・停止・パスワードを変える。停止するとその人のトークンも使えなくなる。",
    inputSchema: obj({
      id: str("list_users の id"), role: { type: "string", enum: ["owner", "admin", "editor"] }, name: str(""),
      perms: { type: ["array", "null"], items: { type: "string" }, description: "null で役割の初期設定に戻す" },
      disabled: bool(""), password: str("新しいパスワード"), mustChange: bool(""),
    }, ["id"]),
    annotations: DESTROY,
    run: (c, a) => c.call("PUT", "/api/users", { body: a }),
  },
  {
    name: "delete_user",
    description: "ユーザーを削除する。その人のトークンも使えなくなる。元に戻せない。",
    inputSchema: obj({ id: str("list_users の id") }, ["id"]), annotations: DESTROY,
    run: (c, a) => c.call("DELETE", "/api/users", { body: { id: a.id } }),
  },
];
