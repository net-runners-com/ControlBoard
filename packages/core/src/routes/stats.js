import { json, requirePerm } from "../runtime/api.js";
export const prerender = false;

const RANGES = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

/* Clicks and scroll depth, written by /api/track into Workers Analytics
   Engine. That product has its own SQL API rather than the GraphQL one the
   page-view figures use, so it is asked separately and a failure here leaves
   the rest of the screen intact.

   `_sample_interval` is Analytics Engine's own multiplier: summing it gives
   the real number of events rather than the number kept. */

async function events(env, token, days) {
  const ACCOUNT_ID = env.CF_ACCOUNT_ID;
  const DATASET = env.CLICKS_DATASET || "controlboard_clicks";
  const sql = `SELECT blob1 AS name, blob2 AS path, blob3 AS kind, SUM(_sample_interval) AS n
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${days}' DAY
    GROUP BY name, path, kind
    ORDER BY n DESC
    LIMIT 80`;
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`,
      { method: "POST", headers: { authorization: "Bearer " + token }, body: sql }
    );
    if (!r.ok) return { rows: [], err: "HTTP " + r.status + " " + (await r.text()).slice(0, 160) };
    const d = await r.json().catch(() => null);
    return { rows: (d && d.data) || [], err: null };
  } catch (e) {
    return { rows: [], err: String((e && e.message) || e).slice(0, 160) };
  }
}

/* Which page an event happened on matters as much as what it was, so both
   halves travel with every row: `name` is the headline, `label` the line
   under it. Scroll reads the other way round — the page leads and the depth
   sits under it — so the two are built separately.

   `key` keeps rows distinct when the same name appears on several pages. */
const clickRow = (x) => ({
  key: x.name + "|" + x.path,
  name: x.name,
  label: x.path,
  views: x.views,
});
const scrollRow = (x) => ({
  key: x.path + "|" + x.name,
  name: x.path,
  label: x.name + " まで",
  views: x.views,
});
/* Deepest first inside a page: how far readers actually got is the question,
   and 100% is the interesting end of it. */
const SCROLL_ORDER = (a, b) =>
  a.name.localeCompare(b.name) || parseInt(b.label, 10) - parseInt(a.label, 10);

// Admin: Cloudflare Web Analytics (RUM) summary via the GraphQL Analytics API.
// Needs Pages secrets CF_ANALYTICS_TOKEN (Account Analytics:Read) and
// CF_RUM_SITE_TAG. The breakdown query is issued separately so an unsupported
// dimension degrades that panel instead of blanking the whole page.
export async function GET({ request, url, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "stats");
  if (guard.error) return guard.error;
  const s = guard.session;

  const token = env.CF_ANALYTICS_TOKEN;
  const siteTag = env.CF_RUM_SITE_TAG;
  const ACCOUNT_ID = env.CF_ACCOUNT_ID;
  if (!token || !siteTag || !ACCOUNT_ID) return json({ configured: false });

  const range = RANGES[url.searchParams.get("range")] ? url.searchParams.get("range") : "30d";
  const days = RANGES[range];
  const hourly = range === "24h";
  const now = new Date();
  const from = hourly
    ? new Date(now.getTime() - 24 * 3600 * 1000)
    : new Date(now.getTime() - (days - 1) * 24 * 3600 * 1000);
  const iso = (d) => d.toISOString();
  const dateStr = (d) => d.toISOString().slice(0, 10);
  const vars = {
    acc: ACCOUNT_ID, site: siteTag,
    from: iso(from), to: iso(now), fromDate: dateStr(from), toDate: dateStr(now),
  };

  const gql = async (query) => {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ query, variables: vars }),
    });
    const data = await r.json().catch(() => null);
    const acct = data && data.data && data.data.viewer && data.data.viewer.accounts && data.data.viewer.accounts[0];
    const err = (data && data.errors && data.errors[0] && data.errors[0].message) || null;
    return { acct, err };
  };

  /* The admin panel is served from the same host and Cloudflare's automatic
     beacon counts it too, which would put our own editing sessions in the
     site's numbers. */
  const NOT_ADMIN = '{ requestPath_notlike: "/admin%" }';
  const FILTER = "{ AND: [{ datetime_geq: $from }, { datetime_leq: $to }, { siteTag: $site }, " + NOT_ADMIN + "] }";
  const SERIES_KEY = hourly ? "datetimeHour" : "date";
  const SERIES_FILTER = hourly ? FILTER : "{ AND: [{ date_geq: $fromDate }, { date_leq: $toDate }, { siteTag: $site }, " + NOT_ADMIN + "] }";
  const core = `query Core($acc: String!, $site: String!, $from: Time!, $to: Time!, $fromDate: Date!, $toDate: Date!) {
    viewer { accounts(filter: { accountTag: $acc }) {
      series: rumPageloadEventsAdaptiveGroups(
        limit: 200, filter: ${SERIES_FILTER}, orderBy: [${SERIES_KEY}_ASC]
      ) { count sum { visits } avg { sampleInterval } dimensions { ${SERIES_KEY} } }
      topPages: rumPageloadEventsAdaptiveGroups(
        limit: 12, filter: ${FILTER}, orderBy: [count_DESC]
      ) { count avg { sampleInterval } dimensions { requestPath } }
      referers: rumPageloadEventsAdaptiveGroups(
        limit: 10,
        filter: { AND: [{ datetime_geq: $from }, { datetime_leq: $to }, { siteTag: $site }, ${NOT_ADMIN}, { refererHost_neq: "" }] },
        orderBy: [count_DESC]
      ) { count avg { sampleInterval } dimensions { refererHost } }
    } }
  }`;

  const extra = `query Extra($acc: String!, $site: String!, $from: Time!, $to: Time!, $fromDate: Date!, $toDate: Date!) {
    viewer { accounts(filter: { accountTag: $acc }) {
      countries: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${FILTER}, orderBy: [count_DESC])
        { count avg { sampleInterval } dimensions { countryName } }
      browsers: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${FILTER}, orderBy: [count_DESC])
        { count avg { sampleInterval } dimensions { userAgentBrowser } }
      devices: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${FILTER}, orderBy: [count_DESC])
        { count avg { sampleInterval } dimensions { deviceType } }
    } }
  }`;

  // Host and OS go in their own request: if either dimension is unsupported the
  // rest of the breakdowns still come back.
  const extra2 = `query Extra2($acc: String!, $site: String!, $from: Time!, $to: Time!, $fromDate: Date!, $toDate: Date!) {
    viewer { accounts(filter: { accountTag: $acc }) {
      hosts: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${FILTER}, orderBy: [count_DESC])
        { count avg { sampleInterval } dimensions { requestHost } }
      systems: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${FILTER}, orderBy: [count_DESC])
        { count avg { sampleInterval } dimensions { userAgentOS } }
    } }
  }`;

  const [a, b, c, ev] = await Promise.all([gql(core), gql(extra), gql(extra2), events(env, token, days)]);
  if (!a.acct) return json({ configured: true, error: "query_failed", detail: a.err || "unknown" }, 502);

  const evRows = (keep, shape) => (ev.rows || [])
    .filter((x) => keep(String(x.kind || "")))
    .map((x) => ({
      name: String(x.name || "(不明)"),
      path: String(x.path || "/"),
      views: Math.round(Number(x.n) || 0),
    }))
    .filter((x) => x.views > 0)
    .map(shape);

  // RUM events are sampled: each recorded event stands for `sampleInterval`
  // real ones, so a raw count under-reports what the dashboard shows. At low
  // traffic that multiplier makes the estimate very coarse, so the raw sample
  // count travels with it and the admin says which is which.
  const scale = (x) => Math.max(1, Math.round((x.avg && x.avg.sampleInterval) || 1));
  const est = (x) => Math.round(x.count * scale(x));
  let maxInterval = 1;
  let rawTotal = 0;
  const list = (rows, key) => (rows || [])
    .map((x) => ({ label: x.dimensions[key] || "(不明)", views: est(x), samples: x.count }))
    .filter((x) => x.views > 0);

  const series = (a.acct.series || []).map((x) => {
    maxInterval = Math.max(maxInterval, scale(x));
    rawTotal += x.count;
    return {
      date: x.dimensions[SERIES_KEY],
      views: est(x),
      visits: Math.round(((x.sum && x.sum.visits) || 0) * scale(x)),
      samples: x.count,
    };
  });
  const totals = {
    views: series.reduce((n, d) => n + d.views, 0),
    visits: series.reduce((n, d) => n + d.visits, 0),
    samples: rawTotal,
  };

  return json({
    configured: true,
    range,
    days,
    hourly,
    // 1 = every visit recorded; higher means Cloudflare kept 1 event in N.
    sampleInterval: maxInterval,
    totals,
    series,
    topPages: list(a.acct.topPages, "requestPath"),
    referers: list(a.acct.referers, "refererHost"),
    countries: b.acct ? list(b.acct.countries, "countryName") : [],
    browsers: b.acct ? list(b.acct.browsers, "userAgentBrowser") : [],
    devices: b.acct ? list(b.acct.devices, "deviceType") : [],
    hosts: c.acct ? list(c.acct.hosts, "requestHost") : [],
    systems: c.acct ? list(c.acct.systems, "userAgentOS") : [],
    clicks: evRows((k) => k !== "scroll", clickRow),
    scroll: evRows((k) => k === "scroll", scrollRow).sort(SCROLL_ORDER),
    eventsError: ev.err,
    breakdownError: b.acct ? (c.acct ? null : c.err) : b.err,
  });
}
