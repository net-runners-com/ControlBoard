import React, { useEffect, useState } from "react";

/* AI連携: MCP などから API を使うためのトークンの発行と取り消し。
   平文は発行した直後の一度しか見られない（サーバーはハッシュしか持たない）。 */

const api = async (path, opt) => {
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opt));
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, data };
};
const send = (method, body) => api("/api/tokens", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const day = (s) => (s ? s.slice(0, 10) : "—");

export default function Tokens({ toast }) {
  const [items, setItems] = useState(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { ok, data } = await api("/api/tokens");
    setItems(ok ? data.items : []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    const { ok, data } = await send("POST", { label });
    setBusy(false);
    if (!ok) return toast((data && data.message) || "発行できませんでした", true);
    setFresh(data.token);
    setLabel("");
    load();
  };

  const remove = async (t) => {
    if (!window.confirm(`「${t.label}」を取り消します。このトークンを使っている AI からは操作できなくなります。よろしいですか？`)) return;
    const { ok, data } = await send("DELETE", { id: t.id });
    if (!ok) return toast((data && data.message) || "取り消せませんでした", true);
    toast("取り消しました");
    load();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh); toast("コピーしました"); }
    catch (e) { toast("コピーできませんでした。手で選択してください", true); }
  };

  const cmd = `npx controlboard mcp --url ${location.origin}`;

  return (
    <React.Fragment>
      <p className="acp-lead">
        Claude などの AI から、この管理画面と同じ操作をするためのトークンです。トークンでできることは、発行した人の権限と同じです。
        漏れたときはすぐに取り消してください。
      </p>

      <div className="card">
        <div className="card-h">トークンを発行</div>
        <div className="fld">
          <label htmlFor="tk-label">用途（あとで見分けるための名前）</label>
          <input id="tk-label" name="token-label" type="text" value={label} placeholder="Claude（自分のPC）" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button className="acp-save" disabled={busy} onClick={create}>{busy ? "発行中…" : "発行する"}</button>
        {fresh ? (
          <div className="fld st-steps" style={{ marginTop: 16 }}>
            <label>発行したトークン（この画面を離れると二度と表示されません）</label>
            <code className="st-cmd">{fresh}</code>
            <button type="button" className="nw-edit" style={{ marginTop: 8 }} onClick={copy}>コピー</button>
            <div className="hint" style={{ marginTop: 12 }}>Claude Code なら次のように登録します。</div>
            <code className="st-cmd">{`claude mcp add controlboard -e CONTROLBOARD_TOKEN=${fresh} -- ${cmd}`}</code>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-h">発行済みのトークン</div>
        {!items ? <p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p> : null}
        {items && !items.length ? <p className="acp-lead" style={{ margin: 0 }}>まだありません。</p> : null}
        <div className="nw-list">
          {(items || []).map((t) => (
            <div className="nw-row" key={t.id}>
              <span className="nw-date">{day(t.createdAt)}</span>
              <div className="nw-main">
                <b>{t.label}</b>
                <small>{t.user || "（削除されたユーザー）"} ・ 最後に使った日 {day(t.lastUsedAt)}</small>
              </div>
              <span className="nw-acts">
                <button type="button" className="blk-del" onClick={() => remove(t)}>取り消す</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}
