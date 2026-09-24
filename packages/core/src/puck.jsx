import React from "react";

/* リッチテキストと画像の入力欄。編集部品（Tiptap・画像ライブラリ）は管理画面が
   起動時に差し込むので、公開サイトの bundle には入らない。 */
let richRenderer = null;
let imageRenderer = null;
export function setRichTextRenderer(fn) { richRenderer = fn; }
export function setImageRenderer(fn) { imageRenderer = fn; }

export const richField = (label) => ({
  type: "custom",
  label,
  rich: true,
  render: (props) => (richRenderer
    ? richRenderer(Object.assign({}, props, { label }))
    : <textarea className="rt-plain" rows={6} value={props.value || ""} onChange={(e) => props.onChange(e.target.value)} />),
});

export const imageField = (label, hint) => ({
  type: "custom",
  label,
  image: true,
  render: (props) => (imageRenderer
    ? imageRenderer(Object.assign({}, props, { label, hint }))
    : <input type="text" value={props.value || ""} onChange={(e) => props.onChange(e.target.value)} />),
});
