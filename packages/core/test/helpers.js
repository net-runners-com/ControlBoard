import { setPassword, readUsers, writeUsers } from "../src/runtime/users.js";

export class FakeKV {
  constructor() { this.m = new Map(); this.ttl = new Map(); }
  async get(k, type) {
    if (!this.m.has(k)) return null;
    const v = this.m.get(k);
    return type === "json" ? JSON.parse(v) : v;
  }
  async put(k, v, opts = {}) {
    this.m.set(k, String(v));
    if (opts.expirationTtl) this.ttl.set(k, opts.expirationTtl);
  }
  async delete(k) { this.m.delete(k); this.ttl.delete(k); }
  async list({ prefix = "" } = {}) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name }));
    return { keys, list_complete: true, cursor: "" };
  }
}

export class FakeR2 {
  constructor() { this.m = new Map(); }
  async put(key, body, opts = {}) {
    const buf = body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body;
    this.m.set(key, { buf, httpMetadata: opts.httpMetadata || {}, uploaded: new Date() });
    return { key };
  }
  async get(key) {
    const o = this.m.get(key);
    if (!o) return null;
    return {
      body: new Response(o.buf).body,
      httpMetadata: o.httpMetadata,
      httpEtag: '"fake"',
      size: o.buf.byteLength,
      writeHttpMetadata(h) { if (o.httpMetadata.contentType) h.set("content-type", o.httpMetadata.contentType); },
    };
  }
  async head(key) { const o = this.m.get(key); return o ? { key, size: o.buf.byteLength } : null; }
  async delete(key) { this.m.delete(key); }
  async list({ prefix = "" } = {}) {
    const objects = [...this.m.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, o]) => ({ key, size: o.buf.byteLength, uploaded: o.uploaded }));
    return { objects, truncated: false };
  }
}

export const makeEnv = (extra = {}) => ({ CMS: new FakeKV(), MEDIA: new FakeR2(), ...extra });

/* Astro のエンドポイントに渡る引数と同じ形を作る。 */
export function ctx(env, { method = "GET", url = "https://example.test/api/x", body, headers = {}, cookie } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  const init = { method, headers: h };
  if (body !== undefined) {
    if (body instanceof FormData) init.body = body;
    else { init.body = JSON.stringify(body); h["content-type"] = "application/json"; }
  }
  const waits = [];
  return {
    request: new Request(url, init),
    url: new URL(url),
    locals: { runtime: { env, ctx: { waitUntil: (p) => waits.push(p) } } },
    waits,
  };
}

export async function seedUser(env, { user = "owner", password = "pass-1234", role = "owner", perms = null, disabled = false } = {}) {
  const items = await readUsers(env);
  const u = { id: user + "-id", user, name: "", role, perms, mustChange: false, disabled, createdAt: null };
  await setPassword(u, password);
  items.push(u);
  await writeUsers(env, items);
  return u;
}

export async function login(env, user = "owner", password = "pass-1234") {
  const { POST } = await import("../src/routes/login.js");
  const res = await POST(ctx(env, { method: "POST", url: "https://example.test/api/login", body: { user, password } }));
  if (res.status !== 200) throw new Error("login failed: " + res.status);
  return res.headers.get("set-cookie").split(";")[0];
}
