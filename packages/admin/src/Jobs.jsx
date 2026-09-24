import React, { useId, useState } from "react";
import { jobComplete, isHiring } from "@controlboard/core/runtime/jobs";

/* 募集要項管理: お知らせと同じ一覧→編集の作り。項目は名前も内容も自由に
   決められる（雇用形態・給与など、募集ごとに要るものが違うため）。 */

const excerpt = (j) => {
  const parts = (j.fields || []).filter((f) => f && f.label)
    .map((f) => f.label + ": " + String(f.value || "").replace(/\s*\n\s*/g, " "));
  const t = parts.join("　/　");
  return t.length > 70 ? t.slice(0, 70) + "…" : t;
};
const isPublished = (it) => !(it && it.draft);
/* Grows the box to fit what's typed instead of showing a scrollbar or a fixed
   block of empty space — most rows are one line, a few need several. */
const autoGrow = (e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; };

function FieldRows({ items, onChange }) {
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const a = items.slice(); const t = a[i]; a[i] = a[j]; a[j] = t; onChange(a);
  };
  const upd = (i, k, v) => onChange(items.map((x, j) => (j === i ? Object.assign({}, x, { [k]: v }) : x)));
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  return (
    <div className="fld">
      <label>項目</label>
      {items.map((it, i) => (
        <div className="grid2 jb-field" key={i}>
          <textarea rows={1} className="jb-grow" value={it.label || ""} placeholder="項目名（例: 雇用形態）"
            onChange={(e) => upd(i, "label", e.target.value)} onInput={autoGrow} />
          <div className="jb-field-v">
            <textarea rows={1} className="jb-grow" value={it.value || ""} placeholder="内容（例: 正社員。複数行も入力できます）"
              onChange={(e) => upd(i, "value", e.target.value)} onInput={autoGrow} />
            <button type="button" className="blk-move" title="上へ" onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="blk-move" title="下へ" onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="blk-del" onClick={() => remove(i)}>削除</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-add" onClick={() => onChange(items.concat([{ label: "", value: "" }]))}>
        ＋ 項目を追加
      </button>
      {items.length === 0 ? <p className="hint" style={{ margin: "6px 0 0" }}>雇用形態・給与・勤務地など、この募集に必要な項目を自由に追加してください。</p> : null}
    </div>
  );
}

function Editor({ item, onChange, onBack }) {
  const [view, setView] = useState("edit");
  const id = useId();
  const set = (k, v) => onChange(Object.assign({}, item, { [k]: v }));
  const fields = item.fields || [];
  return (
    <div className="card">
      <div className="card-h">
        <button type="button" className="nw-back" onClick={onBack}>← 一覧に戻る</button>
        <div className="st-range">
          <button className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>編集</button>
          <button className={view === "prev" ? "on" : ""} onClick={() => setView("prev")}>プレビュー</button>
        </div>
      </div>
      <div className="fld">
        <label htmlFor={id}>タイトル<span className="req">必須</span></label>
        <input
          id={id} name="title" type="text" value={item.title || ""} required
          placeholder="例: 経理スタッフ　正社員"
          className={String(item.title || "").trim() ? "" : "is-empty"}
          onChange={(e) => set("title", e.target.value)}
        />
        {String(item.title || "").trim()
          ? null
          : <div className="hint err">タイトルを入れてください。空のままだと公開できません。</div>}
      </div>
      <label className="us-chk nw-pub">
        <input name="published" type="checkbox" checked={isPublished(item)} onChange={(e) => set("draft", !e.target.checked)} />
        <span>公開する（外すと下書きになり、採用情報ページには出ません）</span>
      </label>
      <label className="us-chk nw-pub">
        <input name="hiring" type="checkbox" checked={isHiring(item)} onChange={(e) => set("hiring", e.target.checked)} />
        <span>現在募集中（外すと「募集終了」の表示になります。掲載自体は続きます）</span>
      </label>
      {view === "edit" ? (
        <FieldRows items={fields} onChange={(v) => set("fields", v)} />
      ) : (
        <div className="fld">
          <label>採用情報ページでの見え方</label>
          <div className="card" style={{ background: "var(--page)" }}>
            <h3 style={{ color: "var(--brand)", borderLeft: "4px solid var(--accent)", paddingLeft: 14, marginBottom: 14 }}>
              {item.title || "（タイトル未入力）"}
              {isHiring(item) ? null : <span className="nw-draft" style={{ marginLeft: 10 }}>募集終了</span>}
            </h3>
            {fields.filter((f) => f && f.label).length ? (
              <table className="mk-table mk-table-req" style={{ width: "100%", fontSize: 14.5 }}>
                <tbody>
                  {fields.filter((f) => f && f.label).map((f, i) => (
                    <tr key={i}><th style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--line)", width: 150, whiteSpace: "pre-line" }}>{f.label}</th>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", whiteSpace: "pre-line" }}>{f.value}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="acp-lead" style={{ margin: 0 }}>項目がまだありません。</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Jobs({ c, patch, onSave, isDirty, discard, saving }) {
  const items = c.jobs || [];
  const [editing, setEditing] = useState(null);
  const incomplete = (j) => !jobComplete(j);
  const blankCount = items.filter(incomplete).length;

  const recruit = c.recruit || {};
  const overallHiring = recruit.hiring !== false;
  const setOverallHiring = (v) => patch("recruit", Object.assign({}, recruit, { hiring: v }));

  const write = (next) => patch("jobs", next);
  const update = (i, v) => write(items.map((x, j) => (j === i ? v : x)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const a = items.slice();
    const t = a[i]; a[i] = a[j]; a[j] = t;
    write(a);
    if (editing === i) setEditing(j);
  };
  const remove = (i) => {
    if (!window.confirm("この募集要項を削除しますか？")) return;
    write(items.filter((_, j) => j !== i));
    setEditing(null);
  };
  const add = () => {
    write([{ title: "", fields: [] }].concat(items));
    setEditing(0);
  };

  return (
    <React.Fragment>
      <p className="acp-lead">
        ここで作成した募集要項は、公開すると採用情報ページに一覧表示されます。項目（雇用形態・給与・勤務地など）は募集ごとに自由に決められます。
        採用情報ページに一覧を表示するには、サイト編集で「募集要項一覧」ブロックを一度だけ配置してください。
      </p>

      {editing === null ? (
        <div className="card">
          <div className="card-h">採用活動（会社全体）</div>
          <label className="us-chk nw-pub" style={{ marginBottom: 0 }}>
            <input name="overall-hiring" type="checkbox" checked={overallHiring} onChange={(e) => setOverallHiring(e.target.checked)} />
            <span>現在、採用活動を行っている（外すと採用情報ページは「現在、採用活動を休止しております。」の表示のみになり、個々の募集要項は表示されません）</span>
          </label>
        </div>
      ) : null}

      {editing !== null && items[editing] ? (
        <Editor item={items[editing]} onChange={(v) => update(editing, v)} onBack={() => setEditing(null)} />
      ) : (
        <div className="card">
          <div className="card-h">
            募集要項一覧
            <button type="button" className="acp-save nw-new" onClick={add}>＋ 新規作成</button>
          </div>
          {items.length === 0 ? (
            <p className="acp-lead" style={{ margin: 0 }}>まだ募集要項がありません。「＋ 新規作成」から追加してください。</p>
          ) : (
            <div className="nw-list">
              {items.map((it, i) => (
                <div className="nw-row" key={it.id || i}>
                  <span className="nw-date">{it.fields && it.fields[0] ? String(it.fields[0].value || "").replace(/\s*\n\s*/g, " ") : ""}</span>
                  <button type="button" className="nw-main" onClick={() => setEditing(i)}>
                    <b>
                      {it.title || "（タイトルなし）"}
                      {isPublished(it) ? null : <span className="nw-draft">下書き</span>}
                      {isHiring(it) ? null : <span className="nw-draft">募集終了</span>}
                      {incomplete(it) ? <span className="nw-bad">未入力</span> : null}
                    </b>
                    <small>{excerpt(it) || "項目なし"}</small>
                  </button>
                  <span className="nw-acts">
                    <button type="button" className="blk-move" title="上へ" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="blk-move" title="下へ" onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="nw-edit" onClick={() => setEditing(i)}>編集</button>
                    <button type="button" className="blk-del" onClick={() => remove(i)}>削除</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="se-dataacts">
        <span className="nw-count">{items.length}件</span>
        {isDirty("jobs") ? <button className="acp-discard" onClick={() => discard("jobs")} disabled={saving}>元に戻す</button> : null}
        {blankCount ? (
          <span className="hint err nw-warn">
            {"タイトルが未入力の募集要項が " + blankCount + " 件あります。採用情報ページには表示されません。"}
          </span>
        ) : null}
        <button className="acp-save" onClick={() => onSave("jobs")} disabled={saving || !isDirty("jobs")}>
          {saving ? "保存中…" : "保存して公開"}
        </button>
      </div>
    </React.Fragment>
  );
}
