/* Every announcement needs a stable address for its own page.

   New entries carry an `id` written by the admin, so the URL survives edits to
   the date or the title. Entries saved before that existed fall back to a short
   hash of date+title — stable while those stay unchanged, and replaced by a
   real id the next time お知らせ is saved. */

function shortHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/* The address used before entries carried an id. Kept so old links and old
   traffic records can still be matched to the announcement they belong to. */
export const legacyNewsSlug = (n) =>
  shortHash(String((n && n.date) || "") + "|" + String((n && n.title) || ""));

export const newsSlug = (n) => (n && n.id) || legacyNewsSlug(n);

export const newsHref = (n) => "/news/" + encodeURIComponent(newsSlug(n));

/* 表示は 2025.12.09、日付の入力欄は 2025-12-09 を要求する。年月日の読み取れる
   ものだけを日付として扱い、それ以外は未入力と同じ扱いにする。 */
export const newsDateISO = (v) => {
  const m = String(v || "").match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0") : "";
};

/* 題名と日付がそろっていないものは、一覧に並んだところで何のお知らせか
   分からない。 */
export const newsComplete = (n) => !!(n && String(n.title || "").trim() && newsDateISO(n.date));

/* 下書きと未入力のものはサイトに出さない。管理画面の一覧には残る。 */
export const publishedNews = (list) =>
  (list || []).filter((n) => n && !n.draft && newsComplete(n));

/* 期日のあるお知らせ（休業・営業時間の案内）は、その日が過ぎれば検索から
   探し当てる値打ちがなくなる。それが10年分たまると、サイトの中身が「夏期休業の
   お知らせ」の山に見えてしまい、本来評価されるべきページまで
   埋もれる。過ぎたものは検索結果から外し、一覧とRSSには今までどおり残す。

   直近1年ぶんは「いま開いているか」の答えとして役に立つので残す。記事ごとに
   noindex を持たせれば、その指定が優先される（管理画面から足す余地）。 */
const DATED_NOTICE = /休業|営業時間|年末年始|連休|在宅勤務|緊急事態宣言|振替日/;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/* 検索結果に出してよいお知らせ。落とすのは2種類だけ。
     期日の過ぎた案内 — 去年の夏期休業を探している人はいない。
     同じ題の古い方 — 「夏季休業のお知らせ」が8本あっても、検索する側から
     見ればどれを開いても同じ。最新の1本だけ残す。 */
export function indexableNews(list, now = Date.now()) {
  const newest = publishedNews(list)
    .slice()
    .sort((a, b) => newsDateISO(b.date).localeCompare(newsDateISO(a.date)));
  const seen = new Set();
  return newest.filter((n) => {
    if (typeof n.noindex === "boolean") return !n.noindex;
    const title = String(n.title || "").trim();
    if (seen.has(title)) return false;
    seen.add(title);
    if (!DATED_NOTICE.test(title)) return true;
    const iso = newsDateISO(n.date);
    return !iso || now - new Date(iso).getTime() <= YEAR_MS;
  });
}

export const isNewsIndexable = (list, item) =>
  indexableNews(list).some((n) => newsSlug(n) === newsSlug(item));

export function findNews(list, slug) {
  const items = publishedNews(list);
  let i = items.findIndex((n) => newsSlug(n) === slug);
  if (i < 0) i = items.findIndex((n) => legacyNewsSlug(n) === slug);
  if (i < 0) return null;
  return { item: items[i], index: i, prev: items[i - 1] || null, next: items[i + 1] || null };
}
