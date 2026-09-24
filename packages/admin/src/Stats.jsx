import React, { useEffect, useMemo, useRef, useState } from "react";
import { PAGES } from "../../src/lib/page.js";
import { newsSlug, legacyNewsSlug } from "../../src/lib/news.js";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

/* Access stats from Cloudflare Web Analytics (RUM) via the GraphQL API. */

const RANGES = [
  { key: "24h", label: "24時間" },
  { key: "7d", label: "7日間" },
  { key: "30d", label: "30日間" },
  { key: "90d", label: "90日間" },
];

const TABS = [
  { key: "topPages", label: "ページ", head: "パス" },
  { key: "referers", label: "流入元", head: "参照元" },
  { key: "links", label: "リンク", head: "配布先" },
  { key: "hosts", label: "ホスト", head: "ホスト名" },
  { key: "countries", label: "国", head: "国" },
  { key: "browsers", label: "ブラウザ", head: "ブラウザ" },
  { key: "systems", label: "OS", head: "OS" },
  { key: "devices", label: "デバイス", head: "種別" },
];
const EXTRA_TABS = ["countries", "browsers", "devices", "hosts", "systems"];

/* Cycled per link on the click-trend chart below. */
const LINK_COLORS = ["#232a5c", "#cbb26a", "#5b8a72", "#b5533c", "#5a6db3", "#8a5a8f", "#3f7ea6", "#a3763f"];

/* How many days of link clicks each period covers. The counters are kept by
   day, so the 24 hour view shows today. */
const LINK_DAYS = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

/* AI アシスタントの回答内リンクから来た流入元。refererHost の生ホスト名だけ
   だと何のツールか分からないので、分かる範囲で表示名を添える。 */
const REFERRER_NAMES = {
  "chatgpt.com": "ChatGPT",
  "perplexity.ai": "Perplexity",
  "www.perplexity.ai": "Perplexity",
  "claude.ai": "Claude",
  "copilot.microsoft.com": "Microsoft Copilot",
  "gemini.google.com": "Gemini",
};

const api = async (path) => {
  const r = await fetch(path, { credentials: "same-origin" });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, data };
};

const num = (n) => (n || 0).toLocaleString();
/* Chart axis labels have a fixed width — long names are cut rather than
   allowed to squeeze the plot. */
const cut = (s, n) => (String(s || "").length > n ? String(s).slice(0, n - 1) + "…" : String(s || ""));
const SCROLL_MARKS = [25, 50, 75, 100];
const ALL = "すべて";
const mmdd = (d) => (d || "").slice(5).replace("-", "/");
/* Hourly buckets come back as ISO timestamps; show them as local HH:00. */
const hhmm = (t) => {
  const d = new Date(t);
  return isNaN(d) ? String(t) : String(d.getHours()).padStart(2, "0") + ":00";
};

function Tile({ label, value, sub }) {
  return (
    <div className="stt">
      <span className="stt-k">{label}</span>
      <span className="stt-v">{value}</span>
      {sub ? <span className="stt-s">{sub}</span> : null}
    </div>
  );
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="stc-tip">
      <div className="stc-tip-d">{label}</div>
      {payload.map((p) => (
        <div className="stc-tip-r" key={p.dataKey}>
          <span className="dot" style={{ background: p.color }} />
          {p.name}<b>{num(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

/* A path on its own says nothing about which announcement was read, so the
   page names and announcement titles are put in front of it. */
function usePathNames() {
  const [map, setMap] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/content", { credentials: "same-origin" }).then((r) => r.json())
      .then((c) => {
        if (!alive) return;
        const m = {};
        /* The article template shares /news with the list page — first one wins
           so the list keeps its own name. */
        Object.keys(PAGES).forEach((id) => {
          const u = PAGES[id].url;
          if (u && !m[u]) m[u] = PAGES[id].label;
        });
        (c.news || []).forEach((n) => {
          const title = n.title || "お知らせ";
          m["/news/" + newsSlug(n)] = title;
          /* Traffic recorded before ids existed used the older address. */
          m["/news/" + legacyNewsSlug(n)] = title;
        });
        setMap(m);
      })
      .catch(() => setMap({}));
    return () => { alive = false; };
  }, []);
  return map;
}

/* Clicks on the links issued in リンク管理. These are counted by the site
   itself when someone follows one, so unlike the figures above they are not
   estimates — and a printed card, which carries no referrer, still shows up. */
function useLinkRows(range) {
  const [state, setState] = useState({ rows: null, denied: false });
  useEffect(() => {
    let alive = true;
    api("/api/links?days=" + (LINK_DAYS[range] || 30)).then(({ ok, status, data }) => {
      if (!alive) return;
      if (!ok) return setState({ rows: [], denied: status === 401 || status === 403 });
      const rows = (data.items || [])
        .map((l) => ({ code: l.code, label: "/" + l.code, name: l.label || l.code, views: l.views || 0, series: l.series || null }))
        .sort((a, b) => b.views - a.views);
      setState({ rows, denied: false });
    });
    return () => { alive = false; };
  }, [range]);
  return state;
}

/* 到達率のファネル。各段は clip-path の台形で、上辺が前段の幅・下辺が
   自段の幅。数字が主役なので、%は白抜きで台形の中に、名前と回数・前段比は
   右の列に固定して、段が細くなっても文字が潰れないようにしてある。 */
const FUNNEL_SHADES = ["#232a5c", "#3d4785", "#5a6db3", "#8c98d9"];
function FunnelBars({ rows }) {
  if (!rows || !rows.length) return <p className="acp-lead" style={{ margin: 0 }}>この期間のデータはまだありません。</p>;
  return (
    <div className="stfn">
      {rows.map((r, i) => {
        const top = i ? rows[i - 1].pct : 100;
        const bot = r.pct;
        const clip = "polygon(" + (100 - top) / 2 + "% 0, " + (100 + top) / 2 + "% 0, "
          + (100 + bot) / 2 + "% 100%, " + (100 - bot) / 2 + "% 100%)";
        const c = FUNNEL_SHADES[i % FUNNEL_SHADES.length];
        return (
          <div className="stfn-row" key={r.key}>
            <div className="stfn-shape">
              <span className="stfn-fill" style={{ clipPath: clip, background: "linear-gradient(180deg, " + c + ", " + c + "d9)" }} />
              <span className="stfn-pct">{r.pct}%</span>
            </div>
            <div className="stfn-info">
              <b>{r.key}</b>
              <span className="stfn-sub">
                {num(r.views)}回
                {r.drop != null ? <span className="stfn-drop">前段比 {r.drop}%</span> : null}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Bars({ rows, head, names, unit, variant }) {
  if (!rows || !rows.length) return <p className="acp-lead" style={{ margin: 0 }}>この期間のデータはまだありません。</p>;
  const max = Math.max(...rows.map((r) => r.views), 1);
  const total = rows.reduce((n, r) => n + r.views, 0);
  /* variant="stacked": 行の背景を塗る代わりに、ファネルと同じ「薄い受け皿＋
     濃い棒」を文字の下の段に敷く。スクロール到達率の一覧が上のファネルと
     同じ見た目になるように。 */
  const stacked = variant === "stacked";
  return (
    <div className="stb">
      <div className="stb-h"><span>{head}</span><span>{unit || "PV"}</span></div>
      {stacked ? rows.map((r) => (
        <div className="stb-row stacked" key={r.key || r.label}>
          <div className="stb-top">
            <span className="stb-lb" title={r.label}>
              {r.name
                ? <React.Fragment><b>{r.name}</b><small>{r.label}</small></React.Fragment>
                : r.label}
            </span>
            <span className="stb-n">{num(r.views)}<small>{total ? Math.round((r.views / total) * 100) + "%" : ""}</small></span>
          </div>
          <div className="stb-trk">
            <span className="stb-brfill" style={{ width: Math.max(2, (r.views / max) * 100) + "%" }} />
          </div>
        </div>
      )) : rows.map((r) => (
        <div className="stb-row" key={r.key || r.label}>
          <span className="stb-fill" style={{ width: Math.max(2, (r.views / max) * 100) + "%" }} />
          <span className="stb-lb" title={r.label}>
            {/* Rows that already know their own headline (clicks, scroll) carry
                it as `name`; the rest are looked up in the names map. */}
            {r.name
              ? <React.Fragment><b>{r.name}</b><small>{r.label}</small></React.Fragment>
              : names && names[r.label]
              ? <React.Fragment><b>{names[r.label]}</b><small>{r.label}</small></React.Fragment>
              : r.label.startsWith("/news/")
                ? <React.Fragment><b>(削除済み)</b><small>{r.label}</small></React.Fragment>
                : r.label}
          </span>
          <span className="stb-n">{num(r.views)}<small>{total ? Math.round((r.views / total) * 100) + "%" : ""}</small></span>
        </div>
      ))}
    </div>
  );
}

export default function Stats() {
  const [range, setRange] = useState("24h");
  const [tab, setTab] = useState("topPages");
  const [scrollPage, setScrollPage] = useState(ALL);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /* Each range is a separate round trip to Cloudflare, so a period already
     looked at is shown from memory straight away and refreshed behind it —
     switching back and forth no longer waits. */
  const cache = useRef({});
  const names = usePathNames();
  const links = useLinkRows(range);

  useEffect(() => {
    let alive = true;
    const hit = cache.current[range];
    if (hit) { setData(hit); setErr(null); setLoading(false); } else { setLoading(!cache.current.any); }
    setBusy(true);
    (async () => {
      const { ok, status, data: d } = await api("/api/stats?range=" + range);
      if (!alive) return;
      setLoading(false);
      setBusy(false);
      if (ok) { cache.current[range] = d; cache.current.any = true; setData(d); setErr(null); }
      else { setErr((d && d.detail) || ("HTTP " + status)); if (!hit) setData(d || null); }
    })();
    return () => { alive = false; };
  }, [range]);

  const chart = useMemo(
    () => (data && data.series
      ? data.series.map((d) => ({ d: data.hourly ? hhmm(d.date) : mmdd(d.date), pv: d.views, visits: d.visits }))
      : []),
    [data]
  );
  /* One line per link, day by day — a single-day window has nothing to
     trend, so it only builds once the range covers more than one day. */
  const linkTrend = useMemo(() => {
    if (tab !== "links" || (LINK_DAYS[range] || 30) <= 1) return [];
    const active = (links.rows || []).filter((r) => r.series && r.series.length);
    if (!active.length) return [];
    const len = active[0].series.length;
    const out = [];
    for (let i = 0; i < len; i++) {
      const point = { d: mmdd(active[0].series[i].date) };
      active.forEach((r) => { point[r.code] = (r.series[i] && r.series[i].views) || 0; });
      out.push(point);
    }
    return out;
  }, [tab, range, links.rows]);

  /* Only the busiest handful fit as chart labels; the full list stays in the
     bar rows underneath. */
  const clickChart = useMemo(
    () => ((data && data.clicks) || []).slice(0, 8).map((r) => ({ n: cut(r.name, 10), v: r.views })),
    [data]
  );

  /* Which pages have any scroll data — the funnel is read one page at a time,
     since two pages of different lengths do not compare. */
  const scrollPages = useMemo(() => {
    const out = [];
    ((data && data.scroll) || []).forEach((r) => { if (out.indexOf(r.name) < 0) out.push(r.name); });
    return out;
  }, [data]);

  /* A funnel of the four marks. The 25% band is the widest by construction —
     every reader who got to 50% passed 25% first — so it stands as the 100%
     against which the rest are read. */
  const scrollFunnel = useMemo(() => {
    const rows = ((data && data.scroll) || [])
      .filter((r) => scrollPage === ALL || r.name === scrollPage);
    const by = {};
    rows.forEach((r) => {
      const m = parseInt(r.label, 10);
      by[m] = (by[m] || 0) + r.views;
    });
    const top = by[25] || 0;
    if (!top) return [];
    /* 実数だけでは母数の違うページ同士を比べられないので、25%到達を100%と
       した相対値で並べる。前段比を添えるのは、どこで一番落ちたかを探すのに
       段どうしの差がいちばん効くため。 */
    const out = [];
    SCROLL_MARKS.forEach((m) => {
      const v = by[m] || 0;
      if (!v) return;
      const prev = out.length ? out[out.length - 1].views : null;
      out.push({
        key: m + "% まで",
        views: v,
        pct: Math.round((v / top) * 100),
        drop: prev ? Math.round(((v - prev) / prev) * 100) : null,
      });
    });
    return out;
  }, [data, scrollPage]);

  if (loading && !data) return <div className="card"><p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p></div>;

  if (data && data.configured === false) {
    return (
      <div className="card">
        <div className="card-h">アクセス統計（未設定）</div>
        <p className="acp-lead">
          Cloudflare Web Analytics を有効にすると、ここに期間ごとのアクセス数・人気ページ・流入元が表示されます。
        </p>
        <ol className="st-steps">
          <li>Cloudflare ダッシュボード →「マイプロフィール」→「APIトークン」で <code>アカウント / Account Analytics / Read</code> のトークンを発行</li>
          <li>リポジトリ直下で <code className="st-cmd">bash site/scripts/setup-analytics.sh &lt;APIトークン&gt;</code></li>
          <li>数分後からアクセスが記録され、この画面に表示されます</li>
        </ol>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card">
        <div className="card-h">アクセス統計</div>
        <p className="acp-lead">データの取得に失敗しました。</p>
        <p className="hint" style={{ wordBreak: "break-all" }}>{err}</p>
        <p className="hint">APIトークンの権限（Account Analytics / Read）と計測サイトの site tag をご確認ください。</p>
      </div>
    );
  }

  const t = data.totals || {};
  const unit = data.hourly ? "1時間平均" : "1日平均";
  const perDay = data.hourly
    ? Math.round(t.views / Math.max(1, data.series.length))
    : (data.days ? Math.round(t.views / data.days) : 0);
  const perVisit = t.visits ? (t.views / t.visits).toFixed(1) : "0";
  const isLinks = tab === "links";
  const rows = isLinks ? links.rows : (data[tab] || []);
  const tabDef = TABS.find((x) => x.key === tab);
  /* Both halves of the row come from the link itself: the name that was typed
     in 添付先, and the address it was given. */
  const linkNames = {};
  (links.rows || []).forEach((r) => { linkNames[r.label] = r.name; });

  return (
    <React.Fragment>
      <div className="card">
        <div className="card-h">
          アクセス概要
          <div className={"st-range" + (busy ? " busy" : "")}>
            {RANGES.map((r) => (
              <button key={r.key} className={range === r.key ? "on" : ""} onClick={() => setRange(r.key)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="st-tiles">
          <Tile label="ページビュー" value={num(t.views)} sub={unit + " " + num(perDay)} />
          <Tile label="訪問数" value={num(t.visits)} sub={"1訪問あたり " + perVisit + "ページ"} />
          <Tile label="期間" value={data.hourly ? "24時間" : data.days + "日"} sub={data.series.length + (data.hourly ? "時間分" : "日分") + "のデータ"} />
        </div>
        <div className="stc">
          {chart.length === 0 ? (
            <p className="acp-lead" style={{ margin: 0 }}>
              まだデータがありません。計測タグを入れた直後は、反映まで数分〜1時間ほどかかります。
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#e4e5ee" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={{ stroke: "#e4e5ee" }} minTickGap={18} />
                <YAxis tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                <Area type="monotone" dataKey="pv" name="ページビュー" stroke="#232a5c" strokeWidth={2} fill="#232a5c" fillOpacity={0.14} dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="visits" name="訪問数" stroke="#cbb26a" strokeWidth={2} fill="#cbb26a" fillOpacity={0.22} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Clicks and scroll depth are counted by the site itself, not estimated
          from sampled page views, so they keep their own cards rather than
          sitting among the 内訳 tabs — and they lead, being the figures the
          screen was extended for. */}
      <div className="card">
        <div className="card-h">クリック</div>
        {clickChart.length ? (
          <div className="stc" style={{ marginBottom: 18 }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={clickChart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#e4e5ee" vertical={false} />
                {/* Japanese labels do not fit upright under a column, so they
                    lean and the axis is given the height to hold them. */}
                <XAxis dataKey="n" tick={{ fontSize: 10, fill: "#5a6072" }} tickLine={false}
                  axisLine={{ stroke: "#e4e5ee" }} interval={0} angle={-35} textAnchor="end" height={86} />
                <YAxis tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f2f3f8" }} />
                <Bar dataKey="v" name="クリック" fill="#232a5c" radius={[3, 3, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <Bars rows={data.clicks} head="押された要素 ／ ページ" unit="クリック" />
        {data.eventsError ? (
          <p className="hint" style={{ marginTop: 12 }}>クリック計測を取得できませんでした: {data.eventsError}</p>
        ) : null}
      </div>

      <div className="card">
        <div className="card-h">
          スクロール到達率
          {/* Pages of different lengths do not compare, so the funnel is read
              one at a time. */}
          {scrollPages.length > 1 ? (
            <div className="st-range st-tabs">
              {[ALL].concat(scrollPages).map((p) => (
                <button key={p} className={scrollPage === p ? "on" : ""} onClick={() => setScrollPage(p)}>{p}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ marginBottom: 22 }}>
          <FunnelBars rows={scrollFunnel} />
        </div>
        <Bars rows={data.scroll} head="ページ ／ 到達率" unit="回" variant="stacked" />
        <p className="hint" style={{ marginTop: 12 }}>
          ページを開いた人が、どこまで読み進めたかの回数です。25%まで進んだ人を100%として、
          そこからどれだけ残ったかを示します。前段比が大きく落ちているところが、
          読むのをやめられている箇所です。画面に収まる短いページは記録しません。
        </p>
      </div>

      <div className="card">
        <div className="card-h">
          内訳
          <div className="st-range st-tabs">
            {TABS.map((x) => (
              <button key={x.key} className={tab === x.key ? "on" : ""} onClick={() => setTab(x.key)}>{x.label}</button>
            ))}
          </div>
        </div>
        {isLinks && rows === null ? (
          <p className="acp-lead" style={{ margin: 0 }}>読み込み中…</p>
        ) : isLinks && links.denied ? (
          <p className="acp-lead" style={{ margin: 0 }}>リンクのクリック数を見る権限がありません。</p>
        ) : (
          <React.Fragment>
            {isLinks && linkTrend.length ? (
              <div className="stc" style={{ marginBottom: 18 }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={linkTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#e4e5ee" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={{ stroke: "#e4e5ee" }} minTickGap={18} />
                    <YAxis tick={{ fontSize: 11, fill: "#5a6072" }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                    {links.rows.filter((r) => r.views > 0).map((r, i) => (
                      <Line key={r.code} type="monotone" dataKey={r.code} name={r.name}
                        stroke={LINK_COLORS[i % LINK_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            <Bars rows={rows} head={tabDef.head} unit={isLinks ? "クリック" : "PV"}
              names={isLinks ? linkNames : (tab === "topPages" ? names : (tab === "referers" ? REFERRER_NAMES : null))} />
          </React.Fragment>
        )}
        {data.breakdownError && EXTRA_TABS.includes(tab) ? (
          <p className="hint" style={{ marginTop: 12 }}>この内訳は取得できませんでした: {data.breakdownError}</p>
        ) : null}
      </div>
    </React.Fragment>
  );
}
