/* Admin CMS app — login + design-01 sidebar + section editors.
   Reads/writes /api/content; auth via /api/login,/me,/password; images via /api/upload. */
import React, { useState, useEffect, useId, useMemo, useRef } from "react";
import SiteEditor from "./SiteEditor.jsx";
import Stats, { ChartTooltip } from "./Stats.jsx";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import News from "./News.jsx";
import Jobs from "./Jobs.jsx";
import History from "./History.jsx";
import ImagePicker from "./ImagePicker.jsx";
import Users from "./Users.jsx";
import Tokens from "./Tokens.jsx";
import Links from "./Links.jsx";
import RagAssistant from "./RagAssistant.jsx";
import { SECTIONS } from "./sections.js";
import config from "virtual:controlboard/config";
import { settingsTopKeys, labelsFromSettings } from "@controlboard/core/config";
import SettingsForm from "./SettingsForm.jsx";
import { visibleSections } from "./visible.js";
import { registerLabels } from "./preview.jsx";
import "./admin.css";
import { BRAND } from "./theme.js";

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "same-origin", ...opts });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, data };
}

/* ---------------- generic field editors ---------------- */
/* 見出しと入力欄を id で結ぶ。結んでおくと、見出しを押しても入力欄に移り、
   読み上げでも何を入れる欄か分かる。パスワード管理ソフトの自動入力にも要る。 */
function TextField({ label, value, onChange, type = "text", hint, placeholder, name, autoComplete }) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name || id} type={type} value={value || ""} placeholder={placeholder || ""}
        autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
function Card({ title, children }) { return <div className="card"><div className="card-h">{title}</div>{children}</div>; }

/* nav icons (stroke-based, inherit currentColor) */
function NavIcon({ children }) {
  return (
    <svg className="acp-navic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const NAV_ICONS = {
  dashboard: <React.Fragment><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></React.Fragment>,
  basic: <React.Fragment><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" /></React.Fragment>,
  sns: <React.Fragment><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></React.Fragment>,
  hero: <React.Fragment><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></React.Fragment>,
  site: <React.Fragment><path d="M3 5.5h18v13H3z" /><path d="M3 9.5h18M7 13h6" /></React.Fragment>,
  intro: <React.Fragment><path d="M4 4h16M4 9h16M4 14h11M4 19h7" /></React.Fragment>,
  greeting: <React.Fragment><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></React.Fragment>,
  staff: <React.Fragment><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></React.Fragment>,
  services: <React.Fragment><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></React.Fragment>,
  news: <React.Fragment><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></React.Fragment>,
  jobs: <React.Fragment><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></React.Fragment>,
  company: <React.Fragment><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" /></React.Fragment>,
  privacy: <React.Fragment><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></React.Fragment>,
  password: <React.Fragment><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></React.Fragment>,
  inquiries: <React.Fragment><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" /></React.Fragment>,
  tokens: <React.Fragment><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L21 2M16 7l3 3M18.5 4.5l2 2" /></React.Fragment>,
  users: <React.Fragment><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11h-6" /></React.Fragment>,
  links: <React.Fragment><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></React.Fragment>,
  history: <React.Fragment><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7.5V12l3 2" /></React.Fragment>,
  stats: <React.Fragment><path d="M3 21h18M7 21V9m5 12V4m5 17v-8" /></React.Fragment>,
  reviews: <React.Fragment><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z" /></React.Fragment>,
  faq: <React.Fragment><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></React.Fragment>,
  manual: <React.Fragment><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v13.5" /><path d="M4 4.5v14A2.5 2.5 0 0 1 6.5 16H20v5H6.5A2.5 2.5 0 0 0 4 18.5" /><path d="M8 7.5h8M8 11h5" /></React.Fragment>,
};

/* ---------------- section editors ---------------- */
function set(obj, key, val) { return Object.assign({}, obj, { [key]: val }); }

function SecPassword({ toast }) {
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (n1.length < 8) return toast("新しいパスワードは8文字以上にしてください。", true);
    if (n1 !== n2) return toast("新しいパスワードが一致しません。", true);
    setBusy(true);
    const { ok, data } = await api("/api/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: cur, next: n1 }) });
    setBusy(false);
    if (ok) { toast("パスワードを変更しました"); setCur(""); setN1(""); setN2(""); }
    else toast((data && data.message) || "変更に失敗しました", true);
  };
  return (
    <Card title="パスワード変更">
      <TextField label="現在のパスワード" type="password" name="current-password" autoComplete="current-password" value={cur} onChange={setCur} />
      <div className="grid2">
        <TextField label="新しいパスワード（8文字以上）" type="password" name="new-password" autoComplete="new-password" value={n1} onChange={setN1} />
        <TextField label="新しいパスワード（確認）" type="password" name="confirm-password" autoComplete="new-password" value={n2} onChange={setN2} />
      </div>
      <button className="acp-save" disabled={busy} onClick={submit} style={{ marginTop: 8 }}>{busy ? "変更中…" : "パスワードを変更"}</button>
    </Card>
  );
}
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "." + p(d.getMonth() + 1) + "." + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function SecInquiries({ items, refresh, toast }) {
  const [openKey, setOpenKey] = useState(null);
  const [armDel, setArmDel] = useState(null);
  const [busy, setBusy] = useState(false);
  if (items === null) return <Card title="お問い合わせ"><p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p></Card>;
  const mark = async (key, read) => {
    setBusy(true);
    const { ok } = await api("/api/inquiries", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, read }) });
    setBusy(false);
    if (ok) { refresh(); } else toast("更新に失敗しました", true);
  };
  const del = async (key) => {
    if (armDel !== key) { setArmDel(key); return; }
    setBusy(true);
    const { ok } = await api("/api/inquiries", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    setBusy(false); setArmDel(null);
    if (ok) { toast("削除しました"); refresh(); } else toast("削除に失敗しました", true);
  };
  const unread = items.filter((i) => !i.read).length;
  return (
    <Card title={"お問い合わせ一覧（全 " + items.length + " 件" + (unread ? " / 未読 " + unread + " 件" : "") + "）"}>
      {items.length === 0 ? <p className="acp-lead" style={{ margin: 0 }}>お問い合わせはまだありません。サイトのお問合せフォームから送信されると、ここに表示されます。</p> : null}
      {items.map((it) => {
        const open = openKey === it.key;
        return (
          <div className={"inq" + (it.read ? "" : " unread")} key={it.key}>
            <button type="button" className="inq-head" onClick={() => { setOpenKey(open ? null : it.key); setArmDel(null); if (!open && !it.read) mark(it.key, true); }}>
              <span className="inq-dot" aria-hidden="true" />
              <span className="inq-name">{it.name}{it.company ? <small>（{it.company}）</small> : null}</span>
              <span className="inq-date">{fmtDate(it.at)}</span>
              <span className="inq-arrow">{open ? "▲" : "▼"}</span>
            </button>
            {open ? (
              <div className="inq-body">
                <dl className="inq-meta">
                  <div><dt>メール</dt><dd><a href={"mailto:" + it.mail}>{it.mail}</a></dd></div>
                  {it.tel ? <div><dt>電話</dt><dd><a href={"tel:" + it.tel.replace(/[^0-9+]/g, "")}>{it.tel}</a></dd></div> : null}
                  {it.address ? <div><dt>住所</dt><dd>{it.zip ? "〒" + it.zip + " " : ""}{it.address}</dd></div> : null}
                </dl>
                <p className="inq-detail">{it.detail}</p>
                <div className="inq-acts">
                  <button type="button" className="inq-btn" disabled={busy} onClick={() => mark(it.key, !it.read)}>{it.read ? "未読に戻す" : "既読にする"}</button>
                  <button type="button" className={"inq-btn del" + (armDel === it.key ? " arm" : "")} disabled={busy} onClick={() => del(it.key)}>
                    {armDel === it.key ? "もう一度押すと削除" : "削除"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </Card>
  );
}
/* 今日／昨日を分けて出す。日付の見出しがあると「今日は来ているか」が
   一目で分かる。 */
const dayKey = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const clock = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes());
};
function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const t = dayKey(now.toISOString());
  const y = new Date(now.getTime() - 86400000);
  if (dayKey(iso) === t) return "今日";
  if (dayKey(iso) === dayKey(y.toISOString())) return "昨日";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* 届いた件数の推移。リストは直近の数件しか出さないので、多い時期・止まって
   いる時期はここで見る。 */
const INQ_RANGES = [7, 30, 90];

function InquiryChart({ items }) {
  const [days, setDays] = useState(7);
  const rows = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const at = {};
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      at[dayKey(d.toISOString())] = i;
      out.push({ d: (d.getMonth() + 1) + "/" + d.getDate(), n: 0 });
    }
    (items || []).forEach((it) => {
      const i = at[dayKey(it.at)];
      if (i !== undefined) out[i].n += 1;
    });
    return out;
  }, [items, days]);

  const total = rows.reduce((n, r) => n + r.n, 0);

  return (
    <div className="db-chart">
      <div className="db-chart-h">
        <span>件数の推移</span>
        <div className="st-range">
          {INQ_RANGES.map((n) => (
            <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n}日間</button>
          ))}
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 10 }}>
        {"この" + days + "日間で " + total + " 件（1日あたり " + (total / days).toFixed(1) + " 件）"}
      </p>
      <div className="stc">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#e4e5ee" vertical={false} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={{ stroke: "#e4e5ee" }} minTickGap={18} />
            <YAxis tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip cursor={{ fill: "rgba(100,116,139,.08)" }} content={<ChartTooltip />} />
            <Bar dataKey="n" name="お問い合わせ" fill={BRAND} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SecDashboard({ c, inquiries, perms = [], onOpenInquiries }) {
  const items = inquiries || [];
  /* 直近の数件だけ。全部を出すとダッシュボードが問い合わせ一覧になって
     しまうので、残りは件数で示して一覧へ送る。 */
  const MAX = 5;
  const recent = items.slice(0, MAX);
  const rest = Math.max(0, items.length - MAX);
  const groups = [];
  recent.forEach((it) => {
    const k = dayKey(it.at);
    const last = groups[groups.length - 1];
    if (last && last.k === k) last.items.push(it);
    else groups.push({ k, label: dayLabel(it.at), items: [it] });
  });
  const todayCount = items.filter((i) => dayKey(i.at) === dayKey(new Date().toISOString())).length;
  const unread = items.filter((i) => !i.read).length;

  return (
    <React.Fragment>
      {perms.includes("inquiries") && config.modules.inquiries ? (
        <div className="card">
          <div className="card-h">
            {"お問い合わせ" + (todayCount ? `（今日 ${todayCount}件）` : "")}
            {items.length ? (
              <button type="button" className="db-more" onClick={onOpenInquiries}>
                {rest ? `ほか ${rest} 件を見る` : "一覧をひらく"}
              </button>
            ) : null}
          </div>
          {unread ? <p className="acp-lead" style={{ marginBottom: 14 }}>未読が {unread} 件あります。</p> : null}
          {items.length === 0 ? (
            <p className="acp-lead" style={{ margin: 0 }}>まだお問い合わせはありません。</p>
          ) : (
            <React.Fragment>
              <div className="db-list">
                {groups.map((g) => (
                  <React.Fragment key={g.k}>
                    <div className="db-day">{g.label}</div>
                    {g.items.map((it, i) => (
                      <button type="button" className={"db-row" + (it.read ? "" : " unread")} key={g.k + i} onClick={onOpenInquiries}>
                        <span className="db-time">{clock(it.at)}</span>
                        <span className="db-who">
                          <b>{it.name || "お名前なし"}</b>
                          <small>{it.detail || ""}</small>
                        </span>
                        {it.read ? null : <span className="db-new">未読</span>}
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
              <InquiryChart items={items} />
            </React.Fragment>
          )}
        </div>
      ) : null}
      {perms.includes("stats") && config.modules.stats ? <Stats /> : null}
    </React.Fragment>
  );
}

/* ---------------- login / password-change gates ---------------- */
function Login({ onDone }) {
  const [user, setUser] = useState("admin");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const { ok, data } = await api("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, password: pw }) });
    setBusy(false);
    if (ok) onDone(data); else setErr((data && data.message) || "ユーザー名またはパスワードが違います。");
  };
  return (
    <div className="lg-wrap">
      <form className="lg-card" onSubmit={submit}>
        <div className="lg-brand">{config.site.logo ? <img className="lg-logo" src={config.site.logo} alt={config.site.name} /> : <b className="lg-name">{config.site.name || "管理画面"}</b>}<small>管理画面</small></div>
        <div className="lg-h">管理画面ログイン</div>
        {err ? <div className="lg-err">{err}</div> : null}
        <div className="lg-field"><label htmlFor="lg-user">ユーザー名</label>
          <input id="lg-user" name="username" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" /></div>
        <div className="lg-field"><label htmlFor="lg-pw">パスワード</label>
          <input id="lg-pw" name="password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></div>
        <button className="lg-btn" disabled={busy}>{busy ? "ログイン中…" : "ログイン"}</button>
      </form>
    </div>
  );
}
function FirstChange({ onDone }) {
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (n1.length < 8) return setErr("新しいパスワードは8文字以上にしてください。");
    if (n1 !== n2) return setErr("新しいパスワードが一致しません。");
    setBusy(true);
    const { ok, data } = await api("/api/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: cur, next: n1 }) });
    setBusy(false);
    if (ok) onDone(); else setErr((data && data.message) || "変更に失敗しました。");
  };
  return (
    <div className="lg-wrap">
      <form className="lg-card" onSubmit={submit}>
        <div className="lg-brand">{config.site.logo ? <img className="lg-logo" src={config.site.logo} alt={config.site.name} /> : <b className="lg-name">{config.site.name || "管理画面"}</b>}<small>管理画面</small></div>
        <div className="lg-h">初回パスワード変更</div>
        <div className="lg-note" style={{ marginTop: 0, marginBottom: 14 }}>安全のため、仮パスワードを変更してください。</div>
        {err ? <div className="lg-err">{err}</div> : null}
        <div className="lg-field"><label htmlFor="ch-cur">仮パスワード（現在）</label>
          <input id="ch-cur" name="current-password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="lg-field"><label htmlFor="ch-n1">新しいパスワード</label>
          <input id="ch-n1" name="new-password" type="password" autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} /></div>
        <div className="lg-field"><label htmlFor="ch-n2">新しいパスワード（確認）</label>
          <input id="ch-n2" name="confirm-password" type="password" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} /></div>
        <button className="lg-btn" disabled={busy}>{busy ? "変更中…" : "変更して続ける"}</button>
      </form>
    </div>
  );
}


/* ---------------- main app ---------------- */
const ROLE_JP = { owner: "オーナー", admin: "管理者", editor: "編集者" };
const SECTION_KEYS = {
  settings: settingsTopKeys(config.settings),
  news: ["news"],
  jobs: ["jobs", "recruit"],
};
/* `need` is the permission a section requires; sections without one are always
   available. The server enforces the same rules — this only hides what the
   signed-in user cannot use. Defined in sections.js so RagAssistant.jsx can
   reuse the same labels/permissions for its "該当ページを開く" links. */

registerLabels(labelsFromSettings(config.settings));

function App() {
  const [phase, setPhase] = useState("loading");
  const [content, setContent] = useState(null);
  const [pristine, setPristine] = useState(null);
  const [inquiries, setInquiries] = useState(null);
  const [section, setSection] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [me, setMe] = useState(null);
  // 本番と試験用の取り違えを防ぐ帯。ログイン前から出したいので me とは別に持つ。
  const [siteEnv, setSiteEnv] = useState("");
  /* サイト編集はドラッグと横並びの操作が中心で、スマホでは実用にならない。
     入口を閉じて、大きい画面で開いてもらう。 */
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 760);
  useEffect(() => {
    const fit = () => setNarrow(window.innerWidth <= 760);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /* Who is signed in, and what they may do. Signing in through the form has to
     refresh this too — otherwise the app keeps the previous account's identity
     and an empty permission list, which hides most of the menu. */
  async function refreshMe() {
    const { data } = await api("/api/me");
    const account = data && data.authenticated ? data : null;
    setSiteEnv((data && data.env) || "");
    setMe(account);
    return account;
  }

  useEffect(() => { (async () => {
    const account = await refreshMe();
    if (account) {
      if (account.mustChange) setPhase("firstchange");
      else { await loadContent(); setPhase("app"); }
    } else setPhase("login");
  })(); }, []);

  async function enterApp() {
    await refreshMe();
    await loadContent();
    setPhase("app");
  }

  async function loadContent() {
    const [{ data }, inq] = await Promise.all([api("/api/content"), api("/api/inquiries")]);
    /* まだ保存していない項目は、サイト設定の既定値を出す（公開ページと同じ見え方）。 */
    const merged = Object.assign({}, config.defaults.content, data || {});
    setContent(merged);
    setPristine(JSON.parse(JSON.stringify(merged)));
    if (inq.ok) setInquiries((inq.data && inq.data.items) || []);
  }
  async function loadInquiries() { const { ok, data } = await api("/api/inquiries"); if (ok) setInquiries((data && data.items) || []); }
  function showToast(msg, err) { setToast({ msg, err }); setTimeout(() => setToast(null), 2600); }
  const patch = (key, val) => setContent((c) => Object.assign({}, c, { [key]: val }));
  /* ページの並び順は、動かした時点で保存する。ページを切り替える途中の
     操作なので、別に保存ボタンを押させると忘れられる。 */
  async function savePageOrder(pageOrder) {
    setContent((c) => Object.assign({}, c, { pageOrder }));
    setPristine((p) => Object.assign({}, p, { pageOrder: pageOrder.slice() }));
    const { ok } = await api("/api/content", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ pageOrder }),
    });
    if (!ok) showToast("並び順を保存できませんでした", true);
  }

  function isDirty(secKey) {
    const keys = SECTION_KEYS[secKey];
    if (!keys || !content || !pristine) return false;
    return keys.some((k) => JSON.stringify(content[k]) !== JSON.stringify(pristine[k]));
  }
  async function doSave(secKey) {
    const keys = SECTION_KEYS[secKey];
    if (!keys || !isDirty(secKey)) { showToast("変更はありません"); return; }
    setSaving(true);
    const partial = {};
    keys.forEach((k) => { partial[k] = content[k]; });
    // 編集中の項目だけ送信 → サーバー側で既存データにマージ
    const { ok, data } = await api("/api/content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(partial) });
    setSaving(false);
    if (ok) setPristine((p) => { const np = Object.assign({}, p); keys.forEach((k) => { np[k] = JSON.parse(JSON.stringify(content[k] === undefined ? null : content[k])); }); return np; });
    showToast(ok ? "保存しました。公開サイトに反映されます。" : ((data && data.message) || "保存に失敗しました"), !ok);
  }
  function discard(secKey) {
    const keys = SECTION_KEYS[secKey];
    if (!keys || !pristine) return;
    setContent((c) => { const nc = Object.assign({}, c); keys.forEach((k) => { nc[k] = JSON.parse(JSON.stringify(pristine[k] === undefined ? null : pristine[k])); }); return nc; });
    showToast("変更を破棄して元に戻しました");
  }
  async function logout() { await api("/api/logout", { method: "POST" }); location.reload(); }

  // どの画面にも同じ帯を出す（読み込み中・ログイン画面を含む）。
  const shell = (node) => (
    <React.Fragment>
      {siteEnv === "staging"
        ? <div className="acp-stgbar">試験用サイト — ここでの変更は本番のホームページには出ません</div>
        : null}
      {node}
    </React.Fragment>
  );

  if (phase === "loading") return shell(<div className="acp-loading"><span className="spin" />読み込み中…</div>);
  if (phase === "login") return shell(<Login onDone={(d) => { if (d.mustChange) setPhase("firstchange"); else enterApp(); }} />);
  if (phase === "firstchange") return shell(<FirstChange onDone={() => { enterApp(); showToast("パスワードを変更しました"); }} />);

  const c = content || {};
  const perms = (me && me.perms) || [];
  const sections = visibleSections(SECTIONS, config.modules, perms);
  const cur = sections.find((s) => s.key === section) || sections[0];
  const siteBlocked = narrow;
  const editors = {
    dashboard: <SecDashboard c={c} inquiries={inquiries} perms={perms} onOpenInquiries={() => setSection("inquiries")} />,
    inquiries: <SecInquiries items={inquiries} refresh={loadInquiries} toast={showToast} />,
    news: <News c={c} patch={patch} onSave={doSave} isDirty={isDirty} discard={discard} saving={saving} />,
    jobs: <Jobs c={c} patch={patch} onSave={doSave} isDirty={isDirty} discard={discard} saving={saving} />,
    site: siteBlocked ? (
      <Card title="サイト編集">
        <p className="acp-lead" style={{ margin: 0 }}>
          この画面はページを組み立てる作業のため、パソコンかタブレット（横幅760pxより広い画面）でお使いください。
          お知らせ・お問い合わせ・共通設定の各項目はスマホからでも編集できます。
        </p>
      </Card>
    ) : (
      <SiteEditor
        toast={showToast} content={c} onPageOrder={savePageOrder} onPageSaved={loadContent}
        settingsPanel={<SettingsForm groups={config.settings} c={c} patch={patch} />}
        onSaveKeys={doSave} isDirty={isDirty} discard={discard} saving={saving}
      />
    ),
    links: <Links toast={showToast} />,
    history: <History toast={showToast} onRestored={loadContent} />,
    users: <Users toast={showToast} />,
    tokens: <Tokens toast={showToast} />,
    password: <SecPassword toast={showToast} />,
  };

  return shell(
    <div className="acp">
      <div className={"acp-ov" + (navOpen ? " on" : "")} onClick={() => setNavOpen(false)} />
      <aside className={"acp-side" + (navOpen ? " open" : "")}>
        <div className="acp-brand">{config.site.logo ? <img className="acp-brand-logo" src={config.site.logo} alt={config.site.name} /> : <b className="acp-brand-name">{config.site.name || "管理画面"}</b>}<small>管理画面</small></div>
        <nav className="acp-nav">
          {sections.map((s, i) => (
            <React.Fragment key={s.key}>
            <button
              className={"acp-navit" + (section === s.key ? " on" : "") + (s.key === "site" && narrow ? " off" : "")}
              disabled={s.key === "site" && narrow}
              title={s.key === "site" && narrow ? "サイト編集はパソコンかタブレットでお使いください" : undefined}
              onClick={() => { setSection(s.key); setNavOpen(false); }}
            >
              <NavIcon>{NAV_ICONS[s.key]}</NavIcon>
              <span className="acp-navlb">{s.label}</span>
              {s.key === "site" && narrow ? <span className="acp-navnote">PC向け</span> : null}
              {isDirty(s.key) ? <span className="acp-dirty" title="未保存の変更あり" /> : null}
            </button>
            </React.Fragment>
          ))}
        </nav>
        {config.site.manualUrl ? (
        <a className="acp-manual" href={config.site.manualUrl} target="_blank" rel="noopener">
          <NavIcon>{NAV_ICONS.manual}</NavIcon>
          <span className="acp-navlb">使い方マニュアル</span>
          <span className="acp-manual-arw" aria-hidden="true">↗</span>
        </a>
        ) : null}
        <div className="acp-user">
          <span className="av">{String((me && (me.name || me.user)) || "").slice(0, 1).toUpperCase()}</span>
          <div><b title={me ? (me.name || me.user) : ""}>{me ? (me.name || me.user) : ""}</b><span>{(me && ROLE_JP[me.role]) || ""}</span></div>
          <button className="acp-logout" onClick={logout}>ログアウト</button>
        </div>
      </aside>

      <div className="acp-main">
        <header className="acp-top">
          <button className="acp-burger" onClick={() => setNavOpen(true)}>☰</button>
          <div><h1>{cur.label}</h1><div className="crumb">管理 / {cur.label}</div></div>
          <div className="acp-actions">
            <a className="acp-view" href="/" target="_blank" rel="noopener">サイトを見る ↗</a>
          </div>
        </header>
        {cur.key === "site"
          ? <div className="acp-full">{editors[cur.key]}</div>
          : <div className="acp-scroll">{editors[cur.key]}</div>}
      </div>

      {toast ? <div className={"toast show" + (toast.err ? " err" : "")}>{toast.msg}</div> : null}
      {config.modules.rag ? <RagAssistant perms={perms} onNavigate={setSection} /> : null}
    </div>
  );
}

export default App;
