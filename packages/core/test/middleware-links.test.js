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
