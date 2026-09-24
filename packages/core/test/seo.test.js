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
