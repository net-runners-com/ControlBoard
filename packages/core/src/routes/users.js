import { json, requirePerm, randHex, PBKDF2_ITER } from "../runtime/api.js";
import {
  readUsers, writeUsers, publicUser, setPassword, ownersLeft,
  ROLES, PERMS, PERM_LABELS, ROLE_LABELS, ROLE_PERMS,
} from "../runtime/users.js";
export const prerender = false;

const bad = (msg, status = 400) => json({ error: "invalid", message: msg }, status);
const clean = (v) => String(v == null ? "" : v).trim();

export async function GET({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "users");
  if (guard.error) return guard.error;
  const items = await readUsers(env);
  return json({
    items: items.map(publicUser),
    me: guard.user.id,
    roles: ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r], perms: ROLE_PERMS[r] })),
    perms: PERMS.map((p) => ({ key: p, label: PERM_LABELS[p] })),
  });
}

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "users");
  if (guard.error) return guard.error;

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const name = clean(body.user);
  const password = String(body.password || "");
  if (!/^[A-Za-z0-9_.@-]{3,40}$/.test(name)) return bad("ログインIDは英数字と - _ . @ で3〜40文字にしてください。");
  if (password.length < 8) return bad("パスワードは8文字以上にしてください。");
  if (!ROLES.includes(body.role)) return bad("役割を選んでください。");

  const items = await readUsers(env);
  if (items.some((u) => u.user === name)) return bad("そのログインIDはすでに使われています。");

  const user = {
    id: randHex(8), user: name, name: clean(body.name), role: body.role,
    perms: Array.isArray(body.perms) ? body.perms.filter((p) => PERMS.includes(p)) : null,
    iterations: PBKDF2_ITER, mustChange: body.mustChange !== false,
    disabled: false, createdAt: new Date().toISOString(),
  };
  await setPassword(user, password);
  items.push(user);
  await writeUsers(env, items);
  return json({ ok: true, item: publicUser(user) });
}

export async function PUT({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "users");
  if (guard.error) return guard.error;

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const items = await readUsers(env);
  const u = items.find((x) => x.id === body.id);
  if (!u) return json({ error: "not_found" }, 404);

  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return bad("役割を選んでください。");
    u.role = body.role;
  }
  if (body.perms !== undefined) {
    u.perms = Array.isArray(body.perms) ? body.perms.filter((p) => PERMS.includes(p)) : null;
  }
  if (body.name !== undefined) u.name = clean(body.name);
  if (body.disabled !== undefined) u.disabled = !!body.disabled;
  if (body.password) {
    if (String(body.password).length < 8) return bad("パスワードは8文字以上にしてください。");
    await setPassword(u, String(body.password));
    u.mustChange = body.mustChange !== false;
  }
  // Checked after the edits so demoting or disabling the last owner is caught too.
  if (!ownersLeft(items, u.id) && !(!u.disabled && (u.perms || ROLE_PERMS[u.role] || []).includes("users"))) {
    return bad("ユーザー管理ができる人がいなくなります。先に別のユーザーに権限を与えてください。");
  }
  await writeUsers(env, items);
  return json({ ok: true, item: publicUser(u) });
}

export async function DELETE({ request, locals }) {
  const env = locals.runtime.env;
  const guard = await requirePerm(env, request, "users");
  if (guard.error) return guard.error;

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const items = await readUsers(env);
  const u = items.find((x) => x.id === body.id);
  if (!u) return json({ error: "not_found" }, 404);
  if (u.id === guard.user.id) return bad("自分自身は削除できません。");
  if (!ownersLeft(items, u.id)) return bad("ユーザー管理ができる人がいなくなります。");

  await writeUsers(env, items.filter((x) => x.id !== u.id));
  return json({ ok: true });
}
