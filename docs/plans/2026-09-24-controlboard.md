# ControlBoard 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** compass-hp の管理画面の仕組みを複製し、任意の Astro + Cloudflare Pages サイトに1行で組み込める Astro integration「ControlBoard」にする。

**Architecture:** `@controlboard/core` が Astro integration として API ルート・middleware を注入し、サイトの `controlboard.config.js` を Vite 仮想モジュール `virtual:controlboard/config` で実行時コードと管理画面の両方へ渡す。管理画面（`@controlboard/admin`）はサイトのビルド時に、サイトの Puck ブロックと一緒に Vite で `public/admin/` へビルドする。データは compass と同じ KV / R2 キー構成。

**Tech Stack:** Astro 5（`output: "server"`）, @astrojs/cloudflare 12, React 19, @measured/puck 0.20, Tiptap 3, recharts 3, Vite 6, vitest 3, Playwright, pnpm workspace, wrangler（ローカルのみ）。

**Spec:** `docs/specs/2026-09-24-controlboard-design.md`

**コピー元（読み取り専用）:** `/Users/hirotodev0622i/.superset/projects/compass-hp`（以下 `$COMPASS`）

## Global Constraints

- compass-hp には一切書き込まない。`$COMPASS` 配下で実行してよいのは `cat` / `cp`（コピー元としての読み取り）/ `grep` / `ls` のみ。build・install・git・wrangler は実行しない。
- 先方（compass）の Cloudflare アカウント・資格情報・KV ID・データセット名を使わない・コードに残さない。
- 本番デプロイはしない。wrangler はローカル（`--local` / `astro dev` の platformProxy）のみ。
- 対象構成: Astro 5 `output: "server"` + Cloudflare Pages + KV（binding `CMS`）+ R2（binding `MEDIA`）。
- React 19、Puck `^0.20.2`、Tiptap `^3.29.0`。
- パスワード: PBKDF2-SHA256 100,000 回。セッション: KV `session:<token>`、TTL 7日、Cookie `sid`（HttpOnly / Secure / SameSite=Lax）。
- 役割 owner / admin / editor、権限 content / inquiries / stats / history / users。オーナー 0 人になる操作は拒否。
- 画像アップロードは `image/*` のみ・5MB 上限。R2 キー接頭辞は本番 `uploads/`、staging `staging/uploads/`。
- 下書きプレビューは KV `preview:<token>`、TTL 900 秒。変更履歴は最大 60 件。
- 完成時点で `grep -rniE "コンパス|compass|高田馬場|税理士|b7ce|c1bf|ec01" packages/ playground/` が 0 件。
- コメント・UI 文言は日本語、識別子は英語（compass の書き方に合わせる）。

## Review Focus

1. **サイト側と管理画面で React が二重に読み込まれる**（`file:` 参照のサイトから使う場合）→ Puck が "Invalid hook call" で落ちる。期待: 管理画面ビルドで react / react-dom / @measured/puck / @controlboard/core が1つに解決される。→ Task 7 のビルドテストで `react` の実体が1つであることを検査。
2. **staging で BASIC_USER / BASIC_PASS が未設定** → compass は既定パスワードで開いていた。期待: 未設定なら常に 401（閉じたまま）。→ Task 5 にテスト。
3. **無効にしたモジュールの API を直接叩く**（例: `modules.links=false` で `POST /api/links`）→ 期待: 404。→ Task 5 にテスト。
4. **設定に未知のフィールド型・未知のモジュール名を書いた** → 期待: ビルド時に項目名入りのエラーで止まる（黙って無視しない）。→ Task 2 にテスト。
5. **短縮リンクのコードが既存ページと同じ住所** → 期待: ページが優先され、リンクは 404 になったときだけ転送。→ Task 5 にテスト。

## 仕様書からの変更（Task 0 で spec に反映）

調査の結果、次の4点を仕様書から変える。

| 仕様書 | 変更後 | 理由 |
|---|---|---|
| 3.3 管理画面はビルド済みで配布し、ブロックだけサイトごとにビルド | 管理画面ごとサイトのビルド時に Vite でビルド | 別々にビルドすると React / Puck の実体が2つになり動かない。compass もサイトのビルドで管理画面を作っている |
| 3.1 `/api/config` | 廃止 | 設定は仮想モジュールでビルド時に管理画面へ埋め込まれるため不要 |
| 4.2 config に `pages` がない | `pages`（固定ページの定義）を追加 | compass の `PAGES` はコードに直書き。サイトごとに違う |
| 4.3 IndexNow 通知 | 範囲外 | compass 固有の鍵ファイルとルートが必要。YAGNI |

あわせて、モジュール無効時の 404 はルートを注入しないのではなく middleware で返す（integration の setup 時点では JSX を含む config を読めないため）。

## ファイル構成

```
ControlBoard/
├─ package.json                     ルート（scripts: test, e2e）
├─ pnpm-workspace.yaml              packages/*, playground
├─ vitest.workspace.js
├─ packages/
│  ├─ core/
│  │  ├─ package.json               @controlboard/core
│  │  ├─ vitest.config.js           仮想モジュールをテスト用 config に向ける
│  │  ├─ src/
│  │  │  ├─ index.js                Astro integration（ルート注入・middleware・管理画面ビルド）
│  │  │  ├─ config.js               normalizeConfig / settingsTopKeys / labelsFromSettings / sectionLabels
│  │  │  ├─ vite-plugin.js          virtual:controlboard/config
│  │  │  ├─ build-admin.js          管理画面の Vite ビルド
│  │  │  ├─ middleware.js           admin ホスト・staging Basic 認証・モジュール 404・短縮リンク・CSP
│  │  │  ├─ puck.jsx                richField / imageField と差し込み口
│  │  │  ├─ seo.js                  seoFor / orgJsonLd
│  │  │  ├─ runtime/                api, users, versions, media, links, content, pages, news, jobs, mail, rag/*
│  │  │  └─ routes/                 compass の src/pages/api/* と media/[...path].js を移植
│  │  └─ test/
│  │     ├─ fixtures/config.js      テスト用サイト設定
│  │     ├─ helpers.js              FakeKV / FakeR2 / makeEnv / ctx / seedOwner / login
│  │     └─ *.test.js
│  ├─ admin/
│  │  ├─ package.json               @controlboard/admin
│  │  ├─ index.html
│  │  └─ src/                       compass の admin-src/src を移植＋汎用化、SettingsForm.jsx を追加
│  └─ cli/
│     ├─ package.json               controlboard（bin）
│     ├─ src/index.js               init / setup / create-owner / deploy / rag-index
│     ├─ templates/                 init が書き出す雛形
│     └─ test/cli.test.js
├─ playground/                      検証用サイト（ローカルのみ）
│  ├─ astro.config.mjs, controlboard.config.js, wrangler.jsonc
│  ├─ src/blocks.jsx, src/layouts/Base.astro, src/pages/index.astro, src/pages/[slug].astro
│  └─ e2e/admin.spec.js
└─ docs/
```

---

### Task 0: 仕様書の更新

**Files:**
- Modify: `docs/specs/2026-09-24-controlboard-design.md`

- [ ] **Step 1: 3.1 の表から `config` 行を削除する**

- [ ] **Step 2: 3.3 の最後の2項目を次に置き換える**

```markdown
- 管理画面は **サイトのビルド時に** core の integration が Vite でビルドし、`public/admin/` に出力する。サイトの Puck 設定は仮想モジュール `virtual:controlboard/config` 経由で管理画面に同梱される（React / Puck の実体を1つにするため）。
- サイト固有の情報（設定項目・モジュール・ブロック）も同じ仮想モジュールから読む。`/api/config` は持たない。
```

- [ ] **Step 3: 4.2 の config 例の `blocks` の次の行に追加する**

```js
  pages: {                                   // 固定ページ（home は必須）
    home:  { label: "トップページ", url: "/" },
    about: { label: "私たちについて", url: "/about", jp: "私たちについて", en: "About" },
  },
```

- [ ] **Step 4: 4.3 の「IndexNow 通知は…」の行を削除し、8 範囲外に `- IndexNow 通知。` を追加。6 エラー処理の最後の行を次に置き換える**

```markdown
- `modules` で無効な機能への API アクセス → middleware が 404 を返す。
- staging で `BASIC_USER` / `BASIC_PASS` が未設定 → 常に 401。
```

- [ ] **Step 5: コミット**

```bash
git add docs/specs && git commit -m "設計書を実装計画に合わせて更新（管理画面をサイトごとにビルド・pages 追加）"
```

---

### Task 1: ワークスペースと認証ライブラリ

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `vitest.workspace.js`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/vitest.config.js`
- Create: `packages/core/test/helpers.js`, `packages/core/test/fixtures/config.js`
- Create（コピー）: `packages/core/src/runtime/api.js`, `packages/core/src/runtime/users.js`
- Test: `packages/core/test/users.test.js`

**Interfaces:**
- Produces: `runtime/api.js` の `json, randHex, pbkdf2, safeEqual, parseCookies, sessionCookie, getSession(env, request), requirePerm(env, request, perm) → {error}|{session,user}, PBKDF2_ITER, SESSION_TTL`
- Produces: `runtime/users.js` の `PERMS, ROLES, ROLE_PERMS, permsOf(u), can(u, perm), publicUser(u), readUsers(env), writeUsers(env, items), findUser(env, name), setPassword(user, password), ownersLeft(items, exceptId)`
- Produces: `test/helpers.js` の `FakeKV, FakeR2, makeEnv(extra), ctx(env, {method,url,body,headers,cookie}), seedUser(env, {user,password,role,perms}), login(env, user, password) → cookie string`

- [ ] **Step 1: ルートの設定ファイルを作る**

`package.json`:

```json
{
  "name": "controlboard",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "e2e": "pnpm --filter playground e2e"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
  - playground
```

`vitest.workspace.js`:

```js
export default ["packages/core", "packages/cli"];
```

`.gitignore`:

```
node_modules/
dist/
.wrangler/
.astro/
playground/public/admin/
playground/public/rag-admin/
test-results/
playwright-report/
.cfauth/
.dev.vars
```

`packages/core/package.json`:

```json
{
  "name": "@controlboard/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./config": "./src/config.js",
    "./puck": "./src/puck.jsx",
    "./seo": "./src/seo.js",
    "./runtime/*": "./src/runtime/*.js"
  },
  "dependencies": {
    "@controlboard/admin": "workspace:*",
    "@vitejs/plugin-react": "^5.2.0",
    "vite": "^6.4.3"
  },
  "peerDependencies": {
    "@astrojs/cloudflare": "^12.5.0",
    "@measured/puck": "^0.20.2",
    "astro": "^5.7.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@measured/puck": "^0.20.2",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "vitest": "^3.2.4"
  }
}
```

`packages/core/vitest.config.js`:

```js
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* 実行時コードは virtual:controlboard/config を読む。テストでは固定の設定に向ける。 */
export default defineConfig({
  resolve: {
    alias: {
      "virtual:controlboard/config": fileURLToPath(new URL("./test/fixtures/config.js", import.meta.url)),
    },
  },
  test: { environment: "node", testTimeout: 20000 },
});
```

- [ ] **Step 2: テスト用の偽 KV / R2 と補助関数を作る**

`packages/core/test/helpers.js`:

```js
import { setPassword, readUsers, writeUsers } from "../src/runtime/users.js";

export class FakeKV {
  constructor() { this.m = new Map(); this.ttl = new Map(); }
  async get(k, type) {
    if (!this.m.has(k)) return null;
    const v = this.m.get(k);
    return type === "json" ? JSON.parse(v) : v;
  }
  async put(k, v, opts = {}) {
    this.m.set(k, String(v));
    if (opts.expirationTtl) this.ttl.set(k, opts.expirationTtl);
  }
  async delete(k) { this.m.delete(k); this.ttl.delete(k); }
  async list({ prefix = "" } = {}) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
    return { keys, list_complete: true, cursor: "" };
  }
}

export class FakeR2 {
  constructor() { this.m = new Map(); }
  async put(key, body, opts = {}) {
    const buf = body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body;
    this.m.set(key, { buf, httpMetadata: opts.httpMetadata || {}, uploaded: new Date() });
    return { key };
  }
  async get(key) {
    const o = this.m.get(key);
    if (!o) return null;
    return {
      body: new Response(o.buf).body,
      httpMetadata: o.httpMetadata,
      httpEtag: '"fake"',
      size: o.buf.byteLength,
      writeHttpMetadata(h) { if (o.httpMetadata.contentType) h.set("content-type", o.httpMetadata.contentType); },
    };
  }
  async head(key) { const o = this.m.get(key); return o ? { key, size: o.buf.byteLength } : null; }
  async delete(key) { this.m.delete(key); }
  async list({ prefix = "" } = {}) {
    const objects = [...this.m.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, o]) => ({ key, size: o.buf.byteLength, uploaded: o.uploaded }));
    return { objects, truncated: false };
  }
}

export const makeEnv = (extra = {}) => ({ CMS: new FakeKV(), MEDIA: new FakeR2(), ...extra });

/* Astro のエンドポイントに渡る引数と同じ形を作る。 */
export function ctx(env, { method = "GET", url = "https://example.test/api/x", body, headers = {}, cookie } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  const init = { method, headers: h };
  if (body !== undefined) {
    if (body instanceof FormData) init.body = body;
    else { init.body = JSON.stringify(body); h["content-type"] = "application/json"; }
  }
  const waits = [];
  return {
    request: new Request(url, init),
    url: new URL(url),
    locals: { runtime: { env, ctx: { waitUntil: (p) => waits.push(p) } } },
    waits,
  };
}

export async function seedUser(env, { user = "owner", password = "pass-1234", role = "owner", perms = null, disabled = false } = {}) {
  const items = await readUsers(env);
  const u = { id: user + "-id", user, name: "", role, perms, mustChange: false, disabled, createdAt: null };
  await setPassword(u, password);
  items.push(u);
  await writeUsers(env, items);
  return u;
}

export async function login(env, user = "owner", password = "pass-1234") {
  const { POST } = await import("../src/routes/login.js");
  const res = await POST(ctx(env, { method: "POST", url: "https://example.test/api/login", body: { user, password } }));
  if (res.status !== 200) throw new Error("login failed: " + res.status);
  return res.headers.get("set-cookie").split(";")[0];
}
```

`packages/core/test/fixtures/config.js`（Task 2 で `normalizeConfig` を通すよう書き換える。ここでは素のオブジェクト）:

```js
const blocks = { home: { components: {} }, sub: { components: {} } };

export default {
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
  csp: { img: [], frame: [], script: [], connect: [] },
};
```

- [ ] **Step 3: compass の認証ライブラリをコピーする**

```bash
mkdir -p packages/core/src/runtime packages/core/src/routes
cp $COMPASS/site/src/lib/api.js   packages/core/src/runtime/api.js
cp $COMPASS/site/src/lib/users.js packages/core/src/runtime/users.js
```

`packages/core/src/runtime/api.js` の1行目コメントを次に置き換える（compass の移植元の記述を消す）:

```js
/* Shared helpers for the CMS API. Astro endpoints pass (env, request). */
```

- [ ] **Step 4: 失敗するテストを書く**

`packages/core/test/users.test.js`:

```js
import { describe, it, expect } from "vitest";
import { makeEnv, seedUser, ctx } from "./helpers.js";
import { permsOf, can, ownersLeft, publicUser, readUsers } from "../src/runtime/users.js";
import { requirePerm, pbkdf2, safeEqual } from "../src/runtime/api.js";

describe("users", () => {
  it("役割ごとの既定権限", () => {
    expect(permsOf({ role: "owner" })).toEqual(["content", "inquiries", "stats", "history", "users"]);
    expect(permsOf({ role: "editor" })).toEqual(["content", "inquiries"]);
    expect(permsOf({ role: "admin", disabled: true })).toEqual([]);
  });
  it("個別権限は役割より優先し、未知の権限は捨てる", () => {
    expect(permsOf({ role: "editor", perms: ["stats", "bogus"] })).toEqual(["stats"]);
    expect(can({ role: "editor", perms: ["stats"] }, "content")).toBe(false);
  });
  it("オーナーが残るかを数える", () => {
    const items = [{ id: "a", role: "owner" }, { id: "b", role: "editor" }];
    expect(ownersLeft(items, "a")).toBe(0);
    expect(ownersLeft(items, "b")).toBe(1);
  });
  it("publicUser はパスワード情報を返さない", () => {
    const p = publicUser({ id: "a", user: "x", role: "owner", salt: "s", hash: "h" });
    expect(p).not.toHaveProperty("salt");
    expect(p).not.toHaveProperty("hash");
  });
  it("旧 auth レコードを users へ移す", async () => {
    const env = makeEnv();
    await env.CMS.put("auth", JSON.stringify({ user: "old", salt: "00", hash: "11" }));
    const items = await readUsers(env);
    expect(items[0]).toMatchObject({ user: "old", role: "owner" });
    expect(await env.CMS.get("users", "json")).toBeTruthy();
  });
});

describe("requirePerm", () => {
  it("セッションなしは 401", async () => {
    const env = makeEnv();
    const r = await requirePerm(env, ctx(env).request, "content");
    expect(r.error.status).toBe(401);
  });
  it("権限なしは 403、ありなら user を返す", async () => {
    const env = makeEnv();
    await seedUser(env, { user: "ed", role: "editor" });
    await env.CMS.put("session:t1", JSON.stringify({ user: "ed" }));
    const req = ctx(env, { cookie: "sid=t1" }).request;
    expect((await requirePerm(env, req, "users")).error.status).toBe(403);
    expect((await requirePerm(env, req, "content")).user.user).toBe("ed");
  });
  it("無効化されたユーザーは 401", async () => {
    const env = makeEnv();
    await seedUser(env, { user: "gone", disabled: true });
    await env.CMS.put("session:t2", JSON.stringify({ user: "gone" }));
    expect((await requirePerm(env, ctx(env, { cookie: "sid=t2" }).request, null)).error.status).toBe(401);
  });
  it("PBKDF2 は同じ入力で同じ値", async () => {
    const a = await pbkdf2("pw", "00ff", 1000);
    expect(safeEqual(a, await pbkdf2("pw", "00ff", 1000))).toBe(true);
    expect(safeEqual(a, await pbkdf2("px", "00ff", 1000))).toBe(false);
  });
});
```

- [ ] **Step 5: 依存を入れてテストを実行する**

```bash
pnpm install
pnpm vitest run packages/core/test/users.test.js
```

Expected: PASS（コピーしたコードが対象なので、この時点で通る。通らなければコピー漏れ）。

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "ワークスペースと認証ライブラリを追加"
```

---

### Task 2: サイト設定の読み込み（config・仮想モジュール・content・pages・versions）

**Files:**
- Create: `packages/core/src/config.js`, `packages/core/src/vite-plugin.js`
- Create: `packages/core/src/runtime/content.js`, `packages/core/src/runtime/pages.js`
- Create（コピー）: `packages/core/src/runtime/versions.js`, `runtime/media.js`, `runtime/links.js`, `runtime/news.js`, `runtime/jobs.js`
- Modify: `packages/core/test/fixtures/config.js`
- Test: `packages/core/test/config.test.js`, `packages/core/test/content.test.js`

**Interfaces:**
- Produces: `config.js` の `MODULES: string[]`, `FIELD_TYPES: string[]`, `normalizeConfig(raw) → Config`, `settingsTopKeys(settings) → string[]`, `labelsFromSettings(settings) → Record<string,string>`, `sectionLabels(config) → Record<string,string>`
- Produces: `Config = { site:{name,url,logo,manualUrl}, blocks:{home,sub}, pages:Record<id,{label,url,jp?,en?,image?,imageSp?,fixed?,shared?}>, settings:[{group,fields:[{key,label,type,hint?,fields?}]}], modules:Record<module,boolean>, defaults:{content,pages}, seo:{pages,org}, csp:{img,frame,script,connect} }`
- Produces: `vite-plugin.js` の `VIRTUAL_ID = "virtual:controlboard/config"`, `configPlugin(configPath) → VitePlugin`
- Produces: `runtime/content.js` の `previewToken(url) → string|null`, `getContent(env, url) → object`
- Produces: `runtime/pages.js` の `PAGES, PAGE_IDS, CUSTOM_PREFIX, isCustomId, slugOfId, idOfSlug, cleanSlug, slugTaken(slug, content), customPages(content), hiddenPageIds(content), isPageHidden(id, content), DELETABLE_PAGE_IDS, findCustom(content, slug), pageDef(id, content), allPageIds(content), getPage(env, id, url, content), defaultDataFor(id, content)`（compass の `lib/page.js` と同名・同シグネチャ）
- Produces: `runtime/versions.js`（compass と同一）`readIndex, recordVersion(env,{user,kind,pageId,label,data}), getVersion(env, seq), applyVersion(env, v)`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/config.test.js`:

```js
import { describe, it, expect } from "vitest";
import { normalizeConfig, settingsTopKeys, labelsFromSettings, sectionLabels } from "../src/config.js";

const base = { blocks: { home: {}, sub: {} } };

describe("normalizeConfig", () => {
  it("省略した項目を埋める", () => {
    const c = normalizeConfig(base);
    expect(c.modules).toEqual({ news: false, jobs: false, inquiries: false, links: false, stats: false, rag: false });
    expect(c.pages.home).toEqual({ label: "トップページ", url: "/" });
    expect(c.defaults).toEqual({ content: {}, pages: {} });
    expect(c.csp).toEqual({ img: [], frame: [], script: [], connect: [] });
  });
  it("blocks がなければ止まる", () => {
    expect(() => normalizeConfig({})).toThrow(/blocks\.home/);
  });
  it("未知のモジュール名で止まる", () => {
    expect(() => normalizeConfig({ ...base, modules: { newz: true } })).toThrow(/unknown module: newz/);
  });
  it("未知のフィールド型で、項目名入りで止まる", () => {
    const raw = { ...base, settings: [{ group: "g", fields: [{ key: "a.b", label: "A", type: "colour" }] }] };
    expect(() => normalizeConfig(raw)).toThrow(/"colour".*a\.b/);
  });
  it("list の中のフィールドも検査する", () => {
    const raw = { ...base, settings: [{ group: "g", fields: [{ key: "sns", label: "SNS", type: "list", fields: [{ key: "url", label: "URL", type: "link" }] }] }] };
    expect(() => normalizeConfig(raw)).toThrow(/"link"/);
  });
  it("pages.home がなければ止まる", () => {
    expect(() => normalizeConfig({ ...base, pages: { about: { label: "a", url: "/a" } } })).toThrow(/pages\.home/);
  });
});

describe("settings から導く値", () => {
  const settings = [
    { group: "基本情報", fields: [{ key: "contact.tel", label: "電話番号", type: "text" }, { key: "contact.access", label: "アクセス", type: "textarea" }] },
    { group: "配色", fields: [{ key: "theme.primary", label: "メイン色", type: "color" }] },
  ];
  it("保存単位のトップレベルキー", () => {
    expect(settingsTopKeys(settings)).toEqual(["contact", "theme"]);
  });
  it("比較画面のラベル", () => {
    expect(labelsFromSettings(settings)).toMatchObject({ tel: "電話番号", access: "アクセス", primary: "メイン色", contact: "基本情報", theme: "配色" });
  });
  it("履歴のラベル", () => {
    const l = sectionLabels(normalizeConfig({ ...base, settings }));
    expect(l.contact).toBe("基本情報");
    expect(l.news).toBe("お知らせ");
  });
});
```

`packages/core/test/content.test.js`:

```js
import { describe, it, expect } from "vitest";
import { makeEnv } from "./helpers.js";
import { getContent, previewToken } from "../src/runtime/content.js";
import { pageDef, allPageIds, getPage, slugTaken, DELETABLE_PAGE_IDS, defaultDataFor } from "../src/runtime/pages.js";

const U = (q = "") => new URL("https://example.test/" + q);

describe("getContent", () => {
  it("KV が空なら既定値", async () => {
    expect(await getContent(makeEnv(), U())).toMatchObject({ contact: { tel: "03-0000-0000" } });
  });
  it("KV の値をトップレベルで上書き", async () => {
    const env = makeEnv();
    await env.CMS.put("content", JSON.stringify({ contact: { tel: "1" } }));
    const c = await getContent(env, U());
    expect(c.contact).toEqual({ tel: "1" });
    expect(c.theme).toEqual({ primary: "#123456" });
  });
  it("KV が例外でも既定値", async () => {
    const env = { CMS: { get: async () => { throw new Error("down"); } } };
    expect((await getContent(env, U())).contact.tel).toBe("03-0000-0000");
  });
  it("preview トークンは 32 桁の16進だけ", () => {
    expect(previewToken(U("?preview=" + "a".repeat(32)))).toBe("a".repeat(32));
    expect(previewToken(U("?preview=../x"))).toBe(null);
  });
  it("preview 下書きを優先", async () => {
    const env = makeEnv();
    const t = "b".repeat(32);
    await env.CMS.put("preview:" + t, JSON.stringify({ contact: { tel: "draft" } }));
    expect((await getContent(env, U("?preview=" + t))).contact.tel).toBe("draft");
  });
});

describe("pages", () => {
  it("固定ページと追加ページを同じ形で返す", () => {
    expect(pageDef("about", {}).url).toBe("/about");
    const content = { customPages: [{ slug: "faq", label: "よくある質問" }] };
    expect(pageDef("custom-faq", content)).toMatchObject({ url: "/faq", custom: true });
    expect(pageDef("custom-none", content)).toBe(null);
  });
  it("固定ページの住所・予約語は使えない", () => {
    expect(slugTaken("about", {})).toBe(true);
    expect(slugTaken("admin", {})).toBe(true);
    expect(slugTaken("fresh", {})).toBe(false);
  });
  it("home と fixed のページは削除できない", () => {
    expect(DELETABLE_PAGE_IDS).toEqual(["about"]);
  });
  it("並び順に知らない名前が混ざっても全ページを返す", () => {
    expect(allPageIds({ pageOrder: ["about", "ghost"] })).toEqual(["about", "home", "news"]);
  });
  it("未保存のページは defaults.pages、無ければ空", async () => {
    expect(defaultDataFor("home", {}).root.props.title).toBe("ようこそ");
    expect(defaultDataFor("about", {})).toEqual({ root: { props: {} }, content: [] });
    expect((await getPage(makeEnv(), "home", U(), {})).root.props.title).toBe("ようこそ");
  });
  it("defaults.pages は複製して返す（呼び出し側の書き換えが既定値に残らない）", () => {
    defaultDataFor("home", {}).root.props.title = "x";
    expect(defaultDataFor("home", {}).root.props.title).toBe("ようこそ");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run packages/core/test/config.test.js packages/core/test/content.test.js`
Expected: FAIL（`Cannot find module '../src/config.js'`）

- [ ] **Step 3: `config.js` を書く**

`packages/core/src/config.js`:

```js
/* サイトの controlboard.config.js を検査し、省略された項目を埋める。
   書き間違いは黙って無視せず、ビルドの時点で項目名入りで止める。 */

export const MODULES = ["news", "jobs", "inquiries", "links", "stats", "rag"];
export const FIELD_TYPES = ["text", "textarea", "richtext", "color", "image", "url", "list", "group"];

function checkField(f, where) {
  if (!f || typeof f !== "object" || !f.key || !f.label) {
    throw new Error(`controlboard: ${where} に key と label のないフィールドがあります`);
  }
  if (!FIELD_TYPES.includes(f.type)) {
    throw new Error(`controlboard: unknown field type "${f.type}" for ${f.key}`);
  }
  if (f.type === "list" || f.type === "group") {
    return { ...f, fields: (f.fields || []).map((x) => checkField(x, f.key)) };
  }
  return { ...f };
}

export function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("controlboard: config must export an object");
  if (!raw.blocks || !raw.blocks.home || !raw.blocks.sub) {
    throw new Error("controlboard: config.blocks.home and config.blocks.sub are required");
  }
  const unknown = Object.keys(raw.modules || {}).filter((k) => !MODULES.includes(k));
  if (unknown.length) throw new Error("controlboard: unknown module: " + unknown.join(", "));
  const modules = {};
  for (const m of MODULES) modules[m] = !!(raw.modules && raw.modules[m] === true);

  const pages = raw.pages || { home: { label: "トップページ", url: "/" } };
  if (!pages.home) throw new Error("controlboard: config.pages.home is required");

  const settings = (raw.settings || []).map((g) => ({
    group: String(g.group || ""),
    fields: (g.fields || []).map((f) => checkField(f, g.group)),
  }));

  return {
    site: { name: "", url: "", logo: "", manualUrl: "", ...raw.site },
    blocks: raw.blocks,
    pages,
    settings,
    modules,
    defaults: { content: {}, pages: {}, ...raw.defaults },
    seo: { pages: {}, org: {}, ...raw.seo },
    csp: { img: [], frame: [], script: [], connect: [], ...raw.csp },
  };
}

/* 共通設定タブの「保存」で送るトップレベルキー。 */
export const settingsTopKeys = (settings) =>
  [...new Set(settings.flatMap((g) => g.fields.map((f) => f.key.split(".")[0])))];

/* 変更前後の比較画面で、キーを日本語の項目名に置き換えるための表。 */
export function labelsFromSettings(settings) {
  const out = {};
  const walk = (fields) => fields.forEach((f) => {
    out[f.key.split(".").pop()] = f.label;
    if (f.fields) walk(f.fields);
  });
  settings.forEach((g) => {
    g.fields.forEach((f) => { const top = f.key.split(".")[0]; if (!out[top]) out[top] = g.group; });
    walk(g.fields);
  });
  return out;
}

/* 変更履歴に出す「どこを保存したか」の名前。 */
export function sectionLabels(config) {
  const out = {
    news: "お知らせ", jobs: "募集要項", recruit: "採用情報",
    pageOrder: "ページの並び順", pageTitles: "ページ名", customPages: "ページ", hiddenPages: "ページ",
  };
  config.settings.forEach((g) => g.fields.forEach((f) => {
    const top = f.key.split(".")[0];
    if (!out[top]) out[top] = g.group;
  }));
  return out;
}
```

- [ ] **Step 4: 仮想モジュールを書く**

`packages/core/src/vite-plugin.js`:

```js
/* サイトの controlboard.config.js を、実行時コード（API・middleware）と
   管理画面の両方から同じ名前で読めるようにする。 */
export const VIRTUAL_ID = "virtual:controlboard/config";
const RESOLVED = "\0" + VIRTUAL_ID;

export function configPlugin(configPath) {
  return {
    name: "controlboard-config",
    resolveId(id) { if (id === VIRTUAL_ID) return RESOLVED; },
    load(id) {
      if (id !== RESOLVED) return;
      return [
        `import raw from ${JSON.stringify(configPath)};`,
        `import { normalizeConfig } from "@controlboard/core/config";`,
        `export default normalizeConfig(raw);`,
      ].join("\n");
    },
  };
}
```

テストのエイリアスは素のオブジェクトを返すので、`packages/core/test/fixtures/config.js` の最後の行を次に置き換え、先頭に import を足す:

```js
import { normalizeConfig } from "../../src/config.js";
```

```js
export default normalizeConfig({
  /* …Step 2 で書いたオブジェクトの中身そのまま… */
});
```

（`export default {` を `export default normalizeConfig({` に、末尾の `};` を `});` に変えるだけ。）

- [ ] **Step 5: compass のライブラリをコピーする**

```bash
cp $COMPASS/site/src/lib/versions.js packages/core/src/runtime/versions.js
cp $COMPASS/site/src/lib/media.js    packages/core/src/runtime/media.js
cp $COMPASS/site/src/lib/links.js    packages/core/src/runtime/links.js
cp $COMPASS/site/src/lib/news.js     packages/core/src/runtime/news.js
cp $COMPASS/site/src/lib/jobs.js     packages/core/src/runtime/jobs.js
grep -n "import" packages/core/src/runtime/news.js packages/core/src/runtime/jobs.js
```

`grep` で `./` 以外の import が出たら、その import と、それを使う関数だけを削除する（news.js / jobs.js は日付・公開判定の純粋関数だけ残す）。

- [ ] **Step 6: `runtime/content.js` を書く**

```js
import config from "virtual:controlboard/config";

// Tokens minted by /api/preview (randHex(16) → 32 hex chars).
const PREVIEW_TOKEN = /^[0-9a-f]{32}$/;

export function previewToken(url) {
  const t = url && url.searchParams ? url.searchParams.get("preview") : null;
  return t && PREVIEW_TOKEN.test(t) ? t : null;
}

/* KV の content を、サイト設定の既定値の上にトップレベルで重ねる。
   ?preview=<token> のときは保存前の下書きで描く（管理画面の変更前後の比較枠が読む）。 */
export async function getContent(env, url) {
  const DEFAULT = config.defaults.content;
  const token = previewToken(url);
  if (token) {
    try {
      const draft = await env.CMS.get("preview:" + token, "json");
      if (draft && typeof draft === "object" && Object.keys(draft).length) return Object.assign({}, DEFAULT, draft);
    } catch (e) { /* 期限切れ・KV 不調 → 公開中の内容へ */ }
  }
  try {
    const live = await env.CMS.get("content", "json");
    if (live && typeof live === "object" && Object.keys(live).length) return Object.assign({}, DEFAULT, live);
  } catch (e) { /* KV 不調 → 既定値 */ }
  return DEFAULT;
}
```

- [ ] **Step 7: `runtime/pages.js` を書く**

compass の `lib/page.js` 1〜108 行の考え方をそのまま、固定ページを config から読む形にする。

```js
import config from "virtual:controlboard/config";
import { previewToken } from "./content.js";

/* Puck のページ文書は KV の page:<id>。一度も保存していないページは
   サイト設定の defaults.pages から組み立てる（空白のページを出さない）。 */

export const PAGES = config.pages;
export const PAGE_IDS = Object.keys(PAGES);

export const CUSTOM_PREFIX = "custom-";
export const isCustomId = (id) => String(id || "").startsWith(CUSTOM_PREFIX);
export const slugOfId = (id) => String(id || "").slice(CUSTOM_PREFIX.length);
export const idOfSlug = (slug) => CUSTOM_PREFIX + slug;

export const cleanSlug = (v) =>
  String(v || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40);

const RESERVED = new Set(
  PAGE_IDS.map((id) => PAGES[id].url.replace(/^\//, ""))
    .concat(["admin", "api", "media", "assets", "rag-admin", "manual", "sitemap.xml", "robots.txt"])
    .filter(Boolean)
);

export const customPages = (content) => {
  const list = (content || {}).customPages;
  return Array.isArray(list) ? list.filter((p) => p && p.slug) : [];
};
export const slugTaken = (slug, content) =>
  RESERVED.has(slug) || customPages(content).some((p) => p.slug === slug);

export const hiddenPageIds = (content) => {
  const list = (content || {}).hiddenPages;
  return Array.isArray(list) ? list.filter((id) => PAGES[id]) : [];
};
export const isPageHidden = (id, content) => hiddenPageIds(content).includes(id);
/* トップと fixed の付いたページ（記事の共通レイアウトなど）は消せない。 */
export const DELETABLE_PAGE_IDS = PAGE_IDS.filter((id) => id !== "home" && !PAGES[id].fixed);
export const findCustom = (content, slug) =>
  customPages(content).find((p) => p.slug === slug) || null;

export function pageDef(id, content) {
  if (PAGES[id]) return PAGES[id];
  if (!isCustomId(id)) return null;
  const p = findCustom(content, slugOfId(id));
  if (!p) return null;
  return {
    label: p.label || p.jp || p.slug,
    url: "/" + p.slug,
    en: p.en || "Page",
    jp: p.jp || p.label || p.slug,
    image: p.image || "",
    imageSp: p.imageSp || "",
    custom: true,
  };
}

export function allPageIds(content) {
  const known = PAGE_IDS.concat(customPages(content).map((p) => idOfSlug(p.slug)));
  const saved = ((content || {}).pageOrder || []).filter((id) => known.includes(id));
  return saved.concat(known.filter((id) => !saved.includes(id)));
}

/* defaults.pages[id] は文書そのものか、content を受け取って文書を返す関数。 */
export function defaultDataFor(id, content) {
  const d = config.defaults.pages[id];
  const doc = typeof d === "function" ? d(content || {}) : d;
  if (doc && Array.isArray(doc.content)) return JSON.parse(JSON.stringify(doc));
  return { root: { props: {} }, content: [] };
}

export async function getPage(env, id, url, content) {
  const token = previewToken(url);
  if (token) {
    try {
      const draft = await env.CMS.get("preview:" + token, "json");
      const page = draft && draft.__pages && draft.__pages[id];
      if (page && Array.isArray(page.content)) return page;
    } catch (e) { /* 期限切れ → 保存済みへ */ }
  }
  try {
    const saved = await env.CMS.get("page:" + id, "json");
    if (saved && Array.isArray(saved.content)) return saved;
  } catch (e) { /* KV 不調 → 既定の並びへ */ }
  return defaultDataFor(id, content);
}
```

- [ ] **Step 8: テストを実行する**

Run: `pnpm vitest run packages/core/test`
Expected: PASS（users / config / content の全件）

- [ ] **Step 9: コミット**

```bash
git add -A && git commit -m "サイト設定の読み込みと content・pages を追加"
```

---

### Task 3: 基本 API ルート（ログイン・ユーザー・コンテンツ・ページ・履歴）

**Files:**
- Create（コピー＋書き換え）: `packages/core/src/routes/{login,logout,me,password,users,content,page,pages,preview,versions}.js`
- Test: `packages/core/test/routes-auth.test.js`, `packages/core/test/routes-content.test.js`

**Interfaces:**
- Consumes: Task 1 `runtime/api.js`, `runtime/users.js`、Task 2 `runtime/content.js`, `runtime/pages.js`, `runtime/versions.js`, `config.js#sectionLabels`
- Produces: 各ファイルが compass と同じ名前の `GET / POST / PUT / PATCH / DELETE` を export し、`export const prerender = false`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/routes-auth.test.js`:

```js
import { describe, it, expect } from "vitest";
import { makeEnv, ctx, seedUser, login } from "./helpers.js";
import * as loginR from "../src/routes/login.js";
import * as meR from "../src/routes/me.js";
import * as usersR from "../src/routes/users.js";

const post = (env, path, body, cookie, method = "POST") =>
  ctx(env, { method, url: "https://example.test/api/" + path, body, cookie });

describe("login", () => {
  it("正しい ID とパスワードで sid を発行し、7日で切れる", async () => {
    const env = makeEnv();
    await seedUser(env);
    const res = await loginR.POST(post(env, "login", { user: "owner", password: "pass-1234" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/^sid=[0-9a-f]{48}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
    const token = cookie.slice(4, 52);
    expect(env.CMS.ttl.get("session:" + token)).toBe(604800);
  });
  it("パスワード違い・存在しない ID は同じ 401", async () => {
    const env = makeEnv();
    await seedUser(env);
    expect((await loginR.POST(post(env, "login", { user: "owner", password: "x" }))).status).toBe(401);
    expect((await loginR.POST(post(env, "login", { user: "nobody", password: "x" }))).status).toBe(401);
  });
  it("me はログイン中の権限を返す", async () => {
    const env = makeEnv();
    await seedUser(env);
    const cookie = await login(env);
    const data = await (await meR.GET(ctx(env, { cookie }))).json();
    expect(data.perms).toContain("users");
  });
});

describe("users", () => {
  it("最後のオーナーを編集者に下げられない", async () => {
    const env = makeEnv();
    const u = await seedUser(env);
    const cookie = await login(env);
    const res = await usersR.PUT(post(env, "users", { id: u.id, role: "editor" }, cookie, "PUT"));
    expect(res.status).toBe(400);
  });
  it("users 権限のない人は一覧を見られない", async () => {
    const env = makeEnv();
    await seedUser(env, { user: "ed", role: "editor" });
    const cookie = await login(env, "ed");
    expect((await usersR.GET(ctx(env, { cookie }))).status).toBe(403);
  });
});
```

`packages/core/test/routes-content.test.js`:

```js
import { describe, it, expect } from "vitest";
import { makeEnv, ctx, seedUser, login } from "./helpers.js";
import * as contentR from "../src/routes/content.js";
import * as pageR from "../src/routes/page.js";
import * as pagesR from "../src/routes/pages.js";
import * as versionsR from "../src/routes/versions.js";
import * as previewR from "../src/routes/preview.js";

const req = (env, method, path, body, cookie) =>
  ctx(env, { method, url: "https://example.test/api/" + path, body, cookie });

async function setup() {
  const env = makeEnv();
  await seedUser(env);
  return { env, cookie: await login(env) };
}

describe("content", () => {
  it("PATCH は送ったキーだけ上書きし、履歴に設定のグループ名で残す", async () => {
    const { env, cookie } = await setup();
    await env.CMS.put("content", JSON.stringify({ contact: { tel: "1" }, theme: { primary: "#000" } }));
    const res = await contentR.PATCH(req(env, "PATCH", "content", { contact: { tel: "2" } }, cookie));
    expect(res.status).toBe(200);
    const saved = await env.CMS.get("content", "json");
    expect(saved.contact.tel).toBe("2");
    expect(saved.theme.primary).toBe("#000");
    expect((await env.CMS.get("verindex", "json")).items[0].label).toBe("基本情報");
  });
  it("お知らせに id を振る", async () => {
    const { env, cookie } = await setup();
    await contentR.PATCH(req(env, "PATCH", "content", { news: [{ title: "a" }] }, cookie));
    expect((await env.CMS.get("content", "json")).news[0].id).toMatch(/^[0-9a-f]{10}$/);
  });
  it("空の PATCH と配列は 400、未ログインは 401", async () => {
    const { env, cookie } = await setup();
    expect((await contentR.PATCH(req(env, "PATCH", "content", {}, cookie))).status).toBe(400);
    expect((await contentR.PATCH(req(env, "PATCH", "content", [1], cookie))).status).toBe(400);
    expect((await contentR.PATCH(req(env, "PATCH", "content", { a: 1 }))).status).toBe(401);
  });
});

describe("page / pages", () => {
  it("保存したページは page:<id> に入り、履歴から復元できる", async () => {
    const { env, cookie } = await setup();
    const doc1 = { root: { props: {} }, content: [{ type: "Text", props: { id: "1", text: "a" } }] };
    const doc2 = { root: { props: {} }, content: [] };
    const u = "page?id=about";
    expect((await pageR.PUT(req(env, "PUT", u, doc1, cookie))).status).toBe(200);
    await pageR.PUT(req(env, "PUT", u, doc2, cookie));
    const { items } = await (await versionsR.GET(req(env, "GET", "versions", undefined, cookie))).json();
    const first = items.find((v) => v.pageId === "about" && v.seq === Math.min(...items.map((i) => i.seq)));
    await versionsR.POST(req(env, "POST", "versions", { seq: first.seq }, cookie));
    expect((await env.CMS.get("page:about", "json")).content).toHaveLength(1);
  });
  it("知らないページ id は 404", async () => {
    const { env, cookie } = await setup();
    expect((await pageR.PUT(req(env, "PUT", "page?id=ghost", { content: [] }, cookie))).status).toBe(404);
  });
  it("ページ追加は予約済みの住所を拒否する", async () => {
    const { env, cookie } = await setup();
    const res = await pagesR.POST(req(env, "POST", "pages", { title: "管理", slug: "admin" }, cookie));
    expect(res.status).toBe(400);
  });
  it("fixed のページは削除できない", async () => {
    const { env, cookie } = await setup();
    expect((await pagesR.DELETE(req(env, "DELETE", "pages", { id: "news" }, cookie))).status).toBe(400);
    expect((await pagesR.DELETE(req(env, "DELETE", "pages", { id: "about" }, cookie))).status).toBe(200);
  });
  it("preview は 900 秒で消える下書きを作る", async () => {
    const { env, cookie } = await setup();
    const { token } = await (await previewR.POST(req(env, "POST", "preview", { contact: {} }, cookie))).json();
    expect(env.CMS.ttl.get("preview:" + token)).toBe(900);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run packages/core/test/routes-auth.test.js packages/core/test/routes-content.test.js`
Expected: FAIL（`Cannot find module '../src/routes/login.js'`）

- [ ] **Step 3: compass の API をコピーし、import 先を書き換える**

```bash
for f in login logout me password users content page pages preview versions; do
  cp $COMPASS/site/src/pages/api/$f.js packages/core/src/routes/$f.js
done
sed -i '' 's#"\.\./\.\./lib/page\.js"#"../runtime/pages.js"#; s#"\.\./\.\./lib/#"../runtime/#' packages/core/src/routes/*.js
grep -n "import" packages/core/src/routes/*.js
```

Expected: import 先がすべて `../runtime/*.js` になっている。`indexnow.js` の import だけが残る（次の Step で消す）。

- [ ] **Step 4: compass 固有の部分を書き換える**

`routes/content.js`:
- `import { notifyContentChange } from "../runtime/indexnow.js";` の行と、`notifyContentChange(...)` の呼び出し2か所を削除。
- `const SECTION_LABELS = { … };` のブロック全体と `const labelFor = …` の行を次に置き換える:

```js
import config from "virtual:controlboard/config";
import { sectionLabels } from "../config.js";

const SECTION_LABELS = sectionLabels(config);
const labelFor = (keys) => keys.map((k) => SECTION_LABELS[k] || k).join("・");
```

`routes/page.js`:
- `import { notifyPageChange } from "../runtime/indexnow.js";` と `notifyPageChange(locals, url, id, cur);` を削除。
- 冒頭コメント「決まった7ページは…」を `/* 固定ページはいつでも通す。追加したページは content に書いてあるものだけ通す。 */` に置き換える。
- `if (id !== "home" && id !== "newsArticle") {` を `if (id !== "home" && !(PAGES[id] && PAGES[id].fixed)) {` に置き換え、import 行を `import { defaultDataFor, pageDef, PAGES } from "../runtime/pages.js";` にする。

`routes/pages.js`: import 行の `"../runtime/page.js"` が `"../runtime/pages.js"` になっていることを確認する（Step 3 の sed で変わっている）。

- [ ] **Step 5: テストを実行する**

Run: `pnpm vitest run packages/core/test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "ログイン・ユーザー・コンテンツ・ページ・履歴の API を移植"
```

---

### Task 4: 周辺 API（画像・リンク・問い合わせ・統計・クリック・RAG）

**Files:**
- Create（コピー＋書き換え）: `packages/core/src/routes/{upload,media,links,inquiries,inquiry,stats,track}.js`, `packages/core/src/routes/media-file.js`, `packages/core/src/routes/rag-ask.js`
- Create（コピー＋書き換え）: `packages/core/src/runtime/mail.js`, `packages/core/src/runtime/rag/*`
- Test: `packages/core/test/routes-media.test.js`

**Interfaces:**
- Consumes: Task 1〜2 の runtime
- Produces: 各ルートの HTTP ハンドラ。`/media/[...path]` の本体は `routes/media-file.js`（ファイル名を変えるのは `routes/media.js`＝`/api/media` と衝突するため）
- 環境変数（新規）: `CF_ACCOUNT_ID`, `CLICKS_DATASET`（stats 用。compass では直書きだった）, `MAIL_FROM_NAME`（問い合わせ通知の差出人名。未設定なら `config.site.name`）

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/routes-media.test.js`:

```js
import { describe, it, expect } from "vitest";
import { makeEnv, ctx, seedUser, login } from "./helpers.js";
import * as uploadR from "../src/routes/upload.js";
import * as fileR from "../src/routes/media-file.js";
import * as inquiryR from "../src/routes/inquiry.js";
import * as inquiriesR from "../src/routes/inquiries.js";

function form(name, type, size) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(size)], name, { type }));
  return fd;
}
async function setup(extra) {
  const env = makeEnv(extra);
  await seedUser(env);
  return { env, cookie: await login(env) };
}
const up = (env, fd, cookie) => ctx(env, { method: "POST", url: "https://example.test/api/upload", body: fd, cookie });

describe("upload", () => {
  it("画像を uploads/ に置き、表示名を残す", async () => {
    const { env, cookie } = await setup();
    const data = await (await uploadR.POST(up(env, form("Photo 1.JPG", "image/jpeg", 10), cookie))).json();
    expect(data.url).toMatch(/^\/media\/uploads\/photo-1-[0-9a-f]{8}\.jpg$/);
    expect(Object.values(await env.CMS.get("medianames", "json"))).toContain("Photo 1");
  });
  it("staging では staging/uploads/ に置く", async () => {
    const { env, cookie } = await setup({ SITE_ENV: "staging" });
    const data = await (await uploadR.POST(up(env, form("a.png", "image/png", 10), cookie))).json();
    expect(data.url).toMatch(/^\/media\/staging\/uploads\//);
  });
  it("画像以外と 5MB 超は 400", async () => {
    const { env, cookie } = await setup();
    expect((await uploadR.POST(up(env, form("a.pdf", "application/pdf", 10), cookie))).status).toBe(400);
    expect((await uploadR.POST(up(env, form("a.png", "image/png", 5 * 1024 * 1024 + 1), cookie))).status).toBe(400);
  });
  it("アップロードした画像を /media/ から配る", async () => {
    const { env, cookie } = await setup();
    const { url } = await (await uploadR.POST(up(env, form("a.png", "image/png", 10), cookie))).json();
    const path = url.replace(/^\/media\//, "");
    const res = await fileR.GET({ ...ctx(env, { url: "https://example.test" + url }), params: { path } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });
});

describe("inquiry", () => {
  it("公開フォームから受け付け、管理画面の一覧に出る", async () => {
    const { env, cookie } = await setup();
    const res = await inquiryR.POST(ctx(env, {
      method: "POST", url: "https://example.test/api/inquiry",
      body: { name: "山田", email: "a@example.test", message: "相談です" },
    }));
    expect(res.status).toBe(200);
    const { items } = await (await inquiriesR.GET(ctx(env, { cookie }))).json();
    expect(items[0].name).toBe("山田");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run packages/core/test/routes-media.test.js`
Expected: FAIL（`Cannot find module '../src/routes/upload.js'`）

- [ ] **Step 3: コピーして import 先を書き換える**

```bash
for f in upload media links inquiries inquiry stats track; do
  cp $COMPASS/site/src/pages/api/$f.js packages/core/src/routes/$f.js
done
cp "$COMPASS/site/src/pages/media/[...path].js" packages/core/src/routes/media-file.js
cp $COMPASS/site/src/pages/api/admin/rag-ask.js packages/core/src/routes/rag-ask.js
cp $COMPASS/site/src/lib/mail.js packages/core/src/runtime/mail.js
cp -R $COMPASS/site/src/lib/rag packages/core/src/runtime/rag
sed -i '' 's#"\.\./\.\./\.\./lib/#"../runtime/#; s#"\.\./\.\./lib/page\.js"#"../runtime/pages.js"#; s#"\.\./\.\./lib/#"../runtime/#' packages/core/src/routes/*.js
grep -rn "import" packages/core/src/routes/{upload,media,links,inquiries,inquiry,stats,track,media-file,rag-ask}.js packages/core/src/runtime/mail.js
```

Expected: import 先がすべて `../runtime/…` か `./…`。`content-defaults.js` や `indexnow.js` など存在しないものを読んでいたら、次の Step で取り除く。

- [ ] **Step 4: compass 固有の値を外す**

1. `grep -rniE "コンパス|compass|高田馬場|税" packages/core/src` を実行し、出た行を1件ずつ次の規則で直す。
   - `routes/stats.js` のアカウント ID 定数 → `env.CF_ACCOUNT_ID`。未設定なら `json({ error: "not_configured", message: "統計の設定（CF_ACCOUNT_ID）がありません。" }, 503)` を返す。
   - `routes/stats.js` の `const DATASET = "compass_clicks";` → 関数内で `const DATASET = env.CLICKS_DATASET || "controlboard_clicks";`。
   - `runtime/mail.js` の `const FROM_NAME = "…";` → 関数内で `const FROM_NAME = env.MAIL_FROM_NAME || (config.site.name + " お問合せ");`。先頭に `import config from "virtual:controlboard/config";` を足す。`webmaster@…` を書いたコメントは「差出人は MAIL_FROM」に直す。
   - `runtime/rag/config.js` の SYSTEM_PROMPT 中の「コンパス会計社サイトの管理画面」→「このサイトの管理画面」。
   - それ以外のコメント中の固有名は、固有名を消して意味だけ残す。
2. `routes/inquiry.js` が `content-defaults.js` や `DEFAULT_CONTENT` を読んでいたら、`getContent(env)` に置き換える。
3. `rag-ask.js` の `../runtime/api.js` 以外の import 先が `../runtime/rag/…` であることを確認する。

再確認:

```bash
grep -rniE "コンパス|compass|高田馬場|税理士|b7ce|c1bf|ec01" packages/core/src
```

Expected: 出力なし。

- [ ] **Step 5: テストを実行する**

Run: `pnpm vitest run packages/core/test`
Expected: PASS（`inquiry` は `RESEND_API_KEY` 未設定のためメール送信を飛ばして受け付ける。compass の実装がそうなっていなければ、`sendInquiryMail` の呼び出しを `if (env.RESEND_API_KEY)` で囲む）

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "画像・リンク・問い合わせ・統計・RAG の API を移植"
```

---

### Task 5: Astro integration と middleware

**Files:**
- Create: `packages/core/src/index.js`, `packages/core/src/routes-table.js`, `packages/core/src/middleware.js`
- Test: `packages/core/test/middleware.test.js`, `packages/core/test/integration.test.js`

**Interfaces:**
- Consumes: Task 2 `configPlugin`, Task 3〜4 のルートファイル
- Produces: `index.js` の `default controlboard({ config = "./controlboard.config.js" } = {}) → AstroIntegration`
- Produces: `routes-table.js` の `ROUTES: Array<{ pattern: string, file: string }>`
- Produces: `middleware.js` の `onRequest(context, next)`, `moduleFor(pathname) → string|null`, `basicAuthOk(request, env) → boolean`, `buildCsp(csp) → string`
- Consumes（Task 7 が提供）: `build-admin.js` の `buildAdmin({ configPath, outDir })`。この Task では import だけして、テストでは差し替える

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/middleware.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { makeEnv } from "./helpers.js";
import { onRequest, moduleFor, basicAuthOk, buildCsp } from "../src/middleware.js";

function mctx(env, url, { method = "GET", headers = {} } = {}) {
  const u = new URL(url);
  const waits = [];
  return { request: new Request(u, { method, headers }), url: u, locals: { runtime: { env, ctx: { waitUntil: (p) => waits.push(p) } } }, waits };
}
const html = (status = 200) => async () => new Response("<p>ok</p>", { status, headers: { "content-type": "text/html" } });

describe("モジュールの無効化", () => {
  it("パスとモジュールの対応", () => {
    expect(moduleFor("/api/links")).toBe("links");
    expect(moduleFor("/api/inquiry")).toBe("inquiries");
    expect(moduleFor("/api/inquiries")).toBe("inquiries");
    expect(moduleFor("/api/track")).toBe("stats");
    expect(moduleFor("/api/admin/rag-ask")).toBe("rag");
    expect(moduleFor("/api/content")).toBe(null);
  });
  it("無効なモジュールの API は 404（fixture は links=false）", async () => {
    const next = vi.fn(html());
    const res = await onRequest(mctx(makeEnv(), "https://example.test/api/links", { method: "POST" }), next);
    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });
  it("有効なモジュールは通す（inquiries=true）", async () => {
    const next = vi.fn(html());
    await onRequest(mctx(makeEnv(), "https://example.test/api/inquiries"), next);
    expect(next).toHaveBeenCalled();
  });
});

describe("staging の Basic 認証", () => {
  it("BASIC_USER / BASIC_PASS が未設定なら常に拒否", () => {
    const req = new Request("https://s.test/", { headers: { authorization: "Basic " + btoa("compasstax:compasstax") } });
    expect(basicAuthOk(req, {})).toBe(false);
  });
  it("一致すれば通す", () => {
    const req = new Request("https://s.test/", { headers: { authorization: "Basic " + btoa("u:p") } });
    expect(basicAuthOk(req, { BASIC_USER: "u", BASIC_PASS: "p" })).toBe(true);
  });
  it("staging は認証前に 401", async () => {
    const res = await onRequest(mctx(makeEnv({ SITE_ENV: "staging" }), "https://stg.example.test/"), html());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Basic/);
  });
});

describe("admin ホスト", () => {
  it("admin. の / は管理画面を no-store で返す", async () => {
    const env = makeEnv({ ASSETS: { fetch: async () => new Response("<div id=root>", { headers: { "content-type": "text/html", etag: "x" } }) } });
    const res = await onRequest(mctx(env, "https://admin.example.test/"), html());
    expect(await res.text()).toBe("<div id=root>");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("etag")).toBe(null);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("短縮リンク", () => {
  async function envWithLink() {
    const env = makeEnv();
    await env.CMS.put("links", JSON.stringify({ items: [{ code: "about", url: "/x" }, { code: "a7f3c9", url: "https://example.test/about" }] }));
    return env;
  }
  it("links が無効なサイトでは転送しない（fixture は links=false）", async () => {
    const res = await onRequest(mctx(await envWithLink(), "https://example.test/a7f3c9"), html(404));
    expect(res.status).toBe(404);
  });
});

describe("CSP", () => {
  it("サイト設定の許可先を足す", () => {
    const csp = buildCsp({ img: ["https://img.example"], frame: ["https://maps.google.com"], script: [], connect: [] });
    expect(csp).toContain("img-src 'self' data: blob: https://img.example");
    expect(csp).toContain("frame-src 'self' https://maps.google.com");
    expect(csp).toContain("frame-ancestors 'self'");
  });
});
```

短縮リンクの「ページ優先・404 のときだけ転送・1件数える」は links=true の設定が要るため、`packages/core/test/middleware-links.test.js` を別ファイルにして、そのファイルの先頭で仮想モジュールを差し替える:

```js
import { describe, it, expect, vi } from "vitest";
import { makeEnv } from "./helpers.js";

vi.mock("virtual:controlboard/config", async (orig) => {
  const base = (await orig()).default;
  return { default: { ...base, modules: { ...base.modules, links: true } } };
});
const { onRequest } = await import("../src/middleware.js");

function mctx(env, url) {
  const u = new URL(url);
  const waits = [];
  return { request: new Request(u), url: u, locals: { runtime: { env, ctx: { waitUntil: (p) => waits.push(p) } } }, waits };
}
const page = (status) => async () => new Response("page", { status, headers: { "content-type": "text/html" } });

describe("短縮リンク（links=true）", () => {
  async function envWithLink() {
    const env = makeEnv();
    await env.CMS.put("links", JSON.stringify({ items: [{ code: "about", url: "/x" }, { code: "a7f3c9", url: "https://example.test/about" }, { code: "off", url: "/y", disabled: true }] }));
    return env;
  }
  it("ページが見つからないときだけ 302 で転送し、1件数える", async () => {
    const env = await envWithLink();
    const c = mctx(env, "https://example.test/a7f3c9");
    const res = await onRequest(c, page(404));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.test/about");
    await Promise.all(c.waits);
    expect((await env.CMS.get("linkhits:a7f3c9", "json")).total).toBe(1);
  });
  it("同じ住所のページがあればページを返す", async () => {
    const res = await onRequest(mctx(await envWithLink(), "https://example.test/about"), page(200));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("page");
  });
  it("無効化したリンクは転送しない", async () => {
    const res = await onRequest(mctx(await envWithLink(), "https://example.test/off"), page(404));
    expect(res.status).toBe(404);
  });
});
```

`packages/core/test/integration.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
vi.mock("../src/build-admin.js", () => ({ buildAdmin: vi.fn(async () => {}) }));
import controlboard from "../src/index.js";
import { ROUTES } from "../src/routes-table.js";
import { buildAdmin } from "../src/build-admin.js";
import { existsSync } from "node:fs";

async function runSetup(command) {
  const injected = [];
  const mws = [];
  const updates = [];
  await controlboard().hooks["astro:config:setup"]({
    config: { root: new URL("file:///tmp/site/") },
    command,
    injectRoute: (r) => injected.push(r),
    addMiddleware: (m) => mws.push(m),
    updateConfig: (u) => updates.push(u),
    logger: { info() {}, warn() {} },
  });
  return { injected, mws, updates };
}

describe("integration", () => {
  it("全 API ルートを注入し、実在するファイルを指す", async () => {
    const { injected } = await runSetup("build");
    expect(injected.map((r) => r.pattern)).toEqual(ROUTES.map((r) => r.pattern));
    for (const r of injected) expect(existsSync(r.entrypoint)).toBe(true);
    expect(injected.map((r) => r.pattern)).toContain("/media/[...path]");
  });
  it("middleware を pre で登録し、仮想モジュールを入れる", async () => {
    const { mws, updates } = await runSetup("dev");
    expect(mws[0].order).toBe("pre");
    expect(updates[0].vite.plugins[0].name).toBe("controlboard-config");
  });
  it("build と dev のときだけ管理画面をビルドする", async () => {
    buildAdmin.mockClear();
    await runSetup("build");
    await runSetup("sync");
    expect(buildAdmin).toHaveBeenCalledTimes(1);
    expect(buildAdmin.mock.calls[0][0]).toEqual({ configPath: "/tmp/site/controlboard.config.js", outDir: "/tmp/site/public/admin" });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run packages/core/test/middleware.test.js packages/core/test/middleware-links.test.js packages/core/test/integration.test.js`
Expected: FAIL（`Cannot find module '../src/middleware.js'`）

- [ ] **Step 3: ルート表を書く**

`packages/core/src/routes-table.js`:

```js
import { fileURLToPath } from "node:url";

const f = (name) => fileURLToPath(new URL("./routes/" + name, import.meta.url));

export const ROUTES = [
  { pattern: "/api/login", file: f("login.js") },
  { pattern: "/api/logout", file: f("logout.js") },
  { pattern: "/api/me", file: f("me.js") },
  { pattern: "/api/password", file: f("password.js") },
  { pattern: "/api/users", file: f("users.js") },
  { pattern: "/api/content", file: f("content.js") },
  { pattern: "/api/page", file: f("page.js") },
  { pattern: "/api/pages", file: f("pages.js") },
  { pattern: "/api/preview", file: f("preview.js") },
  { pattern: "/api/versions", file: f("versions.js") },
  { pattern: "/api/upload", file: f("upload.js") },
  { pattern: "/api/media", file: f("media.js") },
  { pattern: "/api/links", file: f("links.js") },
  { pattern: "/api/inquiries", file: f("inquiries.js") },
  { pattern: "/api/inquiry", file: f("inquiry.js") },
  { pattern: "/api/stats", file: f("stats.js") },
  { pattern: "/api/track", file: f("track.js") },
  { pattern: "/api/admin/rag-ask", file: f("rag-ask.js") },
  { pattern: "/media/[...path]", file: f("media-file.js") },
];
```

- [ ] **Step 4: middleware を書く**

`packages/core/src/middleware.js`（compass の `src/middleware.js` から、旧お知らせ URL の転送と www / 末尾スラッシュの寄せを除き、モジュール 404・短縮リンク・設定からの CSP を足したもの）:

```js
import config from "virtual:controlboard/config";
import { previewToken } from "./runtime/content.js";
import { safeEqual } from "./runtime/api.js";
import { readLinks, findLink, recordHit } from "./runtime/links.js";

/* admin.〜 で開いたときは、トップページを管理画面にする。
   admin.example.jp と staging.admin.example.jp の両方に効く。 */
const ADMIN_HOST = /(^|\.)admin\./i;

/* 無効にしたモジュールの API は、ルートがあっても 404 にする。 */
const MODULE_ROUTES = [
  [/^\/api\/links(\/|$)/, "links"],
  [/^\/api\/inquir(y|ies)(\/|$)/, "inquiries"],
  [/^\/api\/(stats|track)(\/|$)/, "stats"],
  [/^\/api\/admin\/rag-ask(\/|$)/, "rag"],
];
export function moduleFor(pathname) {
  for (const [re, m] of MODULE_ROUTES) if (re.test(pathname)) return m;
  return null;
}

/* 試験用サイトの Basic 認証。ID・パスワードが設定されていなければ誰も通さない。 */
export function basicAuthOk(request, env) {
  if (!env.BASIC_USER || !env.BASIC_PASS) return false;
  const want = "Basic " + btoa(env.BASIC_USER + ":" + env.BASIC_PASS);
  return safeEqual(request.headers.get("authorization") || "", want);
}
const ASK_BASIC = () =>
  new Response("この試験用サイトはIDとパスワードが必要です。\n", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="staging", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });

const NOT_FOUND = () =>
  new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* 管理画面は public/admin/index.html。応答のヘッダーを書き換えられる形に写して返す。 */
async function adminPage(env, url) {
  const asset = await env.ASSETS.fetch(new Request(new URL("/admin/", url)));
  const headers = new Headers(asset.headers);
  headers.set("cache-control", "no-store");
  headers.delete("etag");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

const SINGLE_SEGMENT = /^\/([a-z0-9-]{1,40})$/;

async function shortLink(context, env) {
  const m = context.url.pathname.toLowerCase().match(SINGLE_SEGMENT);
  if (!m) return null;
  const code = m[1];
  const link = findLink(await readLinks(env), code);
  if (!link || link.disabled || !link.url) return null;
  const job = recordHit(env, code, new Date()).catch(() => {});
  const ctx = context.locals.runtime && context.locals.runtime.ctx;
  if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  return new Response(null, {
    status: 302,
    headers: { location: link.url, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

export function buildCsp(csp) {
  const extra = (list) => (list && list.length ? " " + list.join(" ") : "");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com" + extra(csp.script),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:" + extra(csp.img),
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com" + extra(csp.connect),
    "frame-src 'self'" + extra(csp.frame),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}
const CSP = buildCsp(config.csp);

export async function onRequest(context, next) {
  const env = (context.locals.runtime && context.locals.runtime.env) || {};
  const staging = String(env.SITE_ENV || "") === "staging";
  if (staging && !basicAuthOk(context.request, env)) return ASK_BASIC();

  const mod = moduleFor(context.url.pathname);
  if (mod && !config.modules[mod]) return NOT_FOUND();

  const adminHost = ADMIN_HOST.test(context.url.hostname);
  const serveAdmin = adminHost
    && context.url.pathname === "/"
    && !previewToken(context.url)
    && (context.request.method === "GET" || context.request.method === "HEAD");

  let res = serveAdmin ? await adminPage(env, context.url) : await next();

  /* 短縮リンクはページが見つからなかったときだけ。同じ住所のページがあればページが勝つ。 */
  if (res.status === 404 && config.modules.links && context.request.method === "GET") {
    const moved = await shortLink(context, env);
    if (moved) return moved;
  }

  if (adminHost || staging) {
    res.headers.set("x-robots-tag", "noindex, nofollow");
    if (staging) { res.headers.set("cache-control", "no-store"); res.headers.set("vary", "authorization"); }
  }
  if (previewToken(context.url)) {
    res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    res.headers.set("cache-control", "no-store");
  }
  try {
    const type = res.headers.get("content-type") || "";
    if (type.startsWith("text/html")) {
      if (!/charset/i.test(type)) res.headers.set("content-type", "text/html; charset=utf-8");
      if (!res.headers.get("content-security-policy")) res.headers.set("content-security-policy", CSP);
    }
  } catch (e) { /* 書き換えられない応答はそのまま */ }
  return res;
}
```

- [ ] **Step 5: integration を書く**

`packages/core/src/index.js`:

```js
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { appendFile } from "node:fs/promises";
import { configPlugin } from "./vite-plugin.js";
import { ROUTES } from "./routes-table.js";
import { buildAdmin } from "./build-admin.js";

const ADMIN_HEADERS = `
/admin/*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
`;

export default function controlboard({ config = "./controlboard.config.js" } = {}) {
  let root = "";
  return {
    name: "@controlboard/core",
    hooks: {
      "astro:config:setup": async ({ config: astro, command, injectRoute, addMiddleware, updateConfig, logger }) => {
        root = fileURLToPath(astro.root);
        const configPath = resolve(root, config);
        updateConfig({
          vite: {
            plugins: [configPlugin(configPath)],
            /* Workers には MessageChannel がない。react-dom の edge 版を使う。 */
            resolve: { alias: { "react-dom/server": "react-dom/server.edge" } },
          },
        });
        for (const r of ROUTES) injectRoute({ pattern: r.pattern, entrypoint: r.file, prerender: false });
        addMiddleware({ entrypoint: fileURLToPath(new URL("./middleware.js", import.meta.url)), order: "pre" });
        if (command === "build" || command === "dev") {
          logger.info("管理画面をビルドしています");
          await buildAdmin({ configPath, outDir: resolve(root, "public/admin") });
        }
      },
      /* 管理画面は静的ファイルとして配られ worker を通らないので、_headers で閉じる。 */
      "astro:build:done": async ({ dir }) => {
        await appendFile(new URL("_headers", dir), ADMIN_HEADERS);
      },
    },
  };
}
```

Task 7 までのあいだテストを通すため、`packages/core/src/build-admin.js` を仮に作る:

```js
export async function buildAdmin() {
  throw new Error("buildAdmin is implemented in Task 7");
}
```

- [ ] **Step 6: テストを実行する**

Run: `pnpm vitest run packages/core/test`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add -A && git commit -m "Astro integration と middleware を追加"
```

---

### Task 6: Puck の差し込み口と SEO

**Files:**
- Create: `packages/core/src/puck.jsx`, `packages/core/src/seo.js`
- Test: `packages/core/test/puck.test.jsx`, `packages/core/test/seo.test.js`

**Interfaces:**
- Produces: `puck.jsx` の `richField(label) → PuckCustomField`, `imageField(label, hint?) → PuckCustomField`, `setRichTextRenderer(fn)`, `setImageRenderer(fn)`
  - `richField` は `{ type: "custom", label, rich: true, render }`。renderer 未設定ならテキストエリア。
  - `imageField` は `{ type: "custom", label, image: true, render }`。renderer 未設定なら URL の入力欄。
  - renderer は `(props & { label, hint }) => ReactNode`。`props` は Puck の custom field の `{ value, onChange, field, name, id }`。
- Produces: `seo.js` の `seoFor(pageId, content, url) → { title, desc, canonical }`, `orgJsonLd(content) → object`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/puck.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { richField, imageField, setRichTextRenderer, setImageRenderer } from "../src/puck.jsx";

const props = { value: "<p>x</p>", onChange() {}, name: "body", id: "f1" };

describe("puck fields", () => {
  it("renderer がなければ素の入力欄", () => {
    expect(renderToStaticMarkup(richField("本文").render(props))).toContain("<textarea");
    expect(renderToStaticMarkup(imageField("写真").render({ ...props, value: "/a.png" }))).toContain('value="/a.png"');
  });
  it("管理画面が差し込んだ renderer を使う", () => {
    setRichTextRenderer((p) => <b>{p.label}</b>);
    setImageRenderer((p) => <i>{p.hint}</i>);
    expect(renderToStaticMarkup(richField("本文").render(props))).toBe("<b>本文</b>");
    expect(renderToStaticMarkup(imageField("写真", "横長").render(props))).toBe("<i>横長</i>");
  });
  it("管理画面が見分けるための印", () => {
    expect(richField("a").rich).toBe(true);
    expect(imageField("a").image).toBe(true);
  });
});
```

`packages/core/test/seo.test.js`:

```js
import { describe, it, expect } from "vitest";
import { seoFor, orgJsonLd } from "../src/seo.js";

describe("seo", () => {
  it("固定ページは config.seo.pages を使う", () => {
    expect(seoFor("home", {}, new URL("https://example.test/"))).toEqual({
      title: "テスト事務所", desc: "説明", canonical: "https://example.test/",
    });
  });
  it("追加したページは content の desc と題名を使う", () => {
    const content = { customPages: [{ slug: "faq", label: "よくある質問", desc: "FAQ です" }] };
    expect(seoFor("custom-faq", content, new URL("https://example.test/faq"))).toEqual({
      title: "よくある質問｜テスト事務所", desc: "FAQ です", canonical: "https://example.test/faq",
    });
  });
  it("設定のないページはページ名とサイト名", () => {
    expect(seoFor("about", {}, new URL("https://example.test/about")).title).toBe("私たちについて｜テスト事務所");
  });
  it("組織の JSON-LD は config.seo.org と連絡先から作る", () => {
    const ld = orgJsonLd({ contact: { tel: "03-1" } });
    expect(ld).toMatchObject({ "@context": "https://schema.org", "@type": "Organization", name: "テスト事務所", url: "https://example.test", telephone: "03-1" });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run packages/core/test/puck.test.jsx packages/core/test/seo.test.js`
Expected: FAIL（モジュールがない）

- [ ] **Step 3: `puck.jsx` を書く**

compass の `src/puck/config.jsx` 20〜50 行の仕組みを、サイト共通の部品として切り出す。

```jsx
import React from "react";

/* リッチテキストと画像の入力欄。編集部品（Tiptap・画像ライブラリ）は管理画面が
   起動時に差し込むので、公開サイトの bundle には入らない。 */
let richRenderer = null;
let imageRenderer = null;
export function setRichTextRenderer(fn) { richRenderer = fn; }
export function setImageRenderer(fn) { imageRenderer = fn; }

export const richField = (label) => ({
  type: "custom",
  label,
  rich: true,
  render: (props) => (richRenderer
    ? richRenderer(Object.assign({}, props, { label }))
    : <textarea className="rt-plain" rows={6} value={props.value || ""} onChange={(e) => props.onChange(e.target.value)} />),
});

export const imageField = (label, hint) => ({
  type: "custom",
  label,
  image: true,
  render: (props) => (imageRenderer
    ? imageRenderer(Object.assign({}, props, { label, hint }))
    : <input type="text" value={props.value || ""} onChange={(e) => props.onChange(e.target.value)} />),
});
```

`packages/core/vitest.config.js` に JSX の変換を足す（`test` の隣に）:

```js
  esbuild: { jsx: "automatic" },
```

- [ ] **Step 4: `seo.js` を書く**

```js
import config from "virtual:controlboard/config";
import { pageDef } from "./runtime/pages.js";

/* ページの title / description / canonical。固定ページは config.seo.pages、
   管理画面で足したページは content.customPages の desc を使う。 */
export function seoFor(pageId, content, url) {
  const site = config.site.name;
  const fixed = config.seo.pages[pageId];
  const def = pageDef(pageId, content) || {};
  const custom = def.custom ? ((content.customPages || []).find((p) => "/" + p.slug === def.url) || {}) : {};
  const title = (fixed && fixed.title) || [def.jp || def.label, site].filter(Boolean).join("｜");
  const desc = (fixed && fixed.desc) || custom.desc || "";
  const base = config.site.url || url.origin;
  return { title, desc, canonical: new URL(url.pathname, base).toString() };
}

export function orgJsonLd(content) {
  const c = (content && content.contact) || {};
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.site.name,
    url: config.site.url,
    ...(c.tel ? { telephone: c.tel } : {}),
    ...config.seo.org,
  };
}
```

`orgJsonLd` のテストは `name` と `url` を config から取る。fixture の `seo.org` は `{ name: "テスト事務所" }` で同じ値なので、上書き順の影響を受けない。

- [ ] **Step 5: テストを実行する**

Run: `pnpm vitest run packages/core/test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add -A && git commit -m "Puck の入力欄と SEO の補助関数を追加"
```

---

### Task 7: 管理画面の移植と汎用化

**Files:**
- Create: `packages/admin/package.json`, `packages/admin/index.html`
- Create（コピー）: `packages/admin/src/*`（compass の `admin-src/src/*` 全部）
- Create: `packages/admin/src/SettingsForm.jsx`, `packages/admin/src/visible.js`
- Modify: `packages/admin/src/{App.jsx,SiteEditor.jsx,Links.jsx,Stats.jsx,News.jsx,Jobs.jsx,preview.jsx,sections.js,RagAssistant.jsx}`
- Modify: `packages/core/src/build-admin.js`（Task 5 の仮実装を置き換え）
- Test: `packages/core/test/visible.test.js`, `packages/core/test/build-admin.test.js`

**Interfaces:**
- Consumes: `virtual:controlboard/config`、`@controlboard/core/config#settingsTopKeys, labelsFromSettings`、`@controlboard/core/puck#setRichTextRenderer, setImageRenderer`、`@controlboard/core/runtime/pages`、`runtime/news`、`runtime/jobs`
- Produces: `visible.js` の `visibleSections(sections, modules, perms) → Section[]`（`sections` の各要素に `module?: string` を持たせる）
- Produces: `SettingsForm.jsx` の `default SettingsForm({ groups, c, patch })`（`patch(topKey, value)` は compass の `patch` と同じ）
- Produces: `build-admin.js` の `buildAdmin({ configPath, outDir }) → Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/visible.test.js`:

```js
import { describe, it, expect } from "vitest";
import { visibleSections } from "../../admin/src/visible.js";
import { SECTIONS } from "../../admin/src/sections.js";

const all = { news: true, jobs: true, inquiries: true, links: true, stats: true, rag: true };
const keys = (s) => s.map((x) => x.key);

describe("visibleSections", () => {
  it("無効なモジュールの画面は出さない", () => {
    const s = visibleSections(SECTIONS, { ...all, jobs: false, links: false }, ["content", "inquiries", "history", "users"]);
    expect(keys(s)).not.toContain("jobs");
    expect(keys(s)).not.toContain("links");
    expect(keys(s)).toContain("news");
  });
  it("権限のない画面は出さない", () => {
    expect(keys(visibleSections(SECTIONS, all, ["content"]))).toEqual(["dashboard", "news", "jobs", "site", "links", "password"]);
  });
  it("inquiries モジュールが無効なら権限があっても出さない", () => {
    expect(keys(visibleSections(SECTIONS, { ...all, inquiries: false }, ["inquiries"]))).not.toContain("inquiries");
  });
});
```

`packages/core/test/build-admin.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAdmin } from "../src/build-admin.js";

const playgroundConfig = fileURLToPath(new URL("../../../playground/controlboard.config.js", import.meta.url));

describe("buildAdmin", () => {
  it("playground の設定で管理画面をビルドでき、React は1つだけ入る", async () => {
    const out = await mkdtemp(join(tmpdir(), "cb-admin-"));
    await buildAdmin({ configPath: playgroundConfig, outDir: out });
    const html = await readFile(join(out, "index.html"), "utf8");
    expect(html).toContain('src="/admin/assets/');
    const js = (await readdir(join(out, "assets"))).filter((f) => f.endsWith(".js"));
    const code = (await Promise.all(js.map((f) => readFile(join(out, "assets", f), "utf8")))).join("\n");
    /* React の本体が2回入ると "Invalid hook call" になる。 */
    expect(code.split("react.transitional.element").length - 1).toBe(1);
    expect(code).not.toMatch(/コンパス|compass/i);
  }, 120000);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm vitest run packages/core/test/visible.test.js`
Expected: FAIL（`Cannot find module '../../admin/src/visible.js'`）

（`build-admin.test.js` は Task 8 の playground が必要。Task 8 の Step 6 で実行する。）

- [ ] **Step 3: 管理画面のパッケージを作り、compass からコピーする**

`packages/admin/package.json`:

```json
{
  "name": "@controlboard/admin",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "dependencies": {
    "@measured/puck": "^0.20.2",
    "@tiptap/extension-image": "^3.29.0",
    "@tiptap/extension-link": "^3.29.0",
    "@tiptap/extension-text-align": "^3.29.0",
    "@tiptap/extension-text-style": "^3.29.0",
    "@tiptap/extension-underline": "^3.29.0",
    "@tiptap/pm": "^3.29.0",
    "@tiptap/react": "^3.29.0",
    "@tiptap/starter-kit": "^3.29.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "recharts": "^3.10.1"
  }
}
```

```bash
mkdir -p packages/admin/src
cp $COMPASS/site/admin-src/index.html packages/admin/index.html
cp $COMPASS/site/admin-src/src/* packages/admin/src/
sed -i '' 's#"\.\./\.\./src/lib/page\.js"#"@controlboard/core/runtime/pages"#; s#"\.\./\.\./src/lib/news\.js"#"@controlboard/core/runtime/news"#; s#"\.\./\.\./src/lib/jobs\.js"#"@controlboard/core/runtime/jobs"#' packages/admin/src/*.jsx
grep -n '\.\./\.\./src' packages/admin/src/*
pnpm install
```

Expected: `grep` に残るのは `App.jsx` の `icons.js` と `SiteEditor.jsx` の `puck/config.jsx` だけ（次の Step で直す）。`index.html` の `<title>` を `管理画面` にし、compass の名前・ロゴ・favicon の行があれば削除する。

- [ ] **Step 4: 画面一覧をモジュール対応にする**

`packages/admin/src/sections.js` を次に置き換える:

```js
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
  { key: "password", label: "パスワード変更" },
];
```

`packages/admin/src/visible.js`:

```js
/* 権限とサイト設定の両方で、出してよい画面だけを残す。 */
export const visibleSections = (sections, modules, perms) =>
  sections.filter((s) => (!s.need || perms.includes(s.need)) && (!s.module || modules[s.module]));
```

`RagAssistant.jsx` が `SECTIONS` を使う箇所は `visibleSections(SECTIONS, config.modules, perms)` に置き換え、先頭に次を足す:

```js
import config from "virtual:controlboard/config";
import { visibleSections } from "./visible.js";
```

- [ ] **Step 5: 共通設定のフォームを設定から作る**

`packages/admin/src/SettingsForm.jsx`:

```jsx
import React, { useId } from "react";
import ImagePicker from "./ImagePicker.jsx";
import RichText from "./RichText.jsx";

/* config.settings の定義から共通設定タブのフォームを組み立てる。
   key は "contact.tel" のようにドットで区切り、先頭が保存単位（content のトップレベル）。 */

const getAt = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setAt(obj, path, val) {
  if (!path.length) return val;
  const [k, ...rest] = path;
  const base = obj && typeof obj === "object" ? obj : {};
  return Object.assign(Array.isArray(base) ? [] : {}, base, { [k]: setAt(base[k], rest, val) });
}

function Field({ f, value, onChange }) {
  const id = useId();
  const input = (() => {
    switch (f.type) {
      case "textarea":
        return <textarea id={id} rows={4} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
      case "richtext":
        return <RichText value={value || ""} onChange={onChange} />;
      case "color":
        return <input id={id} type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />;
      case "image":
        return <ImagePicker value={value || ""} onChange={onChange} />;
      case "url":
        return <input id={id} type="url" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
      case "group":
        return <Fields fields={f.fields} value={value || {}} onChange={onChange} />;
      case "list": {
        const items = Array.isArray(value) ? value : [];
        return (
          <div className="sf-list">
            {items.map((it, i) => (
              <div className="sf-item" key={i}>
                <Fields fields={f.fields} value={it || {}} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
                <button type="button" className="btn ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>削除</button>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => onChange(items.concat([{}]))}>＋ 追加</button>
          </div>
        );
      }
      default:
        return <input id={id} type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    }
  })();
  return (
    <div className="field">
      <label htmlFor={id}>{f.label}</label>
      {input}
      {f.hint ? <small className="hint">{f.hint}</small> : null}
    </div>
  );
}

/* list / group の中では key は相対パス（"url" など）。 */
function Fields({ fields, value, onChange }) {
  return fields.map((f) => {
    const path = f.key.split(".");
    return <Field key={f.key} f={f} value={getAt(value, path)} onChange={(v) => onChange(setAt(value, path, v))} />;
  });
}

export default function SettingsForm({ groups, c, patch }) {
  return groups.map((g) => (
    <div className="card" key={g.group}>
      <div className="card-h">{g.group}</div>
      {g.fields.map((f) => {
        const [top, ...rest] = f.key.split(".");
        return (
          <Field
            key={f.key}
            f={f}
            value={getAt(c[top], rest)}
            onChange={(v) => patch(top, setAt(c[top], rest, v))}
          />
        );
      })}
    </div>
  ));
}
```

`ImagePicker` と `RichText` の props 名が `value` / `onChange` でなければ、compass のその2ファイルの default export の引数名に合わせてこのファイルを直す（`grep -n "export default function" packages/admin/src/ImagePicker.jsx packages/admin/src/RichText.jsx`）。

- [ ] **Step 6: `App.jsx` を汎用化する**

1. import を直す:
   - `import { ICONS, ICON_KEYS, ICON_ALIASES, iconPaths } from "../../src/lib/icons.js";` を削除。
   - 次を足す:

```js
import config from "virtual:controlboard/config";
import { settingsTopKeys } from "@controlboard/core/config";
import SettingsForm from "./SettingsForm.jsx";
import { visibleSections } from "./visible.js";
```

2. compass 固有の設定画面を消す: `function SecBasic`、`function ColorRow`、`const THEME_FIELDS`、`function SecTheme`、`function IconPicker`、`const DEFAULT_SIDE_LINKS`、`const DEFAULT_SIDE_CARDS`、`function Rows`、`function SecSidebar`、`function SecLogo`、`function SecSns` の定義をそれぞれ丸ごと削除する（`App.jsx` 75〜283 行付近。`SecPassword` は残す）。
3. `SECTION_KEYS` の `settings` 行を `settings: settingsTopKeys(config.settings),` に置き換える。
4. `const sections = SECTIONS.filter((s) => !s.need || perms.includes(s.need));` を `const sections = visibleSections(SECTIONS, config.modules, perms);` に置き換える。
5. `settingsPanel={…}` を `settingsPanel={<SettingsForm groups={config.settings} c={c} patch={patch} />}` に置き換える。
6. ブランド表示 `<img className="acp-brand-logo" src="/assets/logo.png" alt="…" />` を次に置き換える:

```jsx
{config.site.logo
  ? <img className="acp-brand-logo" src={config.site.logo} alt={config.site.name} />
  : <b className="acp-brand-name">{config.site.name || "管理画面"}</b>}
```

7. マニュアルのリンク `<a className="acp-manual" href="/manual/" …>…</a>` 全体を `{config.site.manualUrl ? ( …元の要素、href={config.site.manualUrl} … ) : null}` で囲む。
8. `SecDashboard` の中の `inquiries` の表示を `config.modules.inquiries` が false のとき出さない（`{config.modules.inquiries ? <InquiryChart …/> : null}`）。
9. 確認: `grep -nE "ICON|Sec(Basic|Theme|Sidebar|Logo|Sns)|/assets/logo|コンパス" packages/admin/src/App.jsx` の出力が空。

- [ ] **Step 7: `SiteEditor.jsx` をサイトの Puck 設定につなぐ**

`import { homeConfig, subConfig, setRichTextRenderer, setImageRenderer } from "../../src/puck/config.jsx";` を次に置き換える:

```js
import config from "virtual:controlboard/config";
import { setRichTextRenderer, setImageRenderer } from "@controlboard/core/puck";
const { home: homeConfig, sub: subConfig } = config.blocks;
```

続けて `grep -nE "newsArticle|/assets/|コンパス|税" packages/admin/src/SiteEditor.jsx` を実行し、出た行を次の規則で直す:
- `id === "newsArticle"` / `id !== "newsArticle"` → `PAGES[id] && PAGES[id].fixed` / `!(PAGES[id] && PAGES[id].fixed)`（`PAGES` は import 済み）。
- `/assets/…` の既定画像 → `""`。
- 固有名を含むコメント・文言 → 固有名を外す。

`Links.jsx` と `Stats.jsx` も同じ `grep` を実行して同じ規則で直す。`Stats.jsx` の `legacyNewsSlug` は `runtime/news.js` にあるのでそのまま。

- [ ] **Step 8: 比較画面の項目名を設定から取る**

`packages/admin/src/preview.jsx` の `const JP_LABELS = { … };` を、サイト固有でない語だけ残した次の表に置き換える:

```js
const JP_LABELS = {
  news: "お知らせ", date: "日付", title: "タイトル", body: "本文", bodyHtml: "本文",
  jobs: "募集要項", recruit: "採用情報", items: "項目", text: "本文", url: "URL", image: "画像", imageSp: "画像（スマホ）",
  heading: "見出し", lead: "説明", name: "名前", hidden: "非表示にする", id: "ID",
  root: "ページ設定", content: "ブロック", props: "", type: "ブロック種別",
  pageOrder: "ページの並び順", pageTitles: "ページ名", customPages: "ページ", hiddenPages: "ページ",
};
```

`App.jsx` の `function App() {` の直前に次を足す（サイトの設定項目名を起動時に登録）:

```js
registerLabels(labelsFromSettings(config.settings));
```

import に `import { registerLabels } from "./preview.jsx";` と、`@controlboard/core/config` から `labelsFromSettings` を足す。

- [ ] **Step 9: `build-admin.js` を実装する**

`packages/core/src/build-admin.js` を置き換える:

```js
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { configPlugin } from "./vite-plugin.js";

const ADMIN_ROOT = fileURLToPath(new URL("../../admin/", import.meta.url));

/* 管理画面をサイトの Puck 設定ごとビルドする。React / Puck / core を1つに寄せないと、
   サイト側の node_modules の React と二重になり、フックが動かない。 */
export async function buildAdmin({ configPath, outDir }) {
  await build({
    configFile: false,
    root: ADMIN_ROOT,
    base: "/admin/",
    logLevel: "warn",
    plugins: [react(), configPlugin(configPath)],
    resolve: { dedupe: ["react", "react-dom", "@measured/puck", "@controlboard/core"] },
    build: { outDir, emptyOutDir: true, sourcemap: false },
  });
}
```

- [ ] **Step 10: 固有名が残っていないことを確認し、テストを実行する**

```bash
grep -rniE "コンパス|compass|高田馬場|税理士" packages/admin
pnpm vitest run packages/core/test/visible.test.js
```

Expected: `grep` の出力なし。テスト PASS。

- [ ] **Step 11: コミット**

```bash
git add -A && git commit -m "管理画面を移植し、設定項目・モジュール・ブロックをサイト設定から読むようにする"
```

---

### Task 8: playground（検証用サイト）

**Files:**
- Create: `playground/package.json`, `playground/astro.config.mjs`, `playground/controlboard.config.js`, `playground/wrangler.jsonc`, `playground/.dev.vars.example`
- Create: `playground/src/blocks.jsx`, `playground/src/layouts/Base.astro`, `playground/src/pages/index.astro`, `playground/src/pages/[slug].astro`, `playground/src/pages/contact.astro`
- Test: `packages/core/test/build-admin.test.js`（Task 7 で作成済み）、`playground` のビルド

**Interfaces:**
- Consumes: `@controlboard/core`（integration）、`@controlboard/core/puck`、`@controlboard/core/runtime/content#getContent`、`runtime/pages#getPage, pageDef, customPages`、`@controlboard/core/seo#seoFor, orgJsonLd`
- Produces: `sites` 側の最小の書き方の見本（Task 9 の `init` テンプレートの元）

- [ ] **Step 1: パッケージと設定を書く**

`playground/package.json`:

```json
{
  "name": "playground",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@astrojs/cloudflare": "^12.5.0",
    "@astrojs/react": "^6.0.1",
    "@controlboard/core": "workspace:*",
    "@measured/puck": "^0.20.2",
    "astro": "^5.7.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "wrangler": "^4.40.0"
  }
}
```

`playground/astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import controlboard from "@controlboard/core";

export default defineConfig({
  output: "server",
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [react(), controlboard()],
  server: { port: 4400 },
});
```

`playground/wrangler.jsonc`（ローカル専用。ID は wrangler のローカル実行でだけ使うダミー）:

```jsonc
{
  "name": "controlboard-playground",
  "pages_build_output_dir": "dist",
  "compatibility_date": "2025-06-01",
  "compatibility_flags": ["nodejs_compat"],
  "kv_namespaces": [{ "binding": "CMS", "id": "local-cms" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "local-media" }]
}
```

`playground/.dev.vars.example`:

```
# staging の確認をするときだけ .dev.vars にコピーして使う
# SITE_ENV=staging
# BASIC_USER=dev
# BASIC_PASS=dev-pass
```

- [ ] **Step 2: ブロックと設定を書く**

`playground/src/blocks.jsx`:

```jsx
import React from "react";
import { richField, imageField } from "@controlboard/core/puck";

const Hero = {
  label: "ヒーロー",
  fields: { title: { type: "text", label: "見出し" }, image: imageField("画像", "横長 1600px") },
  defaultProps: { title: "見出し", image: "" },
  render: ({ title, image }) => (
    <section className="pg-hero">
      {image ? <img src={image} alt="" /> : null}
      <h1>{title}</h1>
    </section>
  ),
};

const Text = {
  label: "文章",
  fields: { html: richField("本文") },
  defaultProps: { html: "<p>本文</p>" },
  render: ({ html }) => <div className="pg-text" dangerouslySetInnerHTML={{ __html: html }} />,
};

const components = { Hero, Text };
export const homeConfig = { components, categories: { basic: { title: "基本", components: ["Hero", "Text"] } } };
export const subConfig = homeConfig;
```

`playground/controlboard.config.js`:

```js
import { homeConfig, subConfig } from "./src/blocks.jsx";

export default {
  site: { name: "ControlBoard Playground", url: "http://localhost:4400", logo: "", manualUrl: "" },
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
    content: { contact: { tel: "03-0000-0000", address: "" }, theme: { primary: "#1f6feb" }, sns: { items: [] }, news: [], jobs: [] },
    pages: {
      home: { root: { props: {} }, content: [{ type: "Hero", props: { id: "hero-1", title: "ようこそ", image: "" } }] },
    },
  },
  seo: { pages: { home: { title: "ControlBoard Playground", desc: "動作確認用のサイト" } }, org: {} },
};
```

- [ ] **Step 3: ページとレイアウトを書く**

`playground/src/layouts/Base.astro`:

```astro
---
import { seoFor, orgJsonLd } from "@controlboard/core/seo";
const { pageId, content } = Astro.props;
const seo = seoFor(pageId, content, Astro.url);
const primary = (content.theme && content.theme.primary) || "#1f6feb";
---
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>{seo.title}</title>
    <meta name="description" content={seo.desc} />
    <link rel="canonical" href={seo.canonical} />
    <script type="application/ld+json" set:html={JSON.stringify(orgJsonLd(content))} />
    <style set:html={`:root{--primary:${primary}} body{font-family:sans-serif;margin:0} .pg-hero h1{color:var(--primary)}`} />
  </head>
  <body>
    <slot />
    <footer data-testid="tel">{content.contact && content.contact.tel}</footer>
  </body>
</html>
```

`playground/src/pages/index.astro`:

```astro
---
import { Render } from "@measured/puck";
import config from "virtual:controlboard/config";
import { getContent } from "@controlboard/core/runtime/content";
import { getPage } from "@controlboard/core/runtime/pages";
import Base from "../layouts/Base.astro";
const env = Astro.locals.runtime.env;
const content = await getContent(env, Astro.url);
const data = await getPage(env, "home", Astro.url, content);
---
<Base pageId="home" content={content}><Render config={config.blocks.home} data={data} /></Base>
```

`playground/src/pages/[slug].astro`:

```astro
---
import { Render } from "@measured/puck";
import config from "virtual:controlboard/config";
import { getContent } from "@controlboard/core/runtime/content";
import { getPage, PAGE_IDS, PAGES, idOfSlug, findCustom, isPageHidden } from "@controlboard/core/runtime/pages";
import Base from "../layouts/Base.astro";
const env = Astro.locals.runtime.env;
const content = await getContent(env, Astro.url);
const slug = Astro.params.slug;
const fixedId = PAGE_IDS.find((id) => id !== "home" && PAGES[id].url === "/" + slug);
const id = fixedId || (findCustom(content, slug) ? idOfSlug(slug) : null);
if (!id || isPageHidden(id, content)) return new Response("Not found", { status: 404 });
const data = await getPage(env, id, Astro.url, content);
---
<Base pageId={id} content={content}><Render config={config.blocks.sub} data={data} /></Base>
```

`playground/src/pages/contact.astro`（問い合わせフォームの見本。公開 API `/api/inquiry` に送る）:

```astro
---
import { getContent } from "@controlboard/core/runtime/content";
import Base from "../layouts/Base.astro";
const content = await getContent(Astro.locals.runtime.env, Astro.url);
---
<Base pageId="contact" content={content}>
  <form id="f">
    <input name="name" placeholder="お名前" required />
    <input name="email" type="email" placeholder="メール" required />
    <textarea name="message" required></textarea>
    <button>送信</button>
  </form>
  <p id="done" hidden>送信しました</p>
  <script>
    const f = document.getElementById("f");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      const res = await fetch("/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) document.getElementById("done").hidden = false;
    });
  </script>
</Base>
```

- [ ] **Step 4: ビルドする**

```bash
pnpm install
pnpm --filter playground build
ls playground/public/admin/index.html playground/dist/_worker.js
grep -c "/admin/\*" playground/dist/_headers
```

Expected: 2つのファイルがあり、`_headers` に `/admin/*` が1件。ビルドエラーが `virtual:controlboard/config` の解決失敗なら、`playground/node_modules/@controlboard/core` がワークスペースへのリンクになっているか確認する。

- [ ] **Step 5: ローカルで起動して公開ページを見る**

```bash
pnpm --filter playground dev &
sleep 8
curl -s http://localhost:4400/ | grep -o "<h1>[^<]*</h1>"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4400/api/stats
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4400/admin/
kill %1
```

Expected: `<h1>ようこそ</h1>`、`404`（stats はオフ）、`200`。

- [ ] **Step 6: 管理画面ビルドのテストを実行する**

Run: `pnpm vitest run packages/core/test/build-admin.test.js`
Expected: PASS（React の本体が1回だけ・固有名なし）

- [ ] **Step 7: コミット**

```bash
git add -A && git commit -m "検証用の playground サイトを追加"
```

---

### Task 9: CLI（init / create-owner / setup / deploy / rag-index）

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/src/index.js`, `packages/cli/src/commands.js`
- Create: `packages/cli/templates/{controlboard.config.js,astro.config.mjs,wrangler.jsonc,src/blocks.jsx,src/layouts/Base.astro,src/pages/index.astro,src/pages/[slug].astro,gitignore}`
- Create（コピー＋書き換え）: `packages/cli/src/rag-index.mjs`（compass の `scripts/build-rag-index.mjs`）
- Test: `packages/cli/test/cli.test.js`

**Interfaces:**
- Produces: `commands.js` の
  - `initSite(dir) → string[]`（書き出したファイルの相対パス。既存ファイルは上書きしない）
  - `ownerRecord({ user, password }) → Promise<{ items: User[] }>`（KV の `users` に入れる JSON）
  - `setupPlan({ name, staging }) → string[][]`（実行する wrangler コマンドの配列。`--dry-run` で表示だけ）
  - `deployPlan({ name, staging, branch }) → string[]`
- CLI: `controlboard init | create-owner --user <u> [--local|--remote] | setup --name <n> [--stg] [--dry-run] | deploy --name <n> [--stg] [--dry-run] | rag-index`

- [ ] **Step 1: 失敗するテストを書く**

`packages/cli/test/cli.test.js`:

```js
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite, ownerRecord, setupPlan, deployPlan } from "../src/commands.js";

describe("init", () => {
  it("雛形を書き出し、既存ファイルは上書きしない", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cb-init-"));
    await writeFile(join(dir, "astro.config.mjs"), "// mine");
    const written = await initSite(dir);
    expect(written).toContain("controlboard.config.js");
    expect(written).toContain("src/blocks.jsx");
    expect(written).not.toContain("astro.config.mjs");
    expect(await readFile(join(dir, "astro.config.mjs"), "utf8")).toBe("// mine");
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain("public/admin/");
  });
});

describe("create-owner", () => {
  it("PBKDF2 のハッシュを持つオーナーを1人作り、平文を残さない", async () => {
    const rec = await ownerRecord({ user: "me", password: "longpass-1" });
    expect(rec.items).toHaveLength(1);
    expect(rec.items[0]).toMatchObject({ user: "me", role: "owner", iterations: 100000, mustChange: true });
    expect(JSON.stringify(rec)).not.toContain("longpass-1");
  });
  it("8文字未満のパスワードは断る", async () => {
    await expect(ownerRecord({ user: "me", password: "short" })).rejects.toThrow(/8文字/);
  });
});

describe("setup / deploy", () => {
  it("setup は KV と R2 を作るコマンドを返す", () => {
    expect(setupPlan({ name: "acme", staging: false })).toEqual([
      ["wrangler", "kv", "namespace", "create", "acme-cms"],
      ["wrangler", "r2", "bucket", "create", "acme-media"],
    ]);
    expect(setupPlan({ name: "acme", staging: true })[0]).toEqual(["wrangler", "kv", "namespace", "create", "acme-cms-stg"]);
  });
  it("deploy は Pages プロジェクトとブランチを指定する", () => {
    expect(deployPlan({ name: "acme", staging: false, branch: "main" })).toEqual(
      ["wrangler", "pages", "deploy", "dist", "--project-name", "acme", "--branch", "main"]);
    expect(deployPlan({ name: "acme", staging: true, branch: "staging" })).toEqual(
      ["wrangler", "pages", "deploy", "dist", "--project-name", "acme-stg", "--branch", "staging"]);
  });
  it("deploy は main 以外のブランチから本番へ出さない", () => {
    expect(() => deployPlan({ name: "acme", staging: false, branch: "feature" })).toThrow(/main/);
  });
});
```

`packages/cli/package.json`:

```json
{
  "name": "controlboard",
  "version": "0.1.0",
  "type": "module",
  "bin": { "controlboard": "./src/index.js" },
  "dependencies": { "@controlboard/core": "workspace:*" },
  "devDependencies": { "vitest": "^3.2.4" }
}
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm install && pnpm vitest run packages/cli/test`
Expected: FAIL（`Cannot find module '../src/commands.js'`）

- [ ] **Step 3: 雛形を作る**

```bash
mkdir -p packages/cli/templates/src/layouts packages/cli/templates/src/pages
cp playground/src/blocks.jsx packages/cli/templates/src/blocks.jsx
cp playground/src/layouts/Base.astro packages/cli/templates/src/layouts/Base.astro
cp playground/src/pages/index.astro packages/cli/templates/src/pages/index.astro
cp "playground/src/pages/[slug].astro" "packages/cli/templates/src/pages/[slug].astro"
cp playground/astro.config.mjs packages/cli/templates/astro.config.mjs
cp playground/controlboard.config.js packages/cli/templates/controlboard.config.js
```

`packages/cli/templates/astro.config.mjs` の `server: { port: 4400 },` の行を削除。`packages/cli/templates/controlboard.config.js` の `site` を `{ name: "サイト名", url: "", logo: "", manualUrl: "" }`、`seo.pages.home` を `{ title: "サイト名", desc: "" }` にする。

`packages/cli/templates/wrangler.jsonc`:

```jsonc
{
  "name": "SITE_NAME",
  "pages_build_output_dir": "dist",
  "compatibility_date": "2025-06-01",
  "compatibility_flags": ["nodejs_compat"],
  // controlboard setup が作った ID に書き換える
  "kv_namespaces": [{ "binding": "CMS", "id": "REPLACE_WITH_KV_ID" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "SITE_NAME-media" }]
}
```

`packages/cli/templates/gitignore`（npm が `.gitignore` を落とすため、書き出し時に名前を変える）:

```
node_modules/
dist/
.wrangler/
.astro/
public/admin/
public/rag-admin/
.cfauth/
.dev.vars
```

- [ ] **Step 4: コマンドを書く**

`packages/cli/src/commands.js`:

```js
import { cp, readdir, stat, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setPassword } from "@controlboard/core/runtime/users";
import { randHex } from "@controlboard/core/runtime/api";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));
const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p))); else out.push(p);
  }
  return out;
}

/* 既にあるファイルは触らない。書き出したものだけを返す。 */
export async function initSite(dir) {
  const written = [];
  for (const src of await walk(TEMPLATES)) {
    let rel = relative(TEMPLATES, src);
    if (rel === "gitignore") rel = ".gitignore";
    const dest = join(dir, rel);
    if (await exists(dest)) continue;
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest);
    written.push(rel);
  }
  return written;
}

export async function ownerRecord({ user, password }) {
  if (!user) throw new Error("ユーザー名を指定してください");
  if (!password || password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  const u = { id: randHex(8), user, name: "", role: "owner", perms: null, mustChange: true, disabled: false, createdAt: new Date().toISOString() };
  await setPassword(u, password);
  return { items: [u] };
}

export function setupPlan({ name, staging }) {
  const s = staging ? "-stg" : "";
  return [
    ["wrangler", "kv", "namespace", "create", `${name}-cms${s}`],
    ["wrangler", "r2", "bucket", "create", `${name}-media${s}`],
  ];
}

export function deployPlan({ name, staging, branch }) {
  if (!staging && branch !== "main") throw new Error("本番へのデプロイは main ブランチからだけです（今は " + branch + "）");
  return ["wrangler", "pages", "deploy", "dist", "--project-name", staging ? `${name}-stg` : name, "--branch", branch];
}
```

`packages/cli/src/index.js`:

```js
#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite, ownerRecord, setupPlan, deployPlan } from "./commands.js";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes("--" + n);
const opt = (n) => { const i = rest.indexOf("--" + n); return i >= 0 ? rest[i + 1] : undefined; };

/* wrangler は .cfauth があればそのアカウントで動かす（cfauth の仕組みに合わせる）。 */
const run = (argv, dry) => {
  console.log("$ " + argv.join(" "));
  if (dry) return;
  const r = spawnSync("npx", argv, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};

async function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a;
}

if (cmd === "init") {
  const w = await initSite(process.cwd());
  console.log(w.length ? "作成: " + w.join(", ") : "作るファイルはありません");
} else if (cmd === "create-owner") {
  const user = opt("user");
  const password = await ask("パスワード（8文字以上）: ");
  const rec = await ownerRecord({ user, password });
  const file = join(await mkdtemp(join(tmpdir(), "cb-")), "users.json");
  await writeFile(file, JSON.stringify(rec));
  const where = flag("remote") ? "--remote" : "--local";
  if (where === "--remote" && (await ask("本番の KV に書き込みます。よろしいですか？ (yes/no): ")) !== "yes") process.exit(1);
  run(["wrangler", "kv", "key", "put", "users", "--path", file, "--binding", "CMS", where], false);
} else if (cmd === "setup") {
  for (const argv of setupPlan({ name: opt("name"), staging: flag("stg") })) run(argv, flag("dry-run"));
  console.log("表示された KV の id を wrangler.jsonc に書き込んでください");
} else if (cmd === "deploy") {
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"]).toString().trim();
  const argv = deployPlan({ name: opt("name"), staging: flag("stg"), branch });
  if (!flag("dry-run") && !flag("stg") && (await ask("本番にデプロイします。よろしいですか？ (yes/no): ")) !== "yes") process.exit(1);
  run(["astro", "build"], flag("dry-run"));
  run(argv, flag("dry-run"));
} else if (cmd === "rag-index") {
  await import("./rag-index.mjs");
} else {
  console.log("使い方: controlboard init | create-owner --user <名前> [--remote] | setup --name <名前> [--stg] [--dry-run] | deploy --name <名前> [--stg] [--dry-run] | rag-index");
  process.exit(cmd ? 1 : 0);
}
```

- [ ] **Step 5: RAG の索引作成を移す**

```bash
cp $COMPASS/site/scripts/build-rag-index.mjs packages/cli/src/rag-index.mjs
```

`packages/cli/src/rag-index.mjs` の先頭の import と定数を次に置き換える（サイトの作業フォルダ基準にする）:

```js
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { EMBED_MODEL } from "@controlboard/core/runtime/rag/config";
import { encodeLexicalIndex } from "@controlboard/core/runtime/rag/lexical";

const DOCS_DIR = join(process.cwd(), "rag-docs") + "/";
const OUT_DIR = join(process.cwd(), "public/rag-admin") + "/";
```

`grep -niE "コンパス|compass|CLOUDFLARE_ACCOUNT_ID *=|b7ce" packages/cli/src/rag-index.mjs` の結果を確認し、アカウント ID の直書きがあれば `process.env.CLOUDFLARE_ACCOUNT_ID` に置き換える。

- [ ] **Step 6: テストを実行する**

Run: `pnpm vitest run packages/cli/test`
Expected: PASS

さらに dry-run で表示だけ確認（何も作らない）:

```bash
node packages/cli/src/index.js setup --name demo --dry-run
node packages/cli/src/index.js deploy --name demo --stg --dry-run
```

Expected: `$ wrangler kv namespace create demo-cms` などのコマンドが表示されるだけで、wrangler は実行されない。

- [ ] **Step 7: コミット**

```bash
git add -A && git commit -m "CLI（init・create-owner・setup・deploy・rag-index）を追加"
```

---

### Task 10: 画面の通しテスト（Playwright）

**Files:**
- Create: `playground/playwright.config.js`, `playground/e2e/admin.spec.js`, `playground/e2e/seed.mjs`

**Interfaces:**
- Consumes: playground（Task 8）、CLI の `ownerRecord`（Task 9）

- [ ] **Step 1: ローカル KV にオーナーを入れる準備を書く**

`playground/e2e/seed.mjs`:

```js
/* E2E 用に、ローカル KV（.wrangler/state）へオーナーを1人入れる。実アカウントには触れない。 */
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ownerRecord } from "../../packages/cli/src/commands.js";

const rec = await ownerRecord({ user: "e2e", password: "e2e-pass-1" });
rec.items[0].mustChange = false;
const file = join(await mkdtemp(join(tmpdir(), "cb-e2e-")), "users.json");
await writeFile(file, JSON.stringify(rec));
execFileSync("npx", ["wrangler", "kv", "key", "put", "users", "--path", file, "--binding", "CMS", "--local"], { stdio: "inherit" });
```

`playground/playwright.config.js`:

```js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: { baseURL: "http://localhost:4400" },
  globalSetup: "./e2e/global-setup.mjs",
  webServer: { command: "pnpm dev", url: "http://localhost:4400", reuseExistingServer: true, timeout: 120000 },
});
```

`playground/e2e/global-setup.mjs`:

```js
import { execFileSync } from "node:child_process";
export default () => { execFileSync("node", ["e2e/seed.mjs"], { stdio: "inherit" }); };
```

- [ ] **Step 2: 通しテストを書く**

`playground/e2e/admin.spec.js`:

```js
import { test, expect } from "@playwright/test";

async function signIn(page) {
  await page.goto("/admin/");
  await page.getByLabel(/ID|ユーザー/).fill("e2e");
  await page.getByLabel("パスワード").fill("e2e-pass-1");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
}

test("オフにした機能はメニューに出ない", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "お知らせ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "アクセス統計" })).toHaveCount(0);
});

test("共通設定の電話番号を変えると公開ページに出る", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "サイト編集" }).click();
  await page.getByText("共通設定").first().click();
  const tel = "03-" + String(Date.now()).slice(-4) + "-0000";
  await page.getByLabel("電話番号").fill(tel);
  await page.getByRole("button", { name: /保存/ }).first().click();
  await expect(page.getByText(/保存しました/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("tel")).toHaveText(tel);
});

test("Puck で文章ブロックを足して公開すると、公開ページに出る", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "サイト編集" }).click();
  const marker = "e2e-" + Date.now();
  await page.getByText("文章", { exact: true }).first().dragTo(page.frameLocator("iframe").locator("body"));
  await page.getByLabel("本文").fill("<p>" + marker + "</p>");
  await page.getByRole("button", { name: /公開/ }).click();
  await page.goto("/");
  await expect(page.getByText(marker)).toBeVisible();
});
```

- [ ] **Step 3: 実行する**

```bash
cd playground && npx playwright install chromium && pnpm e2e
```

Expected: 3 件 PASS。セレクタが合わずに失敗したら、`npx playwright codegen http://localhost:4400/admin/` で実際の要素名を確認し、セレクタだけを直す（アプリ側の文言は変えない）。

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "管理画面の通しテストを追加"
```

---

### Task 11: 仕上げの確認

**Files:**
- Create: `README.md`

- [ ] **Step 1: 全テストと固有名の検査**

```bash
pnpm test
grep -rniE "コンパス|compass|高田馬場|税理士|b7ce|c1bf|ec01" packages/ playground/ --exclude-dir=node_modules --exclude-dir=dist
```

Expected: テストすべて PASS、`grep` 出力なし。

- [ ] **Step 2: compass-hp に変更がないことを確認**

```bash
git -C $COMPASS status --short
```

Expected: 作業開始前と同じ出力（`site/admin-src/src/App.jsx` など、もともとあった未コミットの変更だけ）。増えていたら、その変更を元に戻す前にユーザーへ報告する。

- [ ] **Step 3: README を書く**

`README.md`:

````markdown
# ControlBoard

Astro + Cloudflare Pages のサイトに管理画面を1行で組み込む。

## 使い方

```bash
pnpm add @controlboard/core@file:../ControlBoard/packages/core
npx controlboard init
```

`astro.config.mjs`:

```js
import controlboard from "@controlboard/core";
export default defineConfig({ output: "server", adapter: cloudflare(), integrations: [react(), controlboard()] });
```

サイトで書くのは `controlboard.config.js`・`src/blocks.jsx`・CSS だけ。

## コマンド

| コマンド | 内容 |
|---|---|
| `controlboard setup --name <名前> [--stg] [--dry-run]` | KV と R2 を作る |
| `controlboard create-owner --user <名前> [--remote]` | 最初のオーナーを作る（既定はローカル） |
| `controlboard deploy --name <名前> [--stg] [--dry-run]` | ビルドしてデプロイ（本番は main ブランチから・確認あり） |
| `controlboard rag-index` | `rag-docs/` からアシスタントの索引を作る |

## 環境変数

| 名前 | 用途 |
|---|---|
| `SITE_ENV=staging` | 試験用。Basic 認証と画像の置き場を切り替える |
| `BASIC_USER` / `BASIC_PASS` | staging の Basic 認証（未設定なら誰も入れない） |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_FROM_NAME` | 問い合わせの通知メール |
| `CF_ACCOUNT_ID` / `CF_ANALYTICS_TOKEN` / `CF_RUM_SITE_TAG` / `CLICKS_DATASET` | アクセス統計 |

## 開発

```bash
pnpm install
pnpm test
pnpm --filter playground dev   # http://localhost:4400/admin/
pnpm e2e
```
````

- [ ] **Step 4: コミット**

```bash
git add -A && git commit -m "README を追加"
```

---

## Self-Review

- **仕様の網羅:** 3 構成→Task 1/5/7/8、3.1 API→Task 3/4/5、3.2 認証→Task 1/3/5、3.3 管理画面→Task 7、4.1 キー→Task 2〜4（compass と同一）、4.2 config→Task 2、4.3 流れ→Task 3 のテスト、5 CLI→Task 9、6 エラー処理→Task 2/3/4/5、7 テスト→各 Task と Task 10、8 範囲外→Global Constraints と Task 11 Step 2。
- **名前の一貫性:** `configPlugin` / `VIRTUAL_ID`（Task 2）→ Task 5・7 で同名。`buildAdmin({ configPath, outDir })`（Task 5 で仮・Task 7 で実装・integration.test.js で同じ引数を検査）。`routes/media-file.js`（Task 4）→ `routes-table.js`（Task 5）。`visibleSections(sections, modules, perms)`（Task 7）。`ownerRecord` → Task 9・10。
````
