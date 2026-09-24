import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Image fields everywhere in the admin. Nobody here should have to think about
   where a file lives, so the field shows the image and its name; the path it
   stores stays out of sight. Renaming only changes the label, never the URL a
   page points at. */

const api = async (path, opt) => {
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opt));
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, data };
};

export const srcOf = (v) => {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  return /^(https?:|\/)/.test(s) ? s : "/" + s;
};

const kb = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
const keyOf = (v) => {
  const m = srcOf(v).match(/^\/media\/(uploads\/.+)$/);
  return m ? m[1] : null;
};
const fileLabel = (v) => srcOf(v).split("/").pop().replace(/\.[^.]*$/, "") || "画像";

/* One shared list for every field on screen, refreshed when it changes. */
let mediaPromise = null;
const listeners = new Set();
function loadMedia(force) {
  if (force || !mediaPromise) {
    mediaPromise = api("/api/media").then(({ ok, data }) => (ok ? data.items || [] : []));
    if (force) mediaPromise.then(() => listeners.forEach((fn) => fn()));
  }
  return mediaPromise;
}
function useMediaName(value) {
  const key = keyOf(value);
  const [name, setName] = useState(null);
  useEffect(() => {
    let alive = true;
    const read = () => loadMedia().then((items) => {
      if (!alive) return;
      const hit = items.find((m) => m.key === key);
      setName(hit ? hit.name : null);
    });
    if (key) { read(); listeners.add(read); }
    else setName(null);
    return () => { alive = false; listeners.delete(read); };
  }, [key]);
  return [key, name != null ? name : (value ? fileLabel(value) : ""), setName];
}

export async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd, credentials: "same-origin" });
  let data = null; try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((data && data.message) || "アップロードに失敗しました。");
  await loadMedia(true);
  return data.url;
}

const rename = (key, name) => api("/api/media", {
  method: "PATCH", headers: { "content-type": "application/json" },
  body: JSON.stringify({ key, name }),
});

/* Name box used both in a field and under each thumbnail in the library. */
function NameInput({ value, onChange, onCommit, editable, className }) {
  if (!editable) return <div className={className + " is-fixed"} title={value}>{value}</div>;
  return (
    <input
      className={className} type="text" value={value} maxLength={80}
      placeholder="画像の名前" aria-label="画像の名前"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

export function Library({ onPick, onClose }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({});
  const file = useRef(null);

  const load = async (force) => setItems(await loadMedia(force !== false));
  useEffect(() => { load(); }, []);

  const add = async (f) => {
    if (!f) return;
    setBusy(true);
    try { const url = await uploadImage(f); await load(); onPick(url); }
    catch (e) { window.alert(e.message); }
    setBusy(false);
  };
  const del = async (key) => {
    if (!window.confirm("この画像を削除します。使用中のページからは表示されなくなります。よろしいですか？")) return;
    await api("/api/media", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    load();
  };
  const commit = async (m) => {
    const next = draft[m.key];
    if (next == null || next === m.name) return;
    await rename(m.key, next);
    load();
  };

  return createPortal(
    <div className="im-ov" onClick={onClose}>
      <div className="im-modal" onClick={(e) => e.stopPropagation()}>
        <div className="im-head">
          <b>画像ライブラリ</b>
          <button type="button" className="acp-save" disabled={busy} onClick={() => file.current.click()}>
            {busy ? "アップロード中…" : "＋ アップロード"}
          </button>
          <button type="button" className="im-x" onClick={onClose} aria-label="閉じる">×</button>
          <input ref={file} name="image-upload" aria-label="画像を選ぶ" type="file" accept="image/*" hidden onChange={(e) => { add(e.target.files[0]); e.target.value = ""; }} />
        </div>
        <div className="im-body">
          {items === null ? <p className="acp-lead">読み込み中…</p>
            : items.length === 0 ? <p className="acp-lead">まだ画像がありません。「＋ アップロード」から追加してください。</p>
            : (
              <React.Fragment>
                <p className="hint" style={{ marginBottom: 14 }}>名前は自由に書き換えられます。使っているページの表示は変わりません。</p>
                <div className="im-grid">
                  {items.map((m) => (
                    <div className="im-cell" key={m.key}>
                      <button type="button" className="im-pick" onClick={() => onPick(m.url)}>
                        <img src={m.url} alt={m.name} loading="lazy" />
                      </button>
                      <NameInput
                        className="im-cellname" editable
                        value={draft[m.key] != null ? draft[m.key] : m.name}
                        onChange={(v) => setDraft(Object.assign({}, draft, { [m.key]: v }))}
                        onCommit={() => commit(m)}
                      />
                      <div className="im-meta">
                        <span>{kb(m.size)}</span>
                        <button type="button" className="blk-del" onClick={() => del(m.key)}>削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              </React.Fragment>
            )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ImagePicker({ value, onChange, label, hint }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const file = useRef(null);
  const src = srcOf(value);
  const [key, name] = useMediaName(value);

  const add = async (f) => {
    if (!f) return;
    setBusy(true);
    try { setDraft(null); onChange(await uploadImage(f)); }
    catch (e) { window.alert(e.message); }
    setBusy(false);
  };
  const commit = async () => {
    if (draft == null || draft === name || !key) return setDraft(null);
    await rename(key, draft);
    setDraft(null);
    loadMedia(true);
  };

  return (
    <div className="im-field">
      {label ? <label className="im-label">{label}</label> : null}
      <div className="im-row">
        <div className="im-thumb">
          {src ? <img src={src} alt="" /> : <span>画像なし</span>}
        </div>
        <div className="im-acts">
          <button type="button" className="im-btn" disabled={busy} onClick={() => file.current.click()}>
            {busy ? "アップロード中…" : "アップロード"}
          </button>
          <button type="button" className="im-btn" onClick={() => setOpen(true)}>ライブラリから選ぶ</button>
          {src ? <button type="button" className="im-btn im-clear" onClick={() => onChange("")}>外す</button> : null}
          <input ref={file} name="image-upload" aria-label="画像を選ぶ" type="file" accept="image/*" hidden onChange={(e) => { add(e.target.files[0]); e.target.value = ""; }} />
        </div>
      </div>
      {src ? (
        <NameInput
          className="im-name" editable={!!key}
          value={draft != null ? draft : name}
          onChange={setDraft} onCommit={commit}
        />
      ) : null}
      {hint ? <div className="hint">{hint}</div> : null}
      {open ? <Library onClose={() => setOpen(false)} onPick={(u) => { setDraft(null); onChange(u); setOpen(false); }} /> : null}
    </div>
  );
}
