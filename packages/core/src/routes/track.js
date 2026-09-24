import { json } from "../runtime/api.js";
export const prerender = false;

/* Click and scroll-depth tracking.

   The public site posts here with sendBeacon and the events are written to
   Workers Analytics Engine, which /api/stats reads back through its SQL API.
   Everything stays inside Cloudflare — no second database, no third party.

   This endpoint is public, so nothing from the body is trusted: the shape is
   fixed, `kind` must be one we know, and the free text is length-capped before
   it reaches the dataset. */

const CAP = 120;
const KINDS = ["tel", "mail", "external", "internal", "button", "scroll", "other"];

const clean = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);

/* Analytics Engine allows 96 bytes for the index, and Japanese runs three
   bytes a character — a name well inside CAP can still be over. Cut it to fit
   here rather than let the write fail. */
const INDEX_BYTES = 90;
function indexOf(s) {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= INDEX_BYTES) return s;
  let out = s.slice(0, INDEX_BYTES);
  while (out && enc.encode(out).length > INDEX_BYTES) out = out.slice(0, -1);
  return out;
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  /* Nothing to write to until the binding is deployed — the site must not
     start failing on that account. */
  if (!env.CLICKS) return json({ ok: false, reason: "no_binding" });

  /* sendBeacon posts a plain string, so the content type is not JSON. */
  let body = null;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ ok: false }, 400); }
  if (!body || typeof body !== "object") return json({ ok: false }, 400);

  const name = clean(body.name, CAP);
  if (!name) return json({ ok: false }, 400);

  const path = clean(body.path, CAP) || "/";
  /* Our own editing sessions are not site traffic — the same exclusion the
     page-view figures make. */
  if (path.startsWith("/admin")) return json({ ok: true, skipped: true });

  const kind = KINDS.indexOf(body.kind) >= 0 ? body.kind : "other";

  env.CLICKS.writeDataPoint({
    blobs: [name, path, kind],
    indexes: [indexOf(name)],
    doubles: [1],
  });
  return json({ ok: true });
}
