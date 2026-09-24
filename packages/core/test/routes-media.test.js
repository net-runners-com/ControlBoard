import { describe, it, expect } from "vitest";
import { makeEnv, ctx, seedUser, login } from "./helpers.js";
import * as uploadR from "../src/routes/upload.js";
import * as fileR from "../src/routes/media-file.js";
import * as inquiryR from "../src/routes/inquiry.js";
import * as inquiriesR from "../src/routes/inquiries.js";

/* Workers の Cache API。テストでは常に取り逃す。 */
globalThis.caches = { default: { match: async () => null, put: async () => {} } };

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
      body: { name: "山田", mail: "a@example.test", detail: "相談です" },
    }));
    expect(res.status).toBe(200);
    const { items } = await (await inquiriesR.GET(ctx(env, { cookie }))).json();
    expect(items[0].name).toBe("山田");
  });
  it("必須項目がなければ 400", async () => {
    const env = makeEnv();
    const res = await inquiryR.POST(ctx(env, { method: "POST", url: "https://example.test/api/inquiry", body: { name: "山田" } }));
    expect(res.status).toBe(400);
  });
});
