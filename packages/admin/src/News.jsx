import React, { useEffect, useMemo, useState } from "react";
import RichText from "./RichText.jsx";
import { newsDateISO, newsComplete } from "@controlboard/core/runtime/news";

/* お知らせ管理: 一覧 → 1件を開いて編集、というかたちに。
   全件を縦に並べると件数が増えたときに探せなくなるため。 */

const escHtml = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* 旧データは段落の配列で保存されている。 */
const bodyToHtml = (body) => (body || []).filter((t) => String(t || "").trim()).map((t) => "<p>" + escHtml(t) + "</p>").join("");
const htmlOf = (it) => (it && it.bodyHtml != null ? it.bodyHtml : bodyToHtml(it && it.body));

/* 日付の読み取りはサイト側と同じものを使う。管理画面で「未入力」と出るものが
   サイトに出てしまう、という食い違いを防ぐため。 */
const toInputDate = newsDateISO;
const fromInputDate = (v) => String(v || "").replace(/-/g, ".");
const isPublished = (it) => !(it && it.draft);
const excerpt = (it) => {
  const t = htmlOf(it).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60) + "…" : t;
};

/* The list block decides how many lines of body the public page shows; the
   preview reads the same setting so both agree. */
function useClamp() {
  const [lines, setLines] = useState(5);
  useEffect(() => {
    let alive = true;
    fetch("/api/page?id=news", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const blk = ((d && d.data && d.data.content) || []).find((b) => b.type === "NewsList");
        const v = blk && blk.props ? Number(blk.props.clamp) : NaN;
        if (Number.isFinite(v)) setLines(v);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return lines;
}

/* 公開ページと同じCSSをiframeに読み込ませて、実際の見え方をそのまま出す。 */
function Preview({ item }) {
  const lines = useClamp();
  const srcDoc = useMemo(() => `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/site-preview.css">
<style>body{margin:0;background:#fff}.wrap{padding:24px}</style>
</head><body><div class="page J"><div class="wrap"><main class="mk-main"><section class="mk-block">
<h2 class="mk-h2">お知らせ一覧</h2>
<div class="mk-news-list"><article class="mk-news-item">
<div class="mk-news-meta"><time class="mk-news-date">${escHtml(item.date)}</time></div>
<div class="mk-news-main"><h3 class="mk-news-h">${escHtml(item.title)}</h3>
<div class="mk-news-body${lines > 0 ? " is-clamped" : ""}"${lines > 0 ? ` style="--news-clamp:${lines}"` : ""}>${htmlOf(item)}</div></div>
</article></div></section></main></div></div></body></html>`, [item, lines]);
  return (
    <React.Fragment>
      <iframe className="nw-prev" title="お知らせのプレビュー" srcDoc={srcDoc} />
      {lines > 0 ? (
        <div className="hint">公開ページでは本文が{lines}行までで切れます（行数は「サイト編集」のお知らせ一覧で変えられます）。</div>
      ) : null}
    </React.Fragment>
  );
}

function Editor({ item, onChange, onBack }) {
  const [view, setView] = useState("edit");
  const set = (k, v) => onChange(Object.assign({}, item, { [k]: v }));
  return (
    <div className="card">
      <div className="card-h">
        <button type="button" className="nw-back" onClick={onBack}>← 一覧に戻る</button>
        <div className="st-range">
          <button className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>編集</button>
          <button className={view === "prev" ? "on" : ""} onClick={() => setView("prev")}>プレビュー</button>
        </div>
      </div>
      <div className="grid2">
        <div className="fld">
          <label htmlFor="nw-date">日付<span className="req">必須</span></label>
          <input
            id="nw-date" name="date" type="date" required value={toInputDate(item.date)}
            className={toInputDate(item.date) ? "" : "is-empty"}
            onChange={(e) => set("date", fromInputDate(e.target.value))}
          />
          {toInputDate(item.date) ? null : <div className="hint err">日付を選んでください。</div>}
        </div>
        <div className="fld">
          <label htmlFor="nw-title">タイトル<span className="req">必須</span></label>
          <input
            id="nw-title" name="title" type="text" value={item.title || ""} required
            className={String(item.title || "").trim() ? "" : "is-empty"}
            onChange={(e) => set("title", e.target.value)}
          />
          {String(item.title || "").trim()
            ? null
            : <div className="hint err">タイトルを入れてください。空のままだと公開できません。</div>}
        </div>
      </div>
      <label className="us-chk nw-pub">
        <input name="published" type="checkbox" checked={isPublished(item)} onChange={(e) => set("draft", !e.target.checked)} />
        <span>公開する（外すと下書きになり、サイトには出ません）</span>
      </label>
      {view === "edit" ? (
        <div className="fld">
          <label>本文</label>
          <RichText value={htmlOf(item)} onChange={(v) => onChange(Object.assign({}, item, { bodyHtml: v, body: [] }))} />
        </div>
      ) : (
        <div className="fld">
          <label>公開ページでの見え方</label>
          <Preview item={item} />
        </div>
      )}
    </div>
  );
}

export default function News({ c, patch, onSave, isDirty, discard, saving }) {
  const items = c.news || [];
  const [editing, setEditing] = useState(null);
  /* 題名か日付のないお知らせは、一覧でも記事ページでも見分けがつかないので
     サイトには出さない。ここで保存そのものを止めてしまうと、そのお知らせを
     消すことすらできなくなるため、印を付けて知らせるだけにする。 */
  const incomplete = (n) => !newsComplete(n);
  const blankCount = items.filter(incomplete).length;

  const write = (next) => patch("news", next);
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
    if (!window.confirm("このお知らせを削除しますか？")) return;
    write(items.filter((_, j) => j !== i));
    setEditing(null);
  };
  const add = () => {
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const today = now.getFullYear() + "." + p(now.getMonth() + 1) + "." + p(now.getDate());
    write([{ date: today, title: "", bodyHtml: "" }].concat(items));
    setEditing(0);
  };

  return (
    <React.Fragment>
      <p className="acp-lead">
        ここで追加したお知らせは、トップページの一覧と「お知らせ」ページの両方に反映されます。上にあるものほど先に表示されます。
      </p>

      {editing !== null && items[editing] ? (
        <Editor item={items[editing]} onChange={(v) => update(editing, v)} onBack={() => setEditing(null)} />
      ) : (
        <div className="card">
          <div className="card-h">
            お知らせ一覧
            <button type="button" className="acp-save nw-new" onClick={add}>＋ 新規作成</button>
          </div>
          {items.length === 0 ? (
            <p className="acp-lead" style={{ margin: 0 }}>まだお知らせがありません。「＋ 新規作成」から追加してください。</p>
          ) : (
            <div className="nw-list">
              {items.map((it, i) => (
                <div className="nw-row" key={i}>
                  <span className="nw-date">{it.date || "日付未設定"}</span>
                  <button type="button" className="nw-main" onClick={() => setEditing(i)}>
                    <b>
                      {it.title || "（タイトルなし）"}
                      {isPublished(it) ? null : <span className="nw-draft">下書き</span>}
                      {incomplete(it) ? <span className="nw-bad">未入力</span> : null}
                    </b>
                    <small>{excerpt(it) || "本文なし"}</small>
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
        {isDirty("news") ? <button className="acp-discard" onClick={() => discard("news")} disabled={saving}>元に戻す</button> : null}
        {blankCount ? (
          <span className="hint err nw-warn">
            {"日付かタイトルが未入力のお知らせが " + blankCount + " 件あります。サイトには表示されません。"}
          </span>
        ) : null}
        <button className="acp-save" onClick={() => onSave("news")} disabled={saving || !isDirty("news")}>
          {saving ? "保存中…" : "保存して公開"}
        </button>
      </div>
    </React.Fragment>
  );
}
