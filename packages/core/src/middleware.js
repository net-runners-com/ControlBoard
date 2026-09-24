import config from "virtual:controlboard/config";
import { previewToken } from "./runtime/content.js";
import { safeEqual } from "./runtime/api.js";
import { readLinks, findLink, recordHit } from "./runtime/links.js";

/* admin.〜 で開いたときは、トップページを管理画面にする。
   admin.example.jp と staging.admin.example.jp の両方に効く。 */
const ADMIN_HOST = /(^|\.)admin\./i;

/* 無効にしたモジュールの API は、ルートがあっても 404 にする。 */
const MODULE_ROUTES = [
  [/^\/api\/links(\/|$)/, "links"],
  [/^\/api\/inquir(y|ies)(\/|$)/, "inquiries"],
  [/^\/api\/(stats|track)(\/|$)/, "stats"],
  [/^\/api\/admin\/rag-ask(\/|$)/, "rag"],
];
export function moduleFor(pathname) {
  for (const [re, m] of MODULE_ROUTES) if (re.test(pathname)) return m;
  return null;
}

/* 試験用サイトの Basic 認証。ID・パスワードが設定されていなければ誰も通さない。 */
export function basicAuthOk(request, env) {
  if (!env.BASIC_USER || !env.BASIC_PASS) return false;
  const want = "Basic " + btoa(env.BASIC_USER + ":" + env.BASIC_PASS);
  return safeEqual(request.headers.get("authorization") || "", want);
}
const ASK_BASIC = () =>
  new Response("この試験用サイトはIDとパスワードが必要です。\n", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="staging", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });

const NOT_FOUND = () =>
  new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* 管理画面は public/admin/index.html。応答のヘッダーを書き換えられる形に写して返す。
   ファイル置き場の応答は「取っておいてよい」印が付いているので、都度取りに来させる。 */
async function adminPage(env, url) {
  const asset = await env.ASSETS.fetch(new Request(new URL("/admin/", url)));
  const headers = new Headers(asset.headers);
  headers.set("cache-control", "no-store");
  headers.delete("etag");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

const SINGLE_SEGMENT = /^\/([a-z0-9-]{1,40})$/;

async function shortLink(context, env) {
  const m = context.url.pathname.toLowerCase().match(SINGLE_SEGMENT);
  if (!m) return null;
  const code = m[1];
  const link = findLink(await readLinks(env), code);
  if (!link || link.disabled || !link.url) return null;
  const job = recordHit(env, code, new Date()).catch(() => {});
  const ctx = context.locals.runtime && context.locals.runtime.ctx;
  if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
  return new Response(null, {
    status: 302,
    headers: { location: link.url, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

export function buildCsp(csp) {
  const extra = (list) => (list && list.length ? " " + list.join(" ") : "");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com" + extra(csp.script),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:" + extra(csp.img),
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com" + extra(csp.connect),
    "frame-src 'self'" + extra(csp.frame),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}
const CSP = buildCsp(config.csp);

export async function onRequest(context, next) {
  const env = (context.locals.runtime && context.locals.runtime.env) || {};
  const staging = String(env.SITE_ENV || "") === "staging";
  if (staging && !basicAuthOk(context.request, env)) return ASK_BASIC();

  const mod = moduleFor(context.url.pathname);
  if (mod && !config.modules[mod]) return NOT_FOUND();

  const adminHost = ADMIN_HOST.test(context.url.hostname);
  const serveAdmin = adminHost
    && context.url.pathname === "/"
    && !previewToken(context.url)
    && (context.request.method === "GET" || context.request.method === "HEAD");

  const res = serveAdmin ? await adminPage(env, context.url) : await next();

  /* 短縮リンクはページが見つからなかったときだけ。同じ住所のページがあればページが勝つ。 */
  if (res.status === 404 && config.modules.links && context.request.method === "GET") {
    const moved = await shortLink(context, env);
    if (moved) return moved;
  }

  try {
    if (adminHost || staging) {
      res.headers.set("x-robots-tag", "noindex, nofollow");
      if (staging) { res.headers.set("cache-control", "no-store"); res.headers.set("vary", "authorization"); }
    }
    if (previewToken(context.url)) {
      res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      res.headers.set("cache-control", "no-store");
    }
    const type = res.headers.get("content-type") || "";
    if (type.startsWith("text/html")) {
      if (!/charset/i.test(type)) res.headers.set("content-type", "text/html; charset=utf-8");
      if (!res.headers.get("content-security-policy")) res.headers.set("content-security-policy", CSP);
    }
  } catch (e) { /* 書き換えられない応答はそのまま */ }
  return res;
}
