export const prerender = false;

/* Uploaded media. A worker response is not put in Cloudflare's edge cache on
   its own, so every request would otherwise mean an R2 read — this stores the
   response in the colo cache and answers repeat hits from there.

   Keys are random and never rewritten, so the file at a URL never changes —
   the same immutable value _headers declares for /media/*. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET({ params, request, locals }) {
  const key = params.path;
  if (!key) return new Response("Not found", { status: 404 });

  // Astro sends HEAD here too, and the Cache API only accepts GET.
  const cacheable = request.method === "GET";
  const cache = caches.default;
  const hit = cacheable ? await cache.match(request) : null;
  if (hit) return withHitHeader(hit, "HIT");

  const obj = await locals.runtime.env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("x-media-cache", "MISS");

  const res = new Response(obj.body, { headers });
  if (cacheable) {
    // The body can only be read once, so the cache gets its own copy.
    const stored = cache.put(request, res.clone()).catch(() => {});
    const ctx = locals.runtime && locals.runtime.ctx;
    if (ctx && ctx.waitUntil) ctx.waitUntil(stored); else await stored;
  }

  // A browser that already has the file only needs to be told it is current.
  if (matchesEtag(request.headers.get("if-none-match"), obj.httpEtag)) {
    return new Response(null, { status: 304, headers: stripBodyHeaders(headers) });
  }
  return res;
}

function matchesEtag(header, etag) {
  if (!header || !etag) return false;
  const bare = (t) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => bare(t) === bare(etag) || t.trim() === "*");
}
function stripBodyHeaders(headers) {
  const h = new Headers(headers);
  h.delete("content-length");
  h.delete("content-type");
  return h;
}
function withHitHeader(res, state) {
  const h = new Headers(res.headers);
  h.set("x-media-cache", state);
  return new Response(res.body, { status: res.status, headers: h });
}
