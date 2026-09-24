import React, { useId } from "react";
import ImagePicker from "./ImagePicker.jsx";
import RichText from "./RichText.jsx";

/* config.settings の定義から共通設定タブのフォームを組み立てる。
   key は "contact.tel" のようにドットで区切り、先頭が保存単位（content のトップレベル）。
   list / group の中の key は、その要素からの相対パス。 */

const getAt = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setAt(obj, path, val) {
  if (!path.length) return val;
  const [k, ...rest] = path;
  const base = obj && typeof obj === "object" ? obj : {};
  return Object.assign(Array.isArray(base) ? [] : {}, base, { [k]: setAt(base[k], rest, val) });
}

function Field({ f, value, onChange }) {
  const id = useId();
  /* 画像とリッチテキストは部品が自分で見出しを出す。 */
  if (f.type === "image") return <ImagePicker value={value || ""} onChange={onChange} label={f.label} hint={f.hint} />;
  if (f.type === "richtext") return <RichText value={value || ""} onChange={onChange} label={f.label} />;

  let input;
  if (f.type === "textarea") {
    input = <textarea id={id} rows={4} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === "color") {
    input = <input id={id} type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === "url") {
    input = <input id={id} type="url" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === "group") {
    input = <div className="sf-group"><Fields fields={f.fields} value={value || {}} onChange={onChange} /></div>;
  } else if (f.type === "list") {
    const items = Array.isArray(value) ? value : [];
    input = (
      <div className="sf-list">
        {items.map((it, i) => (
          <div className="sf-item" key={i}>
            <Fields fields={f.fields} value={it || {}} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
            <button type="button" className="nw-edit" onClick={() => onChange(items.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" className="btn-add" onClick={() => onChange(items.concat([{}]))}>＋ 追加</button>
      </div>
    );
  } else {
    input = <input id={id} type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className="fld">
      <label htmlFor={id}>{f.label}</label>
      {input}
      {f.hint ? <div className="hint">{f.hint}</div> : null}
    </div>
  );
}

function Fields({ fields, value, onChange }) {
  return fields.map((f) => {
    const path = f.key.split(".");
    return <Field key={f.key} f={f} value={getAt(value, path)} onChange={(v) => onChange(setAt(value, path, v))} />;
  });
}

export default function SettingsForm({ groups, c, patch }) {
  return groups.map((g) => (
    <div className="card" key={g.group}>
      <div className="card-h">{g.group}</div>
      {g.fields.map((f) => {
        const [top, ...rest] = f.key.split(".");
        return (
          <Field
            key={f.key}
            f={f}
            value={getAt(c[top], rest)}
            onChange={(v) => patch(top, setAt(c[top], rest, v))}
          />
        );
      })}
    </div>
  ));
}
