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
