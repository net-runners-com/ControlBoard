import React, { useState, useEffect, useRef } from "react";

/* ---------------- change tracking (before/after diff) ---------------- */
const JP_LABELS = {
  contact: "基本情報", tel: "電話番号（表示）", telLink: "電話リンク", address: "住所", access: "アクセス", email: "メールアドレス",
  sns: "SNS", facebook: "Facebook URL", line: "LINE URL", links: "リンク", hidden: "非表示にする",
  intro: "紹介文", heading: "見出し", reasons: "選ばれる理由", t: "小見出し", p: "説明",
  hero: "ヒーロー", catch: "キャッチコピー", sub: "肩書き（H1）", image: "メイン画像（PC）", imageSp: "メイン画像（スマホ）",
  greeting: "ごあいさつ", paragraphs: "本文", sign: "署名", photo: "写真", caption: "キャプション",
  staff: "スタッフ", name: "氏名", kana: "ふりがな", role: "肩書き", bio: "プロフィール", licenses: "資格",
  services: "サービス", title: "タイトル", lead: "説明", items: "項目", icon: "アイコン", id: "ID",
  news: "お知らせ", date: "日付", body: "本文", bodyHtml: "本文",
  reviews: "お客様の声", rating: "総合評価", count: "クチコミ件数", jobs: "実績件数", source: "出典", url: "URL", text: "本文", meta: "属性",
  faq: "よくある質問", q: "質問", a: "回答",
  company: "会社概要", corps: "事業体", biz: "業務",
  privacy: "プライバシーポリシー", sections: "条項", h: "見出し", b: "本文", list: "箇条書き",
  recruit: "採用情報", memo: "募集メモ", closing: "締め文", closingHtml: "締め文",
  root: "ページ設定", content: "ブロック", props: "", type: "ブロック種別",
  pageOrder: "ページの並び順", pageTitles: "ページ名", sidebar: "サイドバー", home3: "トップの3つの案内",
};
export function registerLabels(map) { Object.assign(JP_LABELS, map); }
function pathLabel(path) {
  return path
    .map((seg) => (typeof seg === "number" ? "#" + (seg + 1) : (JP_LABELS[seg] === undefined ? seg : JP_LABELS[seg])))
    .filter((s) => s !== "")
    .join(" › ");
}

/* Puck keeps bookkeeping keys (zones, per-block ids) in its working copy that
   the saved document does not have; diffing them would report phantom edits. */
export function normalizeDoc(doc) {
  const d = doc || {};
  return {
    root: (d.root && d.root.props) || {},
    content: (d.content || []).map((b) => {
      const props = Object.assign({}, b.props);
      delete props.id;
      return { type: b.type, props };
    }),
  };
}
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
export function deepDiff(before, after, path, out) {
  if (JSON.stringify(before) === JSON.stringify(after)) return out;
  if (Array.isArray(before) && Array.isArray(after)) {
    const n = Math.max(before.length, after.length);
    for (let i = 0; i < n; i++) {
      if (i >= before.length) out.push({ path: path.concat([i]), kind: "add", after: after[i] });
      else if (i >= after.length) out.push({ path: path.concat([i]), kind: "del", before: before[i] });
      else deepDiff(before[i], after[i], path.concat([i]), out);
    }
  } else if (isObj(before) && isObj(after)) {
    const keys = Object.keys(before).concat(Object.keys(after).filter((k) => !(k in before)));
    keys.forEach((k) => deepDiff(before[k], after[k], path.concat([k]), out));
  } else {
    out.push({ path, kind: "edit", before, after });
  }
  return out;
}
/* Rich text fields hold HTML; showing the tags buries the words that changed. */
function plain(s) {
  if (s.indexOf("<") < 0) return s;
  return s.replace(/<\/(p|div|li|h[1-6])>/gi, " ").replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function fmtVal(v) {
  if (v === undefined || v === null || v === "") return "（なし）";
  if (typeof v === "string") return plain(v) || "（なし）";
  if (Array.isArray(v)) return v.map(fmtVal).join(" ／ ");
  if (typeof v === "object") return Object.keys(v).map((k) => (JP_LABELS[k] || k) + "：" + fmtVal(v[k])).join("　");
  return String(v);
}
/* Flat, readable dump of a stored document — used to show what a saved version
   actually contains, not just how it differs. */
function leaves(v, path, out) {
  if (Array.isArray(v)) { v.forEach((x, i) => leaves(x, path.concat([i]), out)); return out; }
  if (isObj(v)) { Object.keys(v).forEach((k) => leaves(v[k], path.concat([k]), out)); return out; }
  if (v !== undefined && v !== null && v !== "") out.push({ path, value: v });
  return out;
}
export function ValueList({ data, empty }) {
  const rows = leaves(data, [], []);
  if (!rows.length) return <div className="dm-empty">{empty || "内容がありません。"}</div>;
  return (
    <div className="dm-body">
      {rows.map((r, i) => (
        <div className="dm-row dm-plain" key={i}>
          <div className="dm-path">{pathLabel(r.path)}</div>
          <div className="dm-after"><span className="dm-txt">{fmtVal(r.value)}</span></div>
        </div>
      ))}
    </div>
  );
}

export function ChangeList({ diffs, empty }) {
  if (!diffs.length) return <div className="dm-empty">{empty || "このセクションに変更はありません。"}</div>;
  return (
    <div className="dm-body">
      {diffs.map((d, i) => (
        <div className="dm-row" key={i}>
          <div className="dm-path">{pathLabel(d.path)}{d.kind === "add" ? "（追加）" : d.kind === "del" ? "（削除）" : ""}</div>
          {d.kind !== "add" ? <div className="dm-before"><span className="dm-tag">変更前</span><span className="dm-txt">{fmtVal(d.before)}</span></div> : null}
          {d.kind !== "del" ? <div className="dm-after"><span className="dm-tag">変更後</span><span className="dm-txt">{fmtVal(d.after)}</span></div> : null}
        </div>
      ))}
    </div>
  );
}


/* ---------------- live preview (the real site pages, in an iframe) ---------------- */
/* Every section maps to the page that actually renders it. The iframe loads
   that page with ?preview=<token>, so both panes are the site's own components
   and layout — nothing here re-implements the public design. */
export const PV_WIDTHS = { sp: 390, tablet: 768, pc: 1280 };
const DEVICES = [
  { key: "sp", label: "スマホ", w: 12, h: 18, r: 2 },
  { key: "tablet", label: "タブレット", w: 15, h: 19, r: 2 },
  { key: "pc", label: "デスクトップ", w: 20, h: 14, r: 2, stand: true },
];
function DeviceBar({ device, onChange, scale }) {
  return (
    <div className="ba-vp-bar">
      {DEVICES.map((d) => (
        <button key={d.key} type="button" title={d.label} aria-label={d.label}
          className={"ba-vp-btn" + (device === d.key ? " on" : "")} onClick={() => onChange(d.key)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x={(24 - d.w) / 2} y={(24 - d.h) / 2 - (d.stand ? 2 : 0)} width={d.w} height={d.h} rx={d.r} />
            {d.stand ? <path d="M9 21h6M12 18v3" /> : null}
          </svg>
        </button>
      ))}
      <span className="ba-vp-sep" />
      <span className="ba-vp-zoom">{Math.round((scale || 1) * 100)}%<small>（{PV_WIDTHS[device]}px）</small></span>
    </div>
  );
}

/* Renders a page at its real viewport width, then scales the whole frame down
   to fit the pane — so the layout is the production layout, just smaller. */
const ANCHOR_GAP = 72; // leave a little of the section above the fold

/* Highlight styles are injected into the framed page, so they can't lean on the
   admin's CSS variables. */
const HL_CSS = [
  ".acp-hl{border-radius:4px!important;scroll-margin-top:90px}",
  ".acp-hl-a{background:#e6f4ec!important;box-shadow:0 0 0 4px #3f7d55,0 0 0 7px rgba(63,125,85,.25)!important}",
  ".acp-hl-b{background:#fbeae7!important;box-shadow:0 0 0 4px #b06a60,0 0 0 7px rgba(176,106,96,.25)!important}",
].join("");
const IMG_RE = /\.(jpe?g|png|webp|gif|svg)$/i;

// Flatten one side of the diff into the literal strings that should show up on
// the page, so they can be found and highlighted there.
export function diffValues(diffs, side) {
  const out = [];
  const push = (v) => {
    if (typeof v === "string") { const s = v.trim(); if (s.length >= 2) out.push(s); }
    else if (typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === "object") Object.keys(v).forEach((k) => push(v[k]));
  };
  diffs.forEach((d) => push(side === "before" ? d.before : d.after));
  return out;
}

// Without this the first in-page click drops ?preview= and silently falls back
// to the live site — the draft would appear to "revert" on navigation.
function keepPreview(doc, win, token) {
  const links = doc.querySelectorAll("a[href]");
  for (let i = 0; i < links.length; i++) {
    const el = links[i];
    const raw = el.getAttribute("href") || "";
    if (!raw || raw.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    let u;
    try { u = new URL(el.href); } catch (e) { continue; }
    if (u.origin !== win.location.origin) continue;
    if (u.searchParams.get("preview") === token) continue;
    u.searchParams.set("preview", token);
    el.setAttribute("href", u.pathname + u.search + u.hash);
  }
}

// Ring the elements carrying an edited value, topmost first.
function markChanges(doc, values, cls) {
  const hits = [];
  if (!values || !values.length) return hits;
  if (!doc.getElementById("acp-hl-style")) {
    const st = doc.createElement("style");
    st.id = "acp-hl-style";
    st.textContent = HL_CSS;
    doc.head.appendChild(st);
  }
  values.forEach((v) => {
    let el = null;
    try {
      if (IMG_RE.test(v)) {
        const img = doc.querySelector('img[src$="' + v.split("/").pop() + '"]');
        el = img && ((img.closest && img.closest(".mk-portrait, figure")) || img);
      } else {
        const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = walk.nextNode())) {
          if (n.nodeValue && n.nodeValue.indexOf(v) !== -1) { el = n.parentElement; break; }
        }
      }
    } catch (e) { el = null; }
    if (el && hits.indexOf(el) === -1) { el.classList.add("acp-hl", cls); hits.push(el); }
  });
  hits.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
  return hits;
}

export function PreviewFrame({ path, token, anchor, values, tone, vw, onScale }) {
  const box = useRef(null);
  const frame = useRef(null);
  const timers = useRef([]);
  const [rect, setRect] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRect({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = rect.w ? Math.min(1, rect.w / vw) : 1;
  const frameH = rect.h ? rect.h / scale : 0;
  const left = Math.max(0, (rect.w - vw * scale) / 2);
  const src = token ? path + "?preview=" + token : null;
  useEffect(() => { if (onScale) onScale(scale); }, [scale, onScale]);

  // Lazy images and webfonts keep shifting the layout after load, and a
  // PC↔スマホ switch reflows without reloading, so this is re-run for a second
  // rather than done once.
  function decorate() {
    const f = frame.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      const win = doc && doc.defaultView;
      if (!doc || !doc.body || !win) return; // not parsed yet — a later pass will catch it
      keepPreview(doc, win, token);
      const hits = markChanges(doc, values, tone === "before" ? "acp-hl-b" : "acp-hl-a");
      // Only steer the scroll on the page we opened; once the user follows a
      // link inside the frame, leave their position alone.
      if (win.location.pathname !== path) return;
      const el = hits[0] || (anchor ? doc.querySelector(anchor) : null);
      if (!el) return;
      // behavior:"instant" is required: the site sets scroll-behavior:smooth,
      // and each retry would otherwise restart the animation from a standstill.
      const top = Math.max(0, el.getBoundingClientRect().top + win.scrollY - ANCHOR_GAP);
      win.scrollTo({ top, left: 0, behavior: "instant" });
    } catch (err) { /* same-origin only; nothing to do otherwise */ }
  }
  function settle() {
    timers.current.forEach(clearTimeout);
    timers.current = [0, 200, 600, 1200].map((d) => setTimeout(decorate, d));
  }
  useEffect(() => { settle(); return () => timers.current.forEach(clearTimeout); }, [vw, anchor, token, path]);

  return (
    <div className="ba-vp" ref={box}>
      {src ? (
        <iframe
          className="ba-frame" ref={frame} src={src} onLoad={settle} title="ページプレビュー"
          style={{ width: vw + "px", height: (frameH || 800) + "px", transform: "scale(" + scale + ")", left: left + "px" }}
        />
      ) : <div className="ba-loading"><span className="spin" />プレビューを準備中…</div>}
    </div>
  );
}

/* Before / After for a whole Puck page: the saved document on the left, the
   draft on the right, both rendered by the real site through ?preview=. */
export function PagePreviewModal({ pageId, path, label, saved, draft, busy, onClose, onPublish }) {
  const [view, setView] = useState("visual");
  const [device, setDevice] = useState("pc");
  const [scale, setScale] = useState(1);
  useEffect(() => { setScale(1); }, [device]); // avoid showing a stale zoom while the new width settles
  const [tokens, setTokens] = useState(null);
  const [err, setErr] = useState(null);
  const diffs = deepDiff(normalizeDoc(saved), normalizeDoc(draft), [], []);
  const dirty = diffs.length > 0;

  useEffect(() => {
    let alive = true;
    setTokens(null); setErr(null);
    const post = (doc) => fetch("/api/preview", {
      credentials: "same-origin", method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ __pages: { [pageId]: doc } }),
    }).then((r) => r.json()).catch(() => null);
    Promise.all([post(saved), post(draft)]).then(([b, a]) => {
      if (!alive) return;
      if (b && b.token && a && a.token) setTokens({ before: b.token, after: a.token });
      else setErr("プレビューの生成に失敗しました。時間をおいて開き直してください。");
    });
    return () => { alive = false; };
  }, [pageId]);

  return (
    <div className="ba-ov" onClick={onClose}>
      <div className="ba" onClick={(e) => e.stopPropagation()}>
        <div className="ba-h">
          <b>Before / After</b>
          <span className="ba-sub">{label}</span>
          {view === "visual" ? <DeviceBar device={device} onChange={setDevice} scale={scale} /> : null}
          <div className={"ba-seg" + (view === "visual" ? "" : " ba-first")}>
            <button className={view === "visual" ? "on" : ""} onClick={() => setView("visual")}>ページで見る</button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>変更点リスト{diffs.length ? <span className="ba-cnt">{diffs.length}</span> : null}</button>
          </div>
          <button className="ba-x" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        {view === "visual" ? (
          err ? <div className="ba-err">{err}</div> : (
            <div className="ba-cols">
              <div className="ba-col before">
                <div className="ba-colh">Before（現在の公開ページ）</div>
                <PreviewFrame path={path} token={tokens && tokens.before} anchor={null}
                  values={diffValues(diffs, "before")} tone="before" vw={PV_WIDTHS[device]} />
              </div>
              <div className="ba-col after">
                <div className="ba-colh">After（公開後のページ）</div>
                <PreviewFrame path={path} token={tokens && tokens.after} anchor={null}
                  values={diffValues(diffs, "after")} tone="after" vw={PV_WIDTHS[device]} onScale={setScale} />
              </div>
            </div>
          )
        ) : (
          <div className="ba-list"><ChangeList diffs={diffs} /></div>
        )}
        <div className="ba-acts">
          {dirty
            ? <span className="ba-note">変更箇所を枠線で示しています。ページ内のリンクをたどっても下書き表示のままです。</span>
            : <span className="ba-note ok">公開中の内容と同じです</span>}
          <button className="ba-close" onClick={onClose} disabled={busy}>閉じる</button>
          {dirty ? <button className="acp-save" onClick={onPublish} disabled={busy}>{busy ? "公開中…" : "この内容で公開"}</button> : null}
        </div>
      </div>
    </div>
  );
}
