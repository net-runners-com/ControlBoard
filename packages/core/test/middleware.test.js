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
    const req = new Request("https://s.test/", { headers: { authorization: "Basic " + btoa("user:pass") } });
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
  it("links が無効なサイトでは転送しない（fixture は links=false）", async () => {
    const env = makeEnv();
    await env.CMS.put("links", JSON.stringify({ items: [{ code: "a7f3c9", url: "https://example.test/about" }] }));
    const res = await onRequest(mctx(env, "https://example.test/a7f3c9"), html(404));
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
