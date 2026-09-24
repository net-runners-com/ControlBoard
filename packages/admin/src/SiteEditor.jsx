import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Puck, usePuck } from "@measured/puck";
import "@measured/puck/puck.css";
import config from "virtual:controlboard/config";
import { setRichTextRenderer, setImageRenderer } from "@controlboard/core/puck";
const { home: homeConfig, sub: subConfig } = config.blocks;
const TEMPLATE_IDS = Object.keys(config.pages).filter((id) => config.pages[id].template);
import {
  PAGES, PAGE_IDS, allPageIds, customPages, pageDef, isCustomId, slugOfId, cleanSlug,
  DELETABLE_PAGE_IDS, hiddenPageIds,
} from "@controlboard/core/runtime/pages";

/* 日本語入力に耐える入力欄。

   変換中のかな漢字は、確定するまでブラウザが自分で組み立てている。その途中で
   React が value を書き戻すと組み立てが壊れ、「せみ」と打ったつもりが
   「sえmい」のように子音と母音がばらける。

   変換中だけ入力欄の中身をそのまま local に持ち、確定してから親へ渡す。
   `transform` を付けると、その整形も確定後にだけ走る（打っている最中に
   文字を削られると、これも変換を壊すため）。 */
function ImeInput({ value, onChange, transform, inputRef, ...rest }) {
  const [draft, setDraft] = useState(null);
  const commit = (v) => onChange(transform ? transform(v) : v);
  return (
    <input
      {...rest}
      ref={inputRef}
      value={draft == null ? value : draft}
      onCompositionStart={(e) => setDraft(e.target.value)}
      onCompositionEnd={(e) => { setDraft(null); commit(e.target.value); }}
      onChange={(e) => {
        if (draft == null) commit(e.target.value);
        else setDraft(e.target.value);
      }}
    />
  );
}

/* ページ名を変えたら、この一覧の名前もそれに従う。 */
const nameOf = (id, content) => {
  const saved = ((content || {}).pageTitles || {})[id];
  if (saved) return saved;
  const p = pageDef(id, content);
  return (p && p.label) || id;
};
const noteOf = (id, content) => {
  const p = pageDef(id, content);
  return (PAGES[id] && PAGES[id].note) || (p && p.url) || "";
};
import { newsHref } from "@controlboard/core/runtime/news";
import { PagePreviewModal, registerLabels, normalizeDoc } from "./preview.jsx";
import RichText from "./RichText.jsx";
import InlineRich from "./InlineRich.jsx";
import ImagePicker from "./ImagePicker.jsx";

setImageRenderer(({ value, onChange, label, hint }) => (
  <ImagePicker value={value} onChange={onChange} label={label} hint={hint} />
));

/* The config declares rich text fields but leaves the editor unspecified, so
   the site bundle stays free of the WYSIWYG library. Plug it in here. */
setRichTextRenderer(({ value, onChange, readOnly, label }) => (
  <RichText value={value} onChange={onChange} readOnly={readOnly} label={label} />
));

/* Rich text is edited directly on the page: Puck swaps the HTML string for a
   live editor inside the canvas. The sidebar keeps the same editor as a
   fallback (handy for fields that are scrolled out of view). */
const fieldTransforms = {
  custom: ({ value, field, propName, propPath, componentId, isReadOnly }) => {
    if (!field || !field.rich || isReadOnly || !componentId) return value;
    return <InlineRich key={componentId + ":" + propPath} html={value} componentId={componentId} propPath={propPath} propName={propName} />;
  },
};

/* Field labels come straight from the Puck config so the change list reads the
   same as the editor. */
[homeConfig, subConfig].forEach((cfg) => {
  const take = (fields) => Object.keys(fields || {}).forEach((k) => {
    if (fields[k] && fields[k].label) registerLabels({ [k]: fields[k].label });
    if (fields[k] && fields[k].arrayFields) take(fields[k].arrayFields);
  });
  take((cfg.root || {}).fields);
  Object.keys(cfg.components).forEach((name) => {
    registerLabels({ [name]: cfg.components[name].label || name });
    take(cfg.components[name].fields);
  });
});

/* Puck が本文の並びに使う置き場の名前。部品を足す先はここ。 */
const ROOT_ZONE = "root:default-zone";

const api = async (path, opts) => {
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opts || {}));
  let data = null; try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, data };
};

/* The canvas is an iframe, so the site's stylesheet has to be injected there
   rather than loaded in the admin document — the site's global resets would
   otherwise fight with the admin's own UI. Puck recreates the frame on some
   interactions, so this keeps checking rather than injecting once. */
function useCanvasStyles(ready, zoom) {
  const z = useRef(zoom);
  z.current = zoom;
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const tick = () => {
      if (stop) return;
      const frame = document.getElementById("preview-frame");
      const doc = frame && frame.contentDocument;
      if (doc && doc.head && !doc.getElementById("site-preview-css")) {
        const link = doc.createElement("link");
        link.id = "site-preview-css";
        link.rel = "stylesheet";
        /* サイトの見た目を編集枠に写す CSS。設定がなければ Puck の素の見た目。 */
        if (config.site.canvasCss) link.href = config.site.canvasCss;
        doc.head.appendChild(link);
        if (doc.body) doc.body.style.background = "#fff";
      }
      /* Scaling the frame element magnifies without touching what happens
         inside it: the page still lays out at the chosen viewport width, so
         the design does not reflow. Growing from the top-left keeps all the
         extra size on the scrollable side. */
      if (frame) {
        const want = z.current === 1 ? "" : "scale(" + z.current + ")";
        if (frame.style.transform !== want) {
          frame.style.transform = want;
          // Zooming in grows to the right so the overflow stays scrollable;
          // zooming out keeps the page centred in the empty space.
          frame.style.transformOrigin = !want ? "" : z.current > 1 ? "top left" : "top";
        }
      }
      setTimeout(tick, 500);
    };
    tick();
    return () => { stop = true; };
  }, [ready]);
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
function ZoomBar({ zoom, onChange }) {
  const i = ZOOMS.indexOf(zoom);
  const at = i < 0 ? ZOOMS.indexOf(1) : i;
  return (
    <div className="se-hd-zoom">
      <svg className="se-hd-zic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" />
      </svg>
      <button type="button" className="se-hd-ic" title="縮小" aria-label="縮小"
        disabled={at === 0} onClick={() => onChange(ZOOMS[at - 1])}>−</button>
      <button type="button" className="se-hd-z" title="標準の大きさに戻す" onClick={() => onChange(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="se-hd-ic" title="拡大" aria-label="拡大"
        disabled={at === ZOOMS.length - 1} onClick={() => onChange(ZOOMS[at + 1])}>＋</button>
    </div>
  );
}

function HeaderIcon({ d, title, disabled, onClick }) {
  return (
    <button type="button" className="se-hd-ic" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  );
}
/* Puck's own viewport bar sits on its own row under the header; it is hidden in
   CSS and rebuilt here so everything lives on one line. */
const VIEWPORTS = [
  { w: 390, label: "スマホ", box: { w: 12, h: 18 } },
  { w: 768, label: "タブレット", box: { w: 15, h: 19 } },
  { w: 1280, label: "デスクトップ", box: { w: 20, h: 14, stand: true } },
];
function ViewportBar() {
  const { appState, dispatch } = usePuck();
  const vp = appState.ui.viewports;
  const cur = (vp && vp.current && vp.current.width) || 1280;
  const set = (w) => dispatch({ type: "setUi", ui: { viewports: { ...vp, current: { width: w, height: "auto" } } } });
  return (
    <div className="se-hd-vp">
      {VIEWPORTS.map((v) => (
        <button key={v.w} type="button" title={v.label} aria-label={v.label}
          className={"se-hd-ic" + (cur === v.w ? " on" : "")} onClick={() => set(v.w)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x={(24 - v.box.w) / 2} y={(24 - v.box.h) / 2 - (v.box.stand ? 2 : 0)} width={v.box.w} height={v.box.h} rx="2" />
            {v.box.stand ? <path d="M9 21h6M12 18v3" /> : null}
          </svg>
        </button>
      ))}
      <span className="se-hd-w">{cur}px</span>
    </div>
  );
}

/* On a phone the fields panel cannot sit beside the canvas, so it becomes a
   sheet that slides up. Selecting a block opens it — that is the moment you
   want the settings — and the backdrop or the button closes it again. */
function FieldsSheet() {
  const { appState, dispatch } = usePuck();
  const selector = appState.ui.itemSelector;
  /* Puck already tracks whether the panel is showing, so that value is the one
     source of truth — guessing separately just fights it on mount. */
  const open = !!appState.ui.rightSideBarVisible;
  const setOpen = (v) => dispatch({ type: "setUi", ui: { rightSideBarVisible: v } });

  useEffect(() => {
    if (selector) setOpen(true);
  }, [selector && selector.index, selector && selector.zone]);

  /* Puck drops the right sidebar on narrow screens, so it has to be asked to
     keep it — the sheet is that panel, moved to the bottom. */
  useEffect(() => {
    document.body.classList.toggle("se-panel", open);
    return () => document.body.classList.remove("se-panel");
  }, [open]);

  /* The header, hero badges, sidebar and footer belong to the page itself
     rather than to a block, so clicking them selects nothing and the panel
     keeps showing whichever block was picked before. Send it back to Page —
     that is where those settings live. */
  useEffect(() => {
    let stop = false;
    let bound = null;
    const onClick = (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-puck-component]")) return;
      if (!t.closest(".mk-hero, .mk-header, .mk-gnav, .mk-side, .mk-footer, .mk-spbar, .mk-crumb, .mk-head")) return;
      dispatch({ type: "setUi", ui: { itemSelector: null } });
      setOpen(true);
    };
    const tick = () => {
      if (stop) return;
      const doc = (document.getElementById("preview-frame") || {}).contentDocument;
      if (doc && doc !== bound) {
        doc.addEventListener("click", onClick, true);
        bound = doc;
      }
      setTimeout(tick, 600);
    };
    tick();
    return () => {
      stop = true;
      if (bound) bound.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <React.Fragment>
      <button type="button" className={"se-sheet-btn" + (open ? " on" : "")}
        title={open ? "設定パネルを隠す" : "設定パネルを表示"} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" />
        </svg>
        設定
      </button>
      {open ? createPortal(
        <button type="button" className="se-sheet-ov" aria-label="設定を閉じる" onClick={() => setOpen(false)} />,
        document.body
      ) : null}
    </React.Fragment>
  );
}

/* ページに部品を足すボタン。Puck の部品一覧は左の引き出しにあるが、この画面
   では引き出しを閉じているので、よく使うものを画面の隅に出しておく。足した
   ものはページの一番下に入る。 */
/* すぐ出す部品は、サイトの Puck 設定の quick（[{ type, t, d }]）。無ければ先頭の2つ。 */
function quickOf(cfg) {
  const comps = cfg.components || {};
  const list = cfg.quick || Object.keys(comps).slice(0, 2).map((type) => ({ type, t: comps[type].label || type }));
  return list.filter((q) => comps[q.type]);
}
function AddFab() {
  const { appState, config, dispatch } = usePuck();
  const FAB_QUICK = quickOf(config);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const close = () => { setOpen(false); setAll(false); };

  const add = (type) => {
    const index = (appState.data.content || []).length;
    dispatch({ type: "insert", componentType: type, destinationIndex: index, destinationZone: ROOT_ZONE });
    /* 足したものをそのまま選んでおく。設定がその場で開くので、どこに増えた
       のかが分かる。 */
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    close();
  };

  const cats = config.categories || {};
  const labelOf = (c) => ((config.components || {})[c] || {}).label || c;
  return createPortal(
    <React.Fragment>
      {open ? <button type="button" className="se-fab-ov" aria-label="閉じる" onClick={close} /> : null}
      <div className="se-fab-wrap">
        {open ? (
          <div className="se-fab-menu">
            {FAB_QUICK.map((q) => (
              <button key={q.type} type="button" className="se-fab-it" onClick={() => add(q.type)}>
                <b>{q.t}</b>{q.d ? <small>{q.d}</small> : null}
              </button>
            ))}
            {all ? Object.keys(cats).map((k) => (
              <React.Fragment key={k}>
                <div className="se-fab-h">{cats[k].title}</div>
                {(cats[k].components || []).map((c) => (
                  <button key={c} type="button" className="se-fab-it" onClick={() => add(c)}>
                    <b>{labelOf(c)}</b>
                  </button>
                ))}
              </React.Fragment>
            )) : (
              <button type="button" className="se-fab-more" onClick={() => setAll(true)}>
                ほかの部品から選ぶ
              </button>
            )}
          </div>
        ) : null}
        <button type="button" className={"se-fab" + (open ? " on" : "")} onClick={() => (open ? close() : setOpen(true))}
          title="ページに部品を足す" aria-expanded={open}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={open ? "M6 6l12 12M18 6L6 18" : "M12 5v14M5 12h14"} />
          </svg>
          <span>追加</span>
        </button>
      </div>
    </React.Fragment>,
    document.body
  );
}

function EditorHeader({ actions, picker, zoom, onZoom }) {
  const { history } = usePuck();
  return (
    <div className="se-hd">
      {picker}
      <AddFab />
      <FieldsSheet />
      <ViewportBar />
      <ZoomBar zoom={zoom} onChange={onZoom} />
      <span className="se-hd-gap" />
      <HeaderIcon title="元に戻す" d="M9 14l-5-5 5-5M4 9h11a5 5 0 0 1 0 10h-4" disabled={!history.hasPast} onClick={history.back} />
      <HeaderIcon title="やり直す" d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h4" disabled={!history.hasFuture} onClick={history.forward} />
      <div className="se-hd-actions">{actions}</div>
    </div>
  );
}

/* One page of the site, edited in Puck. `saved` is what is live right now;
   `draft` is whatever the editor currently holds, so the preview can diff. */
const ZOOM_KEY = "controlboard.editorZoom";
function PageEditor({ pageId, toast, picker, onDirtyChange, onSaved }) {
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem(ZOOM_KEY)) || 1);
  const [saved, setSaved] = useState(null);
  const [site, setSite] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pvOpen, setPvOpen] = useState(false);
  const draft = useRef(null);
  useCanvasStyles(!!saved, zoom);

  /* 見出しと保存の知らせにはページ名を使う。編集中に変えた名前がすぐ映る
     ように、保存済みの文書ではなく手元の下書きから読む。 */
  /* 共通の内容を読み込む前の一瞬だけ、足したページの名前と住所が分からない。
     読み込み中は画面を出さないので、ここは置き字で足りる。 */
  const def = pageDef(pageId, site) || { label: "ページ", url: "/" };
  const pageName = (saved && String(((saved.root || {}).props || {}).jp || "").trim()) || def.label;

  /* The article layout has no page of its own; preview it on the newest
     announcement so what opens is a real article. */
  const previewPath = PAGES[pageId] && PAGES[pageId].template && (site.news || [])[0]
    ? newsHref(site.news[0])
    : def.url;

  useEffect(() => {
    let alive = true;
    setSaved(null); setErr(null); draft.current = null;
    (async () => {
      const [p, c] = await Promise.all([api("/api/page?id=" + pageId), api("/api/content")]);
      if (!alive) return;
      if (!p.ok || !p.data || !p.data.data) { setErr("ページの読み込みに失敗しました"); return; }
      setSaved(p.data.data);
      draft.current = p.data.data;
      setSite(c.ok ? (c.data || {}) : {});
    })();
    return () => { alive = false; };
  }, [pageId]);

  // Leaving a page with unsaved blocks silently loses them, so the tab switch
  // asks first — and so does closing the browser.
  const isDirty = () => {
    if (!saved || !draft.current) return false;
    return JSON.stringify(normalizeDoc(saved)) !== JSON.stringify(normalizeDoc(draft.current));
  };
  useEffect(() => { onDirtyChange(isDirty); return () => onDirtyChange(null); });
  useEffect(() => {
    const onLeave = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  });

  async function publish(next) {
    const doc = next || draft.current;
    setBusy(true);
    const { ok, data } = await api("/api/page?id=" + pageId, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(doc),
    });
    setBusy(false);
    if (ok) { setSaved(doc); setPvOpen(false); }
    toast(ok ? (pageName + "を公開しました。") : ((data && data.error) || "保存に失敗しました"), !ok);
    /* ページ名はメニューと一覧にも出る。保存で変わっているので読み直す。 */
    if (ok && onSaved) onSaved();
  }

  if (err) return <div className="acp-scroll"><p className="acp-lead">{err}</p></div>;
  if (!saved) return <div className="se-loading"><span className="spin" />編集画面を読み込み中…</div>;

  return (
    <div className={"se-wrap" + (busy ? " busy" : "")}>
      <Puck
        config={pageId === "home" ? homeConfig : subConfig}
        data={saved}
        metadata={{ site }}
        onChange={(d) => { draft.current = d; }}
        ui={{ leftSideBarVisible: false }}
        viewports={VIEWPORTS.map((v) => ({ width: v.w, label: v.label }))}
        onPublish={publish}
        fieldTransforms={fieldTransforms}
        overrides={{
          header: ({ actions }) => (
            <EditorHeader
              actions={actions} picker={picker} zoom={zoom}
              onZoom={(z) => { setZoom(z); localStorage.setItem(ZOOM_KEY, String(z)); }}
            />
          ),
          headerActions: ({ children }) => (
            <>
              <button type="button" className="se-check" onClick={() => setPvOpen(true)}>変更を確認</button>
              {children}
            </>
          ),
        }}
      />
      {pvOpen ? (
        <PagePreviewModal
          pageId={pageId} path={previewPath} label={pageName}
          saved={saved} draft={draft.current || saved} busy={busy}
          onClose={() => setPvOpen(false)} onPublish={() => publish(draft.current)}
        />
      ) : null}
    </div>
  );
}

/* サイト編集タブ: ページごとの Puck 編集に加えて、ページ横断で使われる
   共通設定とお知らせもここにまとめる（左メニューを増やさないため）。 */
/* The shared settings change colours, the logo, the side column and the
   footer — none of which you can picture from a form. This renders a real
   page from the unsaved draft, so the effect is visible while editing. */
const CFG_DEVICES = [
  { k: "sp", label: "スマホ", w: 390 },
  { k: "tab", label: "タブレット", w: 768 },
  { k: "pc", label: "PC", w: 1280 },
];

function SettingsPreview({ content }) {
  const [token, setToken] = useState(null);
  const [path, setPath] = useState("/");
  const [dev, setDev] = useState("pc");
  const box = useRef(null);
  const [scale, setScale] = useState(1);
  const json = JSON.stringify(content || {});
  const width = (CFG_DEVICES.find((d) => d.k === dev) || CFG_DEVICES[2]).w;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const r = await fetch("/api/preview", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: json,
      });
      const d = await r.json().catch(() => null);
      if (alive && d && d.token) setToken(d.token);
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [json]);

  /* The page is rendered at the real device width and then scaled down to fit
     the column, so the layout is the one that device would get. */
  useEffect(() => {
    const fit = () => {
      const w = box.current ? box.current.clientWidth : 0;
      setScale(w ? Math.min(1, w / width) : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width]);

  const H = 620;
  return (
    <div className="se-cfgprev">
      <div className="se-cfgprev-h">
        <b>プレビュー</b>
        <div className="st-range">
          {CFG_DEVICES.map((d) => (
            <button key={d.k} className={dev === d.k ? "on" : ""} onClick={() => setDev(d.k)}>{d.label}</button>
          ))}
        </div>
      </div>
      <div className="st-range se-cfgprev-pages">
        {PAGE_IDS.filter((id) => !PAGES[id].template).map((id) => (
          <button key={id} className={path === PAGES[id].url ? "on" : ""} onClick={() => setPath(PAGES[id].url)}>
            {PAGES[id].label}
          </button>
        ))}
      </div>
      <div className="se-cfgprev-box" ref={box} style={{ height: H }}>
        {token ? (
          <iframe
            className="se-cfgprev-f" title="設定のプレビュー" src={path + "?preview=" + token}
            style={{ width, height: Math.round(H / scale), transform: "scale(" + scale + ")" }}
          />
        ) : <div className="se-cfgprev-wait">読み込み中…</div>}
      </div>
      <p className="hint">保存前の内容です。ここで確認してから「保存」を押してください。</p>
    </div>
  );
}

export default function SiteEditor({ toast, content, settingsPanel, onSaveKeys, isDirty, discard, saving, onPageOrder, onPageSaved }) {
  const [tab, setTab] = useState("home");
  const [open, setOpen] = useState(false);
  const dirtyCheck = useRef(null);
  const go = (next) => {
    if (next === tab) { setOpen(false); return; }
    const check = dirtyCheck.current;
    if (check && check() && !window.confirm("保存していない変更があります。破棄して移動しますか？")) return;
    setTab(next);
    setOpen(false);
  };
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  /* つかんだ位置は ref にも持つ。state は次の描画まで古いままなので、
     つかんですぐ離したときに落とし先が分からなくなる。 */
  const grabbed = useRef(null);
  /* トップは常に先頭、記事ページはページではなく枠なので、どちらも
     並べ替えの対象から外す。 */
  const movable = allPageIds(content).filter((id) => id !== "home" && !(PAGES[id] && PAGES[id].template));
  /* 並べ替えはその場で保存する。ページを切り替える途中の操作なので、
     別に保存ボタンを押させると忘れられる。 */
  const move = (from, to) => {
    if (from == null || from === to) return;
    const next = movable.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    if (onPageOrder) onPageOrder(["home"].concat(next, TEMPLATE_IDS));
  };
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newNav, setNewNav] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);
  /* autoFocus は要素が作り直されるたびに効くので、パス欄を打っている最中に
     名前欄へ焦点が戻ってしまう。開いた一度だけ自分で当てる。 */
  const newNameRef = useRef(null);
  useEffect(() => {
    if (adding && newNameRef.current) newNameRef.current.focus();
  }, [adding]);
  /* 住所は自分で決めてもよいし、決めなければページ名から作る。 */
  const slugValue = slugTouched ? newSlug : cleanSlug(newName);
  /* 作ったらそのページを開く。作っただけで何も起きないと、どこへ行けば
     よいのか分からない。 */
  const addPage = async () => {
    const title = newName.trim();
    if (!title) return;
    setBusyAdd(true);
    const { ok, data } = await api("/api/pages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, slug: slugValue, inNav: newNav }),
    });
    setBusyAdd(false);
    if (!ok) return toast((data && data.message) || "作成できませんでした", true);
    setAdding(false);
    if (onPageSaved) await onPageSaved();
    toast(title + "を作成しました。");
    setTab(data.id);
    setOpen(false);
  };

  /* 足したページだけの持ちもの。メニューに出すかどうかと、削除。開いている
     ページの下に出す（どのページの設定なのかを迷わせないため）。 */
  const [busyPage, setBusyPage] = useState("");
  const customOf = (id) => customPages(content).find((p) => p.slug === slugOfId(id)) || null;
  const setNav = async (id, inNav) => {
    const slug = slugOfId(id);
    setBusyPage(slug);
    const { ok, data } = await api("/api/pages", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, inNav }),
    });
    setBusyPage("");
    if (!ok) return toast((data && data.message) || "変更できませんでした", true);
    if (onPageSaved) await onPageSaved();
    toast(inNav ? "メニューに出しました。" : "メニューから外しました。");
  };
  const removePage = async (id) => {
    const fixed = !isCustomId(id);
    const slug = fixed ? null : slugOfId(id);
    const msg = fixed
      ? nameOf(id, content) + "を削除します。よろしいですか？\n\nサイトとメニューから消えます。中身は残っているので、「このページを復元」でいつでも元に戻せます。"
      : nameOf(id, content) + "を削除します。よろしいですか？\n\nサイトとメニューから消えます。書いた中身は残っているので、同じ住所（" + slug + "）で作り直せば元に戻ります。";
    if (!window.confirm(msg)) return;
    setBusyPage(fixed ? id : slug);
    const { ok, data } = await api("/api/pages", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify(fixed ? { id } : { slug }),
    });
    setBusyPage("");
    if (!ok) return toast((data && (data.message || data.error)) || "削除できませんでした", true);
    /* 消したページを開いたままにはできないので、トップへ戻す。 */
    if (tab === id && !fixed) setTab("home");
    setOpen(false);
    if (onPageSaved) await onPageSaved();
    toast("ページを削除しました。");
  };
  /* 決まったページの復元。hiddenPages の印を外すだけ。 */
  const restorePage = async (id) => {
    setBusyPage(id);
    const { ok, data } = await api("/api/pages", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, restore: true }),
    });
    setBusyPage("");
    if (!ok) return toast((data && (data.message || data.error)) || "復元できませんでした", true);
    if (onPageSaved) await onPageSaved();
    toast("ページを復元しました。サイトとメニューに戻ります。");
  };

  const plainRow = (id) => (
    <button key={id} className={"se-pop-it fixed" + (tab === id ? " on" : "")} onClick={() => go(id)}>
      <span className="se-pop-grip" aria-hidden="true" />
      <span className="se-pop-txt"><b>{nameOf(id, content)}</b><small>{noteOf(id, content)}</small></span>
    </button>
  );
  const label = pageDef(tab, content) ? nameOf(tab, content) : tab === "settings" ? "共通設定" : "お知らせ";
  const dirtyData = isDirty("settings");
  const isPage = PAGE_IDS.includes(tab) || isCustomId(tab);
  const dataKey = tab === "settings" ? "settings" : null;

  const picker = (
    <div className="se-pick-wrap">
      <button type="button" className="se-picker" onClick={() => setOpen((o) => !o)}>
        <span className="se-picker-txt">
          <b>{label}</b>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
      </button>
      {dirtyData ? <span className="se-bar-note">未保存の変更があります</span> : null}
      {open ? (
        <>
          <div className="se-pop-ov" onClick={() => setOpen(false)} />
          <div className="se-pop">
            <div className="se-pop-h">ページ</div>
            {plainRow("home")}
            {movable.map((id, i) => (
              <React.Fragment key={id}>
              <button
                className={"se-pop-it" + (tab === id ? " on" : "") + (dragOver === i ? " over" : "") + (dragFrom === i ? " lift" : "")}
                draggable onClick={() => go(id)}
                onDragStart={(e) => { grabbed.current = i; setDragFrom(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragEnd={() => { grabbed.current = null; setDragFrom(null); setDragOver(null); }}
                onDrop={(e) => { e.preventDefault(); move(grabbed.current, i); grabbed.current = null; setDragFrom(null); setDragOver(null); }}
              >
                <span className="se-pop-grip" title="ドラッグで並べ替え" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                </span>
                <span className="se-pop-txt"><b>{nameOf(id, content)}</b><small>{(hiddenPageIds(content).includes(id) ? "削除済み・" : "") + noteOf(id, content)}</small></span>
              </button>
              {tab === id && (isCustomId(id) || DELETABLE_PAGE_IDS.includes(id)) ? (
                <div className="se-pop-sub">
                  {isCustomId(id) ? (
                    <label className="us-chk">
                      <input
                        type="checkbox" name={"nav-" + id} checked={!!(customOf(id) || {}).inNav}
                        disabled={busyPage === slugOfId(id)}
                        onChange={(e) => setNav(id, e.target.checked)}
                      />
                      <span>メニューに出す</span>
                    </label>
                  ) : (
                    <span className="se-pop-substate">
                      {hiddenPageIds(content).includes(id) ? "削除済み（サイトには出ていません）" : ""}
                    </span>
                  )}
                  {!isCustomId(id) && hiddenPageIds(content).includes(id) ? (
                    <button className="se-pop-del" disabled={busyPage === id} onClick={() => restorePage(id)}>
                      このページを復元
                    </button>
                  ) : (
                    <button className="se-pop-del" disabled={busyPage === (isCustomId(id) ? slugOfId(id) : id)} onClick={() => removePage(id)}>
                      このページを削除
                    </button>
                  )}
                </div>
              ) : null}
              </React.Fragment>
            ))}
            <p className="se-pop-note">ドラッグで並べ替えると、サイトのメニューも同じ順になります。</p>
            {adding ? (
              <div className="se-pop-add">
                <label className="se-pop-lb">ページ名</label>
                <ImeInput
                  inputRef={newNameRef} type="text" name="new-page" placeholder="例: セミナー情報"
                  value={newName} onChange={setNewName}
                  onKeyDown={(e) => { if (e.key === "Enter") addPage(); if (e.key === "Escape") setAdding(false); }}
                />
                <label className="se-pop-lb">ページパス</label>
                {/* パスを決めるところは1つだけ。ページ名から作った案を入れておき、
                    気に入らなければそのまま書き換えてもらう。 */}
                <div className="se-pop-url">
                  <span>/</span>
                  <ImeInput
                    type="text" name="new-page-slug" placeholder="seminar"
                    value={slugValue} transform={cleanSlug}
                    onChange={(v) => { setSlugTouched(true); setNewSlug(v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") addPage(); if (e.key === "Escape") setAdding(false); }}
                  />
                </div>
                {/* 日本語だけの名前からはパスが作れない。空のまま作らせると
                    でたらめなパスになるので、その前に気づいてもらう。 */}
                {newName.trim() && !slugValue ? (
                  <p className="hint err">ページパスを英数字で入れてください（例: seminar）。</p>
                ) : null}
                <label className="us-chk">
                  <input type="checkbox" name="new-page-nav" checked={newNav} onChange={(e) => setNewNav(e.target.checked)} />
                  <span>サイトのメニューに出す</span>
                </label>
                <div className="se-pop-addacts">
                  <button className="nw-edit" onClick={() => setAdding(false)}>やめる</button>
                  <button className="acp-save" disabled={busyAdd || !newName.trim() || !slugValue} onClick={addPage}>
                    {busyAdd ? "作成中…" : "作成する"}
                  </button>
                </div>
              </div>
            ) : (
              <button className="se-pop-newbtn" onClick={() => { setNewName(""); setNewSlug(""); setSlugTouched(false); setNewNav(true); setAdding(true); }}>
                ＋ ページを追加
              </button>
            )}
            {TEMPLATE_IDS.length ? <div className="se-pop-h">ひな型</div> : null}
            {TEMPLATE_IDS.map((id) => plainRow(id))}
            <div className="se-pop-h">サイト全体</div>
            <button className={"se-pop-it" + (tab === "settings" ? " on" : "")} onClick={() => go("settings")}>
              <span className="se-pop-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M20.5 13a8.5 8.5 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8.5 8.5 0 0 0-1.7-1L16 3h-4l-.4 2.6a8.5 8.5 0 0 0-1.7 1l-2.4-1-2 3.5L7.5 11a8.5 8.5 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8.5 8.5 0 0 0 1.7 1L12 21h4l.4-2.6a8.5 8.5 0 0 0 1.7-1l2.4 1 2-3.5z" /></svg></span>
              <span className="se-pop-txt"><b>共通設定</b><small>{config.settings.map((g) => g.group).join("・")}</small></span>
              {isDirty("settings") ? <span className="acp-pvdot" /> : null}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="se-shell">
      {!isPage ? <div className="se-bar">{picker}</div> : null}

      {isPage ? <PageEditor key={tab} pageId={tab} toast={toast} picker={picker} onSaved={onPageSaved} onDirtyChange={(fn) => { dirtyCheck.current = fn; }} /> : (
        <div className="acp-scroll se-cfg">
          <p className="acp-lead">
            ここで決めた内容はサイト全体（ヘッダー・フッターなど）で使われます。
          </p>
          <div className="se-cfg-cols">
            <div className="se-cfg-form">{settingsPanel}</div>
            <SettingsPreview content={content} />
          </div>
          <div className="se-dataacts">
            {isDirty(dataKey) ? <button className="acp-discard" onClick={() => discard(dataKey)} disabled={saving}>元に戻す</button> : null}
            <button className="acp-save" onClick={() => onSaveKeys(dataKey)} disabled={saving || !isDirty(dataKey)}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
