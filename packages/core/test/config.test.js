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
