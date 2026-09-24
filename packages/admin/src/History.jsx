import React, { useEffect, useState } from "react";
import { deepDiff, ChangeList, ValueList, normalizeDoc } from "./preview.jsx";

/* 変更履歴: every save is snapshotted server-side, so this lists them and can
   put one back. The detail pane diffs the snapshot against what is live now,
   which is the question you actually have here — "what changes if I go back?" */

const api = async (path, opt) => {
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opt));
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, data };
};

const KIND_LABELS = { content: "設定・お知らせ", page: "ページ" };

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Both sides have to be shaped the same way or the diff is all noise. */
async function liveState(meta) {
  if (meta.kind === "page") {
    const { data } = await api("/api/page?id=" + encodeURIComponent(meta.pageId));
    return normalizeDoc(data && data.data);
  }
  const { data } = await api("/api/content");
  return data || {};
}

function Detail({ meta, prevMeta, onClose, onRestored, toast }) {
  const [diffs, setDiffs] = useState(null);
  const [snap, setSnap] = useState(null);
  const [sameAsLive, setSameAsLive] = useState(false);
  const [view, setView] = useState("diff");
  const [busy, setBusy] = useState(false);

  /* The question a history answers is "what did this save change?", so the
     comparison is against the save before it — not against what is live. */
  useEffect(() => {
    let alive = true;
    (async () => {
      const shape = (d) => (meta.kind === "page" ? normalizeDoc(d) : d || {});
      const [{ ok, data: v }, prev, live] = await Promise.all([
        api("/api/versions?seq=" + meta.seq),
        prevMeta ? api("/api/versions?seq=" + prevMeta.seq).then((r) => r.data) : null,
        liveState(meta),
      ]);
      if (!alive) return;
      if (!ok) return setDiffs([]);
      const s = shape(v.data);
      setSnap(s);
      setDiffs(prev ? deepDiff(shape(prev.data), s, [], []) : []);
      setSameAsLive(JSON.stringify(live) === JSON.stringify(s));
    })();
    return () => { alive = false; };
  }, [meta.seq]);

  const restore = async () => {
    if (!window.confirm("この版に戻します。現在の内容も履歴に残るので、あとから戻せます。よろしいですか？")) return;
    setBusy(true);
    const { ok } = await api("/api/versions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ seq: meta.seq }),
    });
    setBusy(false);
    if (!ok) return toast("復元できませんでした。", true);
    toast("この版に戻しました");
    onRestored();
  };

  return (
    <div className="card">
      <div className="card-h">
        <button type="button" className="nw-back" onClick={onClose}>← 履歴に戻る</button>
        <div className="st-range">
          <button className={view === "diff" ? "on" : ""} onClick={() => setView("diff")}>
            前回からの変更{diffs && diffs.length ? "（" + diffs.length + "件）" : ""}
          </button>
          <button className={view === "full" ? "on" : ""} onClick={() => setView("full")}>この版の内容</button>
        </div>
        <button className="acp-save hs-restore" onClick={restore} disabled={busy || diffs === null || sameAsLive}>
          {busy ? "復元中…" : "この版に戻す"}
        </button>
      </div>
      <p className="acp-lead">
        {when(meta.at)}、{meta.label || KIND_LABELS[meta.kind]}を保存した記録です。
        {!prevMeta
          ? "これがこの項目の最初の記録です。"
          : "この保存で変わったのは次の点です。"}
        {sameAsLive
          ? "内容はいま公開されているものと同じなので、戻す必要はありません。"
          : "「この版に戻す」を押すと、全体がこの時点の状態になります。"}
      </p>
      {diffs === null ? <div className="dm-empty">読み込み中…</div>
        : view === "full" ? <ValueList data={snap} />
        : <ChangeList diffs={diffs} empty={prevMeta ? "この保存では中身は変わっていません。" : "最初の記録なので、比べる前の版がありません。「この版の内容」でご確認ください。"} />}
    </div>
  );
}

export default function History({ toast, onRestored }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);

  const load = async () => {
    const { ok, data } = await api("/api/versions");
    setItems(ok ? (data.items || []) : []);
  };
  useEffect(() => { load(); }, []);

  /* The previous save of the same thing — a page's history should not be
     compared against a settings save that happened in between. */
  const prevOf = (m) => {
    const list = items || [];
    const at = list.findIndex((x) => x.seq === m.seq);
    return list.slice(at + 1).find((x) => x.kind === m.kind && x.pageId === m.pageId) || null;
  };

  if (open) {
    return (
      <Detail
        meta={open} prevMeta={prevOf(open)} toast={toast}
        onClose={() => setOpen(null)}
        onRestored={() => { setOpen(null); load(); onRestored(); }}
      />
    );
  }

  return (
    <React.Fragment>
      <p className="acp-lead">
        保存するたびに、その時点の内容が記録されます。過去の版を選ぶと、いま公開されている内容との違いを確認したうえで戻せます（直近60件）。
      </p>
      <div className="card">
        <div className="card-h">変更履歴</div>
        {items === null ? (
          <p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="acp-lead" style={{ margin: 0 }}>まだ履歴がありません。どこかを保存すると、ここに残ります。</p>
        ) : (
          <div className="nw-list">
            {items.map((m, i) => (
              <div className="nw-row" key={m.seq}>
                <span className="nw-date">{when(m.at)}</span>
                <button type="button" className="nw-main" onClick={() => setOpen(m)}>
                  <b>{m.label || KIND_LABELS[m.kind]}</b>
                  <small>{KIND_LABELS[m.kind] || m.kind}{m.user ? " ・ " + m.user : ""}{i === 0 ? " ・ 現在の内容" : ""}</small>
                </button>
                <span className="nw-acts">
                  <button type="button" className="nw-edit" onClick={() => setOpen(m)}>内容を見る</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </React.Fragment>
  );
}
