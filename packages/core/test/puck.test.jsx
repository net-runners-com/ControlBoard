import { describe, it, expect } from "vitest";
import React from "react";
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
