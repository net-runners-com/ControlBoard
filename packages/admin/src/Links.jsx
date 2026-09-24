import React, { useEffect, useId, useState } from "react";
import { PAGES, PAGE_IDS } from "../../src/lib/page.js";

/* リンク管理: 配布先ごとに短いアドレスを発行して、どこから来たか数える。
   LINE・Instagram・名刺など、あとから経路を分けたいものに1本ずつ配る。 */

const api = async (path, opt) => {
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opt));
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, data };
};
const send = (method, body) => api("/api/links", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

/* 選ぶだけでも、自由に打ってもよい候補。datalistなので、どちらもできる。 */
const WHERE = ["LINE", "Instagram", "Threads", "X（旧Twitter）", "Facebook", "YouTube", "名刺", "チラシ", "看板", "メール署名", "紹介"];
const NOTES = ["公式アカウントのプロフィール", "投稿に記載", "ストーリーズ", "名刺に印刷", "配布チラシ", "看板・のぼり", "メールの署名", "紹介用"];
/* サイトのページはそのまま候補にする。外部URLは自由入力で。 */
const DESTS = PAGE_IDS
  .filter((id) => id !== "newsArticle")
  .map((id) => ({ v: PAGES[id].url, label: PAGES[id].label }));

function Field({ label, list, options, value, onChange, placeholder, hint, required }) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}{required ? <span className="req">必須</span> : null}</label>
      <input id={id} name={id} type="text" list={list} value={value} placeholder={placeholder || ""} onChange={(e) => onChange(e.target.value)} />
      <datalist id={list}>
        {options.map((o) => <option key={o.v || o} value={o.v || o}>{o.label || undefined}</option>)}
      </datalist>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function Form({ onDone, toast }) {
  const [f, setF] = useState({ label: "", url: "", note: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(Object.assign({}, f, { [k]: v }));

  const save = async () => {
    setBusy(true);
    const { ok, data } = await send("POST", f);
    setBusy(false);
    if (!ok) return toast((data && data.message) || "作成できませんでした", true);
    toast("リンクを作成しました");
    setF({ label: "", url: "", note: "" });
    onDone();
  };

  return (
    <div className="card">
      <div className="card-h">リンクを作る</div>
      <div className="grid2">
        <Field
          label="添付先" list="ln-where" options={WHERE} required
          value={f.label} onChange={(v) => set("label", v)} placeholder="LINE"
          hint="一覧に出る名前です。選んでも、自由に打っても構いません"
        />
        <Field
          label="移動先" list="ln-dest" options={DESTS} required
          value={f.url} onChange={(v) => set("url", v)} placeholder="/contact"
          hint="サイト内のページを選ぶか、https:// から入れてください"
        />
      </div>
      <Field
        label="コメント" list="ln-note" options={NOTES}
        value={f.note} onChange={(v) => set("note", v)} placeholder="投稿に記載"
      />
      <p className="hint">アドレスは作成時に自動で決まります（例: /a7f3c9）。</p>
      <button className="acp-save" disabled={busy || !f.label.trim() || !f.url.trim()} onClick={save}>
        {busy ? "作成中…" : "作成する"}
      </button>
    </div>
  );
}

function Row({ item, onChange, toast }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(item);
  const [copied, setCopied] = useState(false);
  const short = location.origin + "/" + item.code;
  const h = item.hits || {};

  const copy = async () => {
    try { await navigator.clipboard.writeText(short); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch (e) { window.prompt("コピーしてお使いください", short); }
  };
  const save = async () => {
    const { ok, data } = await send("PUT", { code: item.code, url: f.url, label: f.label, note: f.note });
    if (!ok) return toast((data && data.message) || "保存できませんでした", true);
    setEdit(false); onChange();
  };
  const toggle = async () => { await send("PUT", { code: item.code, disabled: !item.disabled }); onChange(); };
  const remove = async () => {
    if (!window.confirm(`「${item.label || item.code}」を削除します。クリック数の記録も消えます。よろしいですか？`)) return;
    await send("DELETE", { code: item.code });
    onChange();
  };

  if (edit) {
    return (
      <div className="blk">
        <div className="blk-top"><b>{item.code}</b></div>
        <div className="grid2">
          <Field label="添付先" list={"ln-w-" + item.code} options={WHERE}
            value={f.label || ""} onChange={(v) => setF(Object.assign({}, f, { label: v }))} />
          <Field label="移動先" list={"ln-d-" + item.code} options={DESTS}
            value={f.url || ""} onChange={(v) => setF(Object.assign({}, f, { url: v }))} />
        </div>
        <Field label="コメント" list={"ln-n-" + item.code} options={NOTES}
          value={f.note || ""} onChange={(v) => setF(Object.assign({}, f, { note: v }))} />
        <div className="ln-acts">
          <button className="nw-edit" onClick={() => { setF(item); setEdit(false); }}>やめる</button>
          <button className="acp-save" onClick={save}>保存</button>
        </div>
      </div>
    );
  }

  return (
    <div className={"ln-row" + (item.disabled ? " off" : "")}>
      <div className="ln-main">
        <b>{item.label || item.code}{item.disabled ? <span className="nw-draft">停止中</span> : null}</b>
        <button type="button" className="ln-url" onClick={copy} title="クリックでコピー">
          {short}<span className="ln-copy">{copied ? "コピーしました" : "コピー"}</span>
        </button>
        <small>→ {item.url}{item.note ? "　/　" + item.note : ""}</small>
      </div>
      <div className="ln-nums">
        {[["合計", h.total], ["30日", h.month], ["7日", h.week], ["今日", h.today]].map(([k, v]) => (
          <span className="ln-num" key={k}><b>{v || 0}</b><small>{k}</small></span>
        ))}
      </div>
      <div className="ln-acts">
        <button className="nw-edit" onClick={() => { setF(item); setEdit(true); }}>編集</button>
        <button className="nw-edit" onClick={toggle}>{item.disabled ? "再開" : "停止"}</button>
        <button className="blk-del" onClick={remove}>削除</button>
      </div>
    </div>
  );
}

export default function Links({ toast }) {
  const [items, setItems] = useState(null);
  const load = async () => {
    const { ok, data } = await api("/api/links");
    setItems(ok ? data.items || [] : []);
  };
  useEffect(() => { load(); }, []);

  return (
    <React.Fragment>
      <p className="acp-lead">
        配布先ごとに短いアドレスを発行して、どこから来たかを数えます。
        LINEやInstagramの投稿、名刺やチラシに1本ずつ載せておくと、あとで比べられます。
      </p>
      <Form onDone={load} toast={toast} />
      <div className="card">
        <div className="card-h">発行したリンク</div>
        {items === null ? <p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p>
          : items.length === 0 ? <p className="acp-lead" style={{ margin: 0 }}>まだありません。上の欄から作成してください。</p>
          : <div className="ln-list">{items.map((l) => <Row key={l.code} item={l} onChange={load} toast={toast} />)}</div>}
      </div>
    </React.Fragment>
  );
}
