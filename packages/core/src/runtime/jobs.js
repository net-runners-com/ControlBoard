/* Job postings (募集要項). Each has a title and a free-form list of
   {label, value} fields the admin defines themselves — unlike news, there is
   no fixed shape, since one posting may need 給与 and another may not. */

export const jobComplete = (j) => !!(j && String(j.title || "").trim());

/* Absent means "yes, hiring" — existing postings saved before this field
   existed should not silently flip to 募集終了. */
export const isHiring = (j) => !j || j.hiring !== false;

/* 下書きと未入力のものはサイトに出さない。管理画面の一覧には残る。 */
export const publishedJobs = (list) =>
  (list || []).filter((j) => j && !j.draft && jobComplete(j));
