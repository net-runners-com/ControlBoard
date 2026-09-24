import React, { useEffect, useState } from "react";

/* ユーザー管理: list, add, edit role/permissions, reset password, disable,
   delete. The server is the authority — everything here just talks to it. */

const api = async (path, opt) => {
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opt));
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, data };
};
const send = (method, body) => api("/api/users", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

const BLANK = { user: "", name: "", role: "editor", password: "", perms: null, mustChange: true };

function PermChecks({ roles, perms, role, value, onChange }) {
  const fromRole = (roles.find((r) => r.key === role) || {}).perms || [];
  const custom = Array.isArray(value) && value.length ? value : null;
  const active = custom || fromRole;
  const toggle = (k) => {
    const base = custom || fromRole;
    const next = base.includes(k) ? base.filter((x) => x !== k) : base.concat([k]);
    onChange(next.length ? next : []);
  };
  return (
    <div className="fld">
      <label>できること</label>
      <div className="us-perms">
        {perms.map((p) => (
          <label className="us-chk" key={p.key}>
            <input name={"perm-" + p.key} type="checkbox" checked={active.includes(p.key)} onChange={() => toggle(p.key)} />
            <span>{p.label}</span>
          </label>
        ))}
      </div>
      <div className="hint">
        {custom
          ? <React.Fragment>個別に設定しています。<button type="button" className="us-link" onClick={() => onChange(null)}>役割の初期設定に戻す</button></React.Fragment>
          : "役割の初期設定です。チェックを変えると、この人だけの設定になります。"}
      </div>
    </div>
  );
}

function Editor({ item, roles, perms, isMe, onClose, onSaved, toast }) {
  const isNew = !item.id;
  const [f, setF] = useState(Object.assign({}, BLANK, item, { password: "" }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(Object.assign({}, f, { [k]: v }));

  const save = async () => {
    setBusy(true);
    const body = isNew
      ? { user: f.user, name: f.name, role: f.role, password: f.password, perms: f.perms, mustChange: f.mustChange }
      : { id: f.id, name: f.name, role: f.role, perms: f.perms, disabled: !!f.disabled };
    if (!isNew && f.password) { body.password = f.password; body.mustChange = f.mustChange; }
    const { ok, data } = await send(isNew ? "POST" : "PUT", body);
    setBusy(false);
    if (!ok) return toast((data && data.message) || "保存できませんでした", true);
    toast(isNew ? "ユーザーを追加しました" : "保存しました");
    onSaved();
  };

  return (
    <div className="card">
      <div className="card-h">
        <button type="button" className="nw-back" onClick={onClose}>← 一覧に戻る</button>
        <button className="acp-save hs-restore" disabled={busy} onClick={save}>{busy ? "保存中…" : "保存"}</button>
      </div>

      <div className="grid2">
        <div className="fld">
          <label htmlFor="us-id">ログインID</label>
          <input id="us-id" name="username" type="text" autoComplete="off" value={f.user} disabled={!isNew} onChange={(e) => set("user", e.target.value)} />
          <div className="hint">{isNew ? "英数字と - _ . @ が使えます（3〜40文字）" : "ログインIDは後から変更できません"}</div>
        </div>
        <div className="fld">
          <label htmlFor="us-name">表示名</label>
          <input id="us-name" name="display-name" type="text" value={f.name || ""} placeholder="テスト太郎" onChange={(e) => set("name", e.target.value)} />
        </div>
      </div>

      <div className="fld">
        <span className="fld-h">役割</span>
        <div className="st-range us-roles">
          {roles.map((r) => (
            <button key={r.key} className={f.role === r.key ? "on" : ""} onClick={() => setF(Object.assign({}, f, { role: r.key, perms: null }))}>{r.label}</button>
          ))}
        </div>
      </div>

      <PermChecks roles={roles} perms={perms} role={f.role} value={f.perms} onChange={(v) => set("perms", v)} />

      <div className="fld">
        <label htmlFor="us-pw">{isNew ? "はじめのパスワード（8文字以上）" : "パスワードを変える（空欄なら変更しません）"}</label>
        <input id="us-pw" name="new-password" type="password" value={f.password} autoComplete="new-password" onChange={(e) => set("password", e.target.value)} />
        <label className="us-chk" style={{ marginTop: 8 }}>
          <input name="must-change" type="checkbox" checked={f.mustChange !== false} onChange={(e) => set("mustChange", e.target.checked)} />
          <span>初回ログイン時にパスワードの変更を求める</span>
        </label>
      </div>

      {!isNew ? (
        <label className="us-chk">
          <input name="disabled" type="checkbox" checked={!!f.disabled} disabled={isMe} onChange={(e) => set("disabled", e.target.checked)} />
          <span>このユーザーを停止する（ログインできなくなります）{isMe ? "／自分自身は停止できません" : ""}</span>
        </label>
      ) : null}
    </div>
  );
}

export default function Users({ toast }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { ok, data: d } = await api("/api/users");
    setData(ok ? d : { items: [], roles: [], perms: [], error: true });
  };
  useEffect(() => { load(); }, []);

  const remove = async (u) => {
    if (!window.confirm(`「${u.user}」を削除します。よろしいですか？`)) return;
    const { ok, data: d } = await send("DELETE", { id: u.id });
    if (!ok) return toast((d && d.message) || "削除できませんでした", true);
    toast("削除しました");
    load();
  };

  if (!data) return <div className="card"><p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p></div>;
  if (data.error) return <div className="card"><p className="acp-lead" style={{ margin: 0 }}>ユーザー管理の権限がありません。</p></div>;

  const roleLabel = (k) => (data.roles.find((r) => r.key === k) || {}).label || k;
  const permLabel = (k) => (data.perms.find((p) => p.key === k) || {}).label || k;

  if (editing) {
    return (
      <Editor
        item={editing} roles={data.roles} perms={data.perms} isMe={editing.id === data.me}
        toast={toast} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <React.Fragment>
      <p className="acp-lead">
        この管理画面にログインできる人の一覧です。役割を選ぶと標準的な権限が入り、必要ならひとりずつ細かく変えられます。
      </p>
      <div className="card">
        <div className="card-h">
          ユーザー
          <button type="button" className="acp-save nw-new" onClick={() => setEditing(Object.assign({}, BLANK))}>＋ ユーザーを追加</button>
        </div>
        <div className="nw-list">
          {data.items.map((u) => (
            <div className={"nw-row" + (u.disabled ? " us-off" : "")} key={u.id}>
              <span className="nw-date">{roleLabel(u.role)}</span>
              <button type="button" className="nw-main" onClick={() => setEditing(u)}>
                <b>{u.user}{u.name ? "（" + u.name + "）" : ""}{u.id === data.me ? " ・ 自分" : ""}</b>
                <small>{u.disabled ? "停止中" : u.perms.map(permLabel).join(" / ")}</small>
              </button>
              <span className="nw-acts">
                <button type="button" className="nw-edit" onClick={() => setEditing(u)}>編集</button>
                {u.id === data.me ? null : <button type="button" className="blk-del" onClick={() => remove(u)}>削除</button>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}
