/* Trackable links. A short address like /a7f3c9 is put on LINE, Instagram or a
   business card; visiting it counts the hit and forwards to the real page.

   Counting here rather than reading it out of the analytics dataset keeps it
   exact — query strings are not kept in the RUM data, and a printed card has
   no referrer at all.

   KV: links          -> { items: [{ code, label, url, note, disabled, createdAt }] }
       linkhits:<code> -> { total, days: { "2026-07-28": 3 } } */

/* Long enough to cover the widest period the statistics screen offers. */
const DAYS_KEPT = 90;

export const readLinks = async (env) => {
  const d = await env.CMS.get("links", "json");
  return d && Array.isArray(d.items) ? d.items : [];
};
export const writeLinks = (env, items) => env.CMS.put("links", JSON.stringify({ items }));

export const findLink = (items, code) =>
  (items || []).find((l) => l && String(l.code) === String(code)) || null;

export const readHits = async (env, code) => {
  const d = await env.CMS.get("linkhits:" + code, "json");
  return d && typeof d === "object" ? { total: d.total || 0, days: d.days || {} } : { total: 0, days: {} };
};

/* One key per link, so two links being clicked at once cannot overwrite each
   other's counts. Same link twice in the same instant can still lose a hit —
   acceptable for what this is used for. */
export async function recordHit(env, code, now) {
  const day = now.toISOString().slice(0, 10);
  const cur = await readHits(env, code);
  cur.total += 1;
  cur.days[day] = (cur.days[day] || 0) + 1;
  const keep = Object.keys(cur.days).sort().slice(-DAYS_KEPT);
  const days = {};
  keep.forEach((k) => { days[k] = cur.days[k]; });
  await env.CMS.put("linkhits:" + code, JSON.stringify({ total: cur.total, days }));
}

const dayCount = (days, todayIso, offset) => {
  const d = new Date(todayIso);
  d.setDate(d.getDate() - offset);
  return days[d.toISOString().slice(0, 10)] || 0;
};

/* Clicks over the last n days, today included — the statistics screen picks
   the same periods as the rest of its figures. */
export function sumDays(hits, todayIso, n) {
  const days = (hits && hits.days) || {};
  let sum = 0;
  for (let i = 0; i < n; i++) sum += dayCount(days, todayIso, i);
  return sum;
}

/* Oldest→newest, one point per day — for the per-link trend chart. */
export function seriesDays(hits, todayIso, n) {
  const days = (hits && hits.days) || {};
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(todayIso);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, views: days[key] || 0 });
  }
  return out;
}

export function summarise(hits, todayIso) {
  const days = (hits && hits.days) || {};
  return {
    total: (hits && hits.total) || 0,
    today: dayCount(days, todayIso, 0),
    week: sumDays(hits, todayIso, 7),
    month: sumDays(hits, todayIso, 30),
  };
}
