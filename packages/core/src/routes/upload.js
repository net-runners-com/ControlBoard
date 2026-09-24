import { json, requirePerm, randHex } from "../runtime/api.js";
import { keyFor, setName, mediaPrefix } from "../runtime/media.js";
export const prerender = false;

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "content");
  if (guard.error) return guard.error;
  const s = guard.session;

  const ct = request.headers.get("content-type") || "";
  let file = null;
  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    file = form.get("file");
  }
  if (!file || typeof file === "string") return json({ error: "no_file" }, 400);

  const type = file.type || "application/octet-stream";
  if (!/^image\//.test(type)) return json({ error: "not_image", message: "画像ファイルを選んでください。" }, 400);
  if ((file.size || 0) > 5 * 1024 * 1024) return json({ error: "too_large", message: "5MBまでにしてください。" }, 400);

  const ext = (type.split("/")[1] || "bin").replace("jpeg", "jpg").replace("svg+xml", "svg").replace(/[^a-z0-9]/g, "");
  const key = keyFor(file.name, ext, randHex(4), mediaPrefix(env));
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: type } });
  // The name people see is kept apart from the key, so renaming an image later
  // can never break a page that already points at it.
  const name = String(file.name || "").replace(/\.[^.]*$/, "") || "画像";
  await setName(env, key, name);
  return json({ ok: true, url: "/media/" + key, name });
}
