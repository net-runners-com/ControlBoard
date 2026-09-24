import React, { useEffect, useRef, useState } from "react";
import { SECTIONS } from "./sections.js";

/* 管理画面の使い方アシスタント。全ページ共通の浮きボタン→チャットパネル。
   /api/admin/rag-ask が返す SSE(sources → 本文の断片 → [DONE])をその場で
   組み立てて表示する。認証済みならどの役割でも使える。 */

const autoGrow = (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; };

// ドキュメントの category(例:「募集要項」)から、対応する管理画面セクションの
// key を引く。build-rag-index.mjs が各チャンクに埋め込んだメタデータで、
// rag-docs のカテゴリ名と sections.js のラベルが一致するもの同士を結ぶ。
const CATEGORY_SECTION = {
  "概要": "dashboard", "ダッシュボード": "dashboard", "統計": "dashboard",
  "お問い合わせ": "inquiries", "お知らせ": "news", "募集要項": "jobs",
  "サイト編集": "site", "リンク管理": "links", "変更履歴": "history",
  "ユーザー管理": "users", "パスワード変更": "password",
};
const MAX_LINKS = 3;

// スコア順の sources から、権限のある範囲で重複しないページ遷移リンクを作る。
function linksFor(sources, perms) {
  const seen = new Set();
  const links = [];
  for (const source of sources || []) {
    const sectionKey = CATEGORY_SECTION[source.category];
    if (!sectionKey || seen.has(sectionKey)) continue;
    const section = SECTIONS.find((s) => s.key === sectionKey);
    if (!section || (section.need && !perms.includes(section.need))) continue;
    seen.add(sectionKey);
    links.push(section);
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

// レスポンス本文の "data: {...}\n\n" 断片を読みながら、sources / 本文の追記を
// その都度呼び出し側に渡す。
async function streamAsk(question, history, onSources, onDelta) {
  const res = await fetch("/api/admin/rag-ask", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || "エラーが発生しました");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const line = buf.slice(0, sep).replace(/^data:\s*/, "");
      buf = buf.slice(sep + 2);
      if (!line || line === "[DONE]") continue;
      let payload;
      try { payload = JSON.parse(line); } catch { continue; }
      if (payload.sources) onSources(payload.sources);
      const delta = payload.choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
    }
  }
}

// プレーンなテキストの塊を、空行区切りの段落と「- 」で始まる箇条書きに分けて
// 読みやすく表示する。詰まった1つの段落のまま出すより見やすいため。
function AnswerText({ text }) {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join("\n") }); para = []; } };
  const flushList = () => { if (list) { blocks.push({ type: "ul", items: list }); list = null; } };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const bullet = /^[-・]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      (list ??= []).push(bullet[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return (
    <React.Fragment>
      {blocks.map((b, i) => (b.type === "ul"
        ? <ul className="rag-ul" key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        : <p className="rag-p" key={i}>{b.text}</p>
      ))}
    </React.Fragment>
  );
}

export default function RagAssistant({ perms, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // サーバー側の履歴上限(2往復)と同じ分だけ渡す。エラーになった往復は除く。
  function recentHistory() {
    const turns = [];
    for (let i = 0; i < messages.length - 1; i++) {
      const a = messages[i];
      const b = messages[i + 1];
      if (a.role === "user" && b && b.role === "assistant" && !b.err) turns.push({ question: a.text, answer: b.text });
    }
    return turns.slice(-2);
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    const history = recentHistory();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }, { role: "assistant", text: "", links: [] }]);
    setBusy(true);
    try {
      await streamAsk(
        question, history,
        (sources) => setMessages((m) => { const n = m.slice(); n[n.length - 1] = { ...n[n.length - 1], links: linksFor(sources, perms || []) }; return n; }),
        (delta) => setMessages((m) => { const n = m.slice(); const last = n[n.length - 1]; n[n.length - 1] = { ...last, text: last.text + delta }; return n; }),
      );
    } catch (e) {
      setMessages((m) => { const n = m.slice(); n[n.length - 1] = { role: "assistant", text: e.message || "エラーが発生しました。しばらくしてからもう一度お試しください。", err: true }; return n; });
    }
    setBusy(false);
  }

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const goTo = (key) => onNavigate(key);

  return (
    <React.Fragment>
      <button type="button" className="rag-fab" onClick={() => setOpen((v) => !v)} aria-label={open ? "使い方アシスタントを閉じる" : "使い方アシスタントを開く"}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M9 10a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
        </svg>
      </button>
      {open ? (
        <div className="rag-panel" role="dialog" aria-label="使い方アシスタント">
          <div className="rag-head">
            <span>使い方アシスタント</span>
            <button type="button" className="rag-close" onClick={() => setOpen(false)} aria-label="閉じる">×</button>
          </div>
          <div className="rag-list" ref={listRef}>
            {messages.length === 0 ? (
              <p className="rag-hint">管理画面の使い方について質問できます。<br />例:「募集要項の項目で改行できますか」</p>
            ) : null}
            {messages.map((m, i) => (
              <div className={"rag-msg " + m.role + (m.err ? " err" : "")} key={i}>
                <div className="rag-bubble">
                  {m.text ? <AnswerText text={m.text} /> : (busy && i === messages.length - 1 ? "…考え中…" : "")}
                </div>
                {m.links && m.links.length ? (
                  <div className="rag-links">
                    {m.links.map((l) => (
                      <button type="button" className="rag-link" key={l.key} onClick={() => goTo(l.key)}>
                        {l.label} を開く <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="rag-inputrow">
            <textarea
              rows={1} className="rag-grow" value={input} placeholder="質問を入力(Enterで送信、Shift+Enterで改行)"
              onChange={(e) => { setInput(e.target.value); autoGrow(e); }}
              onKeyDown={onKeyDown} disabled={busy}
            />
            <button type="button" className="rag-send" onClick={send} disabled={busy || !input.trim()}>送信</button>
          </div>
        </div>
      ) : null}
    </React.Fragment>
  );
}
