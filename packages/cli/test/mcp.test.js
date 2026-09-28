import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, readSse, TOKEN_HEADER } from "../src/mcp/client.js";
import { callTool, listTools } from "../src/mcp/server.js";

/* 送られた要求を控えて、決まった応答を返す fetch。 */
function fakeFetch(reply = () => ({ status: 200, body: { ok: true } })) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(url);
    const body = init.body instanceof FormData ? init.body : init.body ? JSON.parse(init.body) : undefined;
    const call = { method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, headers: init.headers };
    calls.push(call);
    const r = reply(call);
    if (r.text) return new Response(r.text, { status: r.status || 200 });
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };
  return { f, calls };
}
const client = (reply, extra) => {
  const { f, calls } = fakeFetch(reply);
  return { c: createClient({ url: "https://example.test/admin/", token: "cb_x", fetch: f, ...extra }), calls };
};
const run = async (name, args, reply) => {
  const { c, calls } = client(reply);
  const res = await callTool(c, name, args);
  return { res, call: calls[0], calls };
};

describe("MCP ツール", () => {
  it("名前が重ならず、すべてに説明と入力の形がある", () => {
    const tools = listTools();
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(5);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("消す操作には destructiveHint が付く", () => {
    const byName = Object.fromEntries(listTools().map((t) => [t.name, t]));
    for (const n of ["delete_page", "delete_media", "delete_link", "delete_inquiry", "delete_user", "restore_version", "replace_content"]) {
      expect(byName[n].annotations.destructiveHint).toBe(true);
    }
    expect(byName.get_content.annotations.readOnlyHint).toBe(true);
  });

  it("トークンは専用ヘッダーで、URL の住所だけを使う", async () => {
    const { call } = await run("whoami", {});
    expect(call.headers[TOKEN_HEADER]).toBe("cb_x");
    expect(call.headers.authorization).toBeUndefined();
    expect(call.path).toBe("/api/me");
  });

  it("staging の Basic 認証も一緒に送れる", async () => {
    const { c, calls } = client(undefined, { basic: "u:p" });
    await callTool(c, "whoami", {});
    expect(calls[0].headers.authorization).toBe("Basic " + Buffer.from("u:p").toString("base64"));
  });

  it.each([
    ["get_site_schema", {}, "GET", "/api/schema", undefined, {}],
    ["get_content", {}, "GET", "/api/content", undefined, {}],
    ["update_content", { patch: { news: [] } }, "PATCH", "/api/content", { news: [] }, {}],
    ["replace_content", { content: { a: 1 } }, "PUT", "/api/content", { a: 1 }, {}],
    ["get_page", {}, "GET", "/api/page", undefined, { id: "home" }],
    ["save_page", { id: "about", data: { root: {}, content: [] } }, "PUT", "/api/page", { root: {}, content: [] }, { id: "about" }],
    ["create_page", { title: "採用" }, "POST", "/api/pages", { title: "採用" }, {}],
    ["update_page_settings", { slug: "a", inNav: true }, "PUT", "/api/pages", { slug: "a", inNav: true }, {}],
    ["restore_page", { id: "about" }, "PUT", "/api/pages", { id: "about", restore: true }, {}],
    ["delete_page", { slug: "a" }, "DELETE", "/api/pages", { slug: "a" }, {}],
    ["list_versions", {}, "GET", "/api/versions", undefined, {}],
    ["get_version", { seq: 3 }, "GET", "/api/versions", undefined, { seq: "3" }],
    ["restore_version", { seq: 3 }, "POST", "/api/versions", { seq: 3 }, {}],
    ["list_media", {}, "GET", "/api/media", undefined, {}],
    ["rename_media", { key: "uploads/a.png", name: "a" }, "PATCH", "/api/media", { key: "uploads/a.png", name: "a" }, {}],
    ["delete_media", { key: "uploads/a.png" }, "DELETE", "/api/media", { key: "uploads/a.png" }, {}],
    ["list_links", { days: 7 }, "GET", "/api/links", undefined, { days: "7" }],
    ["create_link", { label: "チラシ", url: "https://x" }, "POST", "/api/links", { label: "チラシ", url: "https://x" }, {}],
    ["update_link", { code: "abc", disabled: true }, "PUT", "/api/links", { code: "abc", disabled: true }, {}],
    ["delete_link", { code: "abc" }, "DELETE", "/api/links", { code: "abc" }, {}],
    ["list_inquiries", {}, "GET", "/api/inquiries", undefined, {}],
    ["mark_inquiry", { key: "inq:1", read: true }, "PUT", "/api/inquiries", { key: "inq:1", read: true }, {}],
    ["delete_inquiry", { key: "inq:1" }, "DELETE", "/api/inquiries", { key: "inq:1" }, {}],
    ["get_stats", { range: "7d" }, "GET", "/api/stats", undefined, { range: "7d" }],
    ["list_users", {}, "GET", "/api/users", undefined, {}],
    ["create_user", { user: "ed", password: "12345678", role: "editor" }, "POST", "/api/users", { user: "ed", password: "12345678", role: "editor" }, {}],
    ["update_user", { id: "u1", disabled: true }, "PUT", "/api/users", { id: "u1", disabled: true }, {}],
    ["delete_user", { id: "u1" }, "DELETE", "/api/users", { id: "u1" }, {}],
  ])("%s → %s %s", async (name, args, method, path, body, query) => {
    const { res, call } = await run(name, args);
    expect(res.isError).toBeUndefined();
    expect(call.method).toBe(method);
    expect(call.path).toBe(path);
    expect(call.body).toEqual(body);
    expect(call.query).toEqual(query);
  });

  it("プレビューはトークン付きの URL を返す", async () => {
    const { res } = await run("create_preview", { content: {}, path: "/about" }, () => ({ status: 200, body: { ok: true, token: "t1", ttl: 900 } }));
    expect(JSON.parse(res.content[0].text).url).toBe("https://example.test/about?preview=t1");
  });

  it("手元の画像ファイルを multipart で送る", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cb-mcp-"));
    const file = join(dir, "logo.png");
    await writeFile(file, Buffer.from([1, 2, 3]));
    const { res, call } = await run("upload_media", { path: file });
    expect(res.isError).toBeUndefined();
    expect(call.path).toBe("/api/upload");
    const f = call.body.get("file");
    expect(f.name).toBe("logo.png");
    expect(f.type).toBe("image/png");
    expect(f.size).toBe(3);
  });

  it("画像の指定がなければエラーを返す", async () => {
    const { res, calls } = await run("upload_media", {});
    expect(res.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("サーバーの message をそのまま AI に返す", async () => {
    const { res } = await run("create_page", { title: "x" }, () => ({ status: 400, body: { error: "invalid", message: "その住所はすでに使われています。" } }));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("その住所はすでに使われています。");
  });

  it("404 にはモジュール無効の可能性を添える", async () => {
    const { res } = await run("list_links", {}, () => ({ status: 404, body: { error: "not_found" } }));
    expect(res.content[0].text).toMatch(/モジュール/);
  });

  it("知らないツールはエラー", async () => {
    const { res } = await run("nope", {});
    expect(res.isError).toBe(true);
  });

  it("マニュアルへの質問は SSE をまとめて返す", async () => {
    const sse = 'data: {"sources":[{"title":"画像"}]}\n\ndata: {"choices":[{"delta":{"content":"画像は"}}]}\n\ndata: {"response":"ここから"}\n\ndata: [DONE]\n\n';
    const { res, call } = await run("ask_manual", { question: "画像?" }, () => ({ text: sse }));
    expect(call.path).toBe("/api/admin/rag-ask");
    expect(JSON.parse(res.content[0].text)).toEqual({ answer: "画像はここから", sources: [{ title: "画像" }] });
  });

  it("URL とトークンがなければ始めない", () => {
    expect(() => createClient({ url: "", token: "x" })).toThrow(/URL/);
    expect(() => createClient({ url: "https://a", token: "" })).toThrow(/トークン/);
  });

  it("readSse は壊れた行を飛ばす", () => {
    expect(readSse("data: {oops\n\ndata: [DONE]\n").answer).toBe("");
  });
});
