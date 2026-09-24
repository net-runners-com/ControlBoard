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
  it("defaults.pages は複製して返す", () => {
    defaultDataFor("home", {}).root.props.title = "x";
    expect(defaultDataFor("home", {}).root.props.title).toBe("ようこそ");
  });
});
