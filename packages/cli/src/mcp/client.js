/* サイトの /api/* を呼ぶ薄い入れ物。認証は API トークン（管理画面の「AI連携」で発行）。
   staging の Basic 認証は Authorization を使うので、トークンは別のヘッダーで送る。 */

export const TOKEN_HEADER = "x-controlboard-token";

export class ApiError extends Error {
  constructor(status, data) {
    const msg = (data && (data.message || data.error)) || "HTTP " + status;
    super(`${msg}（${status}）`);
    this.status = status;
    this.data = data;
  }
}

/* 状態ごとに、AI が次に何をすればよいか分かる言い方にする。 */
const HINTS = {
  401: "トークンが無効です。管理画面の「AI連携」で発行し直してください。",
  403: "このトークンの持ち主にはこの操作の権限がありません。",
  404: "見つかりません。サイトでこの機能（モジュール）が無効か、指定した対象がありません。",
};

export function createClient({ url, token, basic, fetch: f = globalThis.fetch }) {
  if (!url) throw new Error("サイトの URL がありません（--url か CONTROLBOARD_URL）");
  if (!token) throw new Error("トークンがありません（--token か CONTROLBOARD_TOKEN）");
  const origin = new URL(url).origin;
  const baseHeaders = { [TOKEN_HEADER]: token };
  if (basic) baseHeaders.authorization = "Basic " + Buffer.from(basic).toString("base64");

  async function raw(method, path, { query, body, form } = {}) {
    const u = new URL(path, origin);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    const headers = { ...baseHeaders };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await f(u, { method, headers, body: payload });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) {}
      const err = new ApiError(res.status, data);
      if (HINTS[res.status] && !(data && data.message)) err.message += " " + HINTS[res.status];
      throw err;
    }
    return res;
  }

  return {
    origin,
    raw,
    async call(method, path, opts) {
      const res = await raw(method, path, opts);
      const text = await res.text();
      try { return text ? JSON.parse(text) : {}; } catch (e) { return { text }; }
    },
  };
}

/* rag-ask は SSE で返る。出典と本文を一つにまとめる。 */
export function readSse(text) {
  let answer = "";
  let sources = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const d = line.slice(6).trim();
    if (d === "[DONE]") break;
    let o;
    try { o = JSON.parse(d); } catch (e) { continue; }
    if (Array.isArray(o.sources)) sources = o.sources;
    const piece = (o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content) || o.response || "";
    answer += piece;
  }
  return { answer, sources };
}
