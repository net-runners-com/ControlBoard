/* Shared helpers for the CMS API (ported from functions/_lib.js).
   Astro endpoints pass (env, request) instead of a Pages Functions ctx. */

export const PBKDF2_ITER = 100000;
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(s) {
  const a = new Uint8Array(s.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
  return a;
}

export function randHex(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function pbkdf2(password, saltHex, iterations = PBKDF2_ITER) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
    km, 256
  );
  return toHex(bits);
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function parseCookies(request) {
  const h = request.headers.get("Cookie") || "";
  const out = {};
  h.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export function sessionCookie(token, maxAge = SESSION_TTL) {
  return [
    `sid=${token}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax",
    maxAge > 0 ? `Max-Age=${maxAge}` : "Max-Age=0",
  ].join("; ");
}

export async function getSession(env, request) {
  const sid = parseCookies(request).sid;
  if (!sid) return null;
  const s = await env.CMS.get("session:" + sid, "json");
  if (!s) return null;
  return { sid, user: s.user };
}

/* Permissions are resolved per request, not stored in the session, so a change
   made in ユーザー管理 takes effect without the user signing in again. */
export async function requirePerm(env, request, perm) {
  const s = await getSession(env, request);
  if (!s) return { error: json({ error: "unauthorized" }, 401) };
  const { findUser, can } = await import("./users.js");
  const u = await findUser(env, s.user);
  if (!u || u.disabled) return { error: json({ error: "unauthorized" }, 401) };
  if (perm && !can(u, perm)) {
    return { error: json({ error: "forbidden", message: "この操作の権限がありません。" }, 403) };
  }
  return { session: s, user: u };
}
