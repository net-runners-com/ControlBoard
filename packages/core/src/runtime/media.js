/* Display names for uploaded images. The object key stays fixed for the life of
   the file — every page that uses the image points at it — so the name people
   see is kept beside it rather than in the URL. */

const KEY = "medianames";

export async function readNames(env) {
  return (await env.CMS.get(KEY, "json")) || {};
}
export async function setName(env, key, name) {
  const names = await readNames(env);
  if (name) names[key] = name; else delete names[key];
  await env.CMS.put(KEY, JSON.stringify(names));
  return names;
}
export async function dropName(env, key) {
  const names = await readNames(env);
  if (!(key in names)) return;
  delete names[key];
  await env.CMS.put(KEY, JSON.stringify(names));
}

/* Falls back to the file name so an image uploaded before this existed, or one
   of the bundled site graphics, still reads as something. */
export const nameFor = (names, key) => names[key] || key.split("/").pop();

/* Keys are built from the original file name so the URL stays readable, with a
   random tail because two people can upload "photo.jpg" on the same day. Only
   ASCII goes into the key — a Japanese name would have to survive percent
   encoding everywhere the URL is stored, and the readable name is kept
   separately anyway. */
/* 画像の置き場は本番と試験で同じバケットを使い、頭の文字で分ける。試験で
   消せるのは staging/uploads/ の中だけなので、本番の画像を巻き込まない。
   本番から写した文章が指す uploads/… も、読むぶんには今までどおり開ける。 */
export const mediaPrefix = (env) =>
  (String((env && env.SITE_ENV) || "") === "staging" ? "staging/uploads/" : "uploads/");

export function keyFor(filename, ext, rand, prefix = "uploads/") {
  const base = String(filename || "")
    .replace(/\.[^.]*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return prefix + (base ? base + "-" : "") + rand + "." + ext;
}
