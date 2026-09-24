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
    const first = items.filter((v) => v.pageId === "about").sort((a, b) => a.seq - b.seq)[0];
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
