import React, { useState } from "react";

/* Colour, size and alignment belong next to the text you are changing, so both
   toolbars (the field editor and the one that floats over the canvas) share
   these controls. They apply to the selection, not to the whole block. */

const SWATCHES = [
  { v: "", label: "既定" },
  { v: "#232a5c", label: "テーマ" },
  { v: "#cbb26a", label: "アクセント" },
  { v: "#1c2033", label: "黒" },
  { v: "#5a6072", label: "グレー" },
  { v: "#c0392b", label: "赤" },
  { v: "#2e7d52", label: "緑" },
  { v: "#ffffff", label: "白" },
];
const SIZES = ["", "12", "14", "16", "18", "20", "24", "28", "32", "40"];
const ALIGNS = [
  { v: "left", label: "左揃え", d: "M4 6h16M4 12h10M4 18h14" },
  { v: "center", label: "中央揃え", d: "M4 6h16M7 12h10M5 18h14" },
  { v: "right", label: "右揃え", d: "M4 6h16M10 12h10M6 18h14" },
];

function ColorMenu({ editor, dark }) {
  const dk = dark ? " tt-dark" : "";
  const [open, setOpen] = useState(false);
  const cur = (editor.getAttributes("textStyle") || {}).color || "";
  const set = (v) => {
    if (v) editor.chain().focus().setColor(v).run();
    else editor.chain().focus().unsetColor().run();
    setOpen(false);
  };
  return (
    <span className="tt-wrap">
      <button type="button" className={"tt-btn" + dk} title="文字色" aria-label="文字色"
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
        <span className="tt-a">A</span>
        <span className="tt-bar" style={{ background: cur || "currentColor" }} />
      </button>
      {open ? (
        <span className={"tt-pop" + (dark ? " dark" : "")}>
          {SWATCHES.map((s) => (
            <button key={s.v || "d"} type="button" className={"tt-sw" + (cur === s.v ? " on" : "")}
              title={s.label} aria-label={s.label}
              onMouseDown={(e) => e.preventDefault()} onClick={() => set(s.v)}
              style={s.v ? { background: s.v } : undefined}>{s.v ? "" : "×"}</button>
          ))}
          <label className="tt-any" title="自由に選ぶ">
            <input type="color" value={cur || "#232a5c"} onChange={(e) => set(e.target.value)} />
            他の色
          </label>
        </span>
      ) : null}
    </span>
  );
}

export default function TextTools({ editor, dark }) {
  if (!editor) return null;
  const dk = dark ? " tt-dark" : "";
  const size = (editor.getAttributes("textStyle") || {}).fontSize || "";
  const setSize = (v) => {
    if (v) editor.chain().focus().setFontSize(v + "px").run();
    else editor.chain().focus().unsetFontSize().run();
  };
  return (
    <React.Fragment>
      <ColorMenu editor={editor} dark={dark} />
      <select name="font-size" className={"tt-size" + dk} title="文字の大きさ" aria-label="文字の大きさ"
        value={String(size).replace("px", "")} onChange={(e) => setSize(e.target.value)}>
        {SIZES.map((s) => <option key={s || "d"} value={s}>{s ? s + "px" : "大きさ"}</option>)}
      </select>
      {ALIGNS.map((a) => (
        <button key={a.v} type="button" className={"tt-btn" + dk + (editor.isActive({ textAlign: a.v }) ? " on" : "")}
          title={a.label} aria-label={a.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().setTextAlign(a.v).run()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round"><path d={a.d} /></svg>
        </button>
      ))}
    </React.Fragment>
  );
}
