/* Admin accounts. The site started with a single `auth` record; that record is
   migrated into the list on first read so an existing login keeps working.

   KV: users -> { items: [{ id, user, name, role, perms, salt, hash, iterations,
                            mustChange, disabled, createdAt }] } */

import { pbkdf2, randHex, PBKDF2_ITER } from "./api.js";

export const PERMS = ["content", "inquiries", "stats", "history", "users"];
export const PERM_LABELS = {
  content: "サイトの内容を編集",
  inquiries: "お問い合わせを見る",
  stats: "アクセス統計を見る",
  history: "変更履歴・復元",
  users: "ユーザー管理",
};
export const ROLES = ["owner", "admin", "editor"];
export const ROLE_LABELS = { owner: "オーナー", admin: "管理者", editor: "編集者" };
export const ROLE_PERMS = {
  owner: PERMS.slice(),
  admin: ["content", "inquiries", "stats", "history"],
  editor: ["content", "inquiries"],
};

export function permsOf(u) {
  if (!u || u.disabled) return [];
  const custom = Array.isArray(u.perms) ? u.perms.filter((p) => PERMS.includes(p)) : null;
  return custom && custom.length ? custom : (ROLE_PERMS[u.role] || ROLE_PERMS.editor);
}
export const can = (u, perm) => permsOf(u).includes(perm);

/* Never let the API hand back the password material. */
export function publicUser(u) {
  return {
    id: u.id, user: u.user, name: u.name || "", role: u.role,
    perms: permsOf(u), customPerms: Array.isArray(u.perms) ? u.perms : null,
    disabled: !!u.disabled, mustChange: !!u.mustChange, createdAt: u.createdAt || null,
  };
}

export async function readUsers(env) {
  const stored = await env.CMS.get("users", "json");
  if (stored && Array.isArray(stored.items) && stored.items.length) return stored.items;

  const auth = await env.CMS.get("auth", "json");
  if (!auth) return [];
  const migrated = [{
    id: randHex(8), user: auth.user, name: "", role: "owner", perms: null,
    salt: auth.salt, hash: auth.hash, iterations: auth.iterations || PBKDF2_ITER,
    mustChange: !!auth.mustChange, disabled: false, createdAt: null,
  }];
  await env.CMS.put("users", JSON.stringify({ items: migrated }));
  return migrated;
}

export const writeUsers = (env, items) => env.CMS.put("users", JSON.stringify({ items }));

export async function findUser(env, name) {
  const items = await readUsers(env);
  return items.find((u) => u.user === name) || null;
}

export async function setPassword(user, password) {
  const salt = randHex(16);
  user.salt = salt;
  user.hash = await pbkdf2(password, salt, PBKDF2_ITER);
  user.iterations = PBKDF2_ITER;
  return user;
}

/* An account that can manage users must always exist, or the site locks itself
   out of its own admin. */
export function ownersLeft(items, exceptId) {
  return items.filter((u) => u.id !== exceptId && !u.disabled && can(u, "users")).length;
}
