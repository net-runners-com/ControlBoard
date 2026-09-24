import { describe, it, expect } from "vitest";
import { makeEnv, seedUser, ctx } from "./helpers.js";
import { permsOf, can, ownersLeft, publicUser, readUsers } from "../src/runtime/users.js";
import { requirePerm, pbkdf2, safeEqual } from "../src/runtime/api.js";

describe("users", () => {
  it("役割ごとの既定権限", () => {
    expect(permsOf({ role: "owner" })).toEqual(["content", "inquiries", "stats", "history", "users"]);
    expect(permsOf({ role: "editor" })).toEqual(["content", "inquiries"]);
    expect(permsOf({ role: "admin", disabled: true })).toEqual([]);
  });
  it("個別権限は役割より優先し、未知の権限は捨てる", () => {
    expect(permsOf({ role: "editor", perms: ["stats", "bogus"] })).toEqual(["stats"]);
    expect(can({ role: "editor", perms: ["stats"] }, "content")).toBe(false);
  });
  it("オーナーが残るかを数える", () => {
    const items = [{ id: "a", role: "owner" }, { id: "b", role: "editor" }];
    expect(ownersLeft(items, "a")).toBe(0);
    expect(ownersLeft(items, "b")).toBe(1);
  });
  it("publicUser はパスワード情報を返さない", () => {
    const p = publicUser({ id: "a", user: "x", role: "owner", salt: "s", hash: "h" });
    expect(p).not.toHaveProperty("salt");
    expect(p).not.toHaveProperty("hash");
  });
  it("旧 auth レコードを users へ移す", async () => {
    const env = makeEnv();
    await env.CMS.put("auth", JSON.stringify({ user: "old", salt: "00", hash: "11" }));
    const items = await readUsers(env);
    expect(items[0]).toMatchObject({ user: "old", role: "owner" });
    expect(await env.CMS.get("users", "json")).toBeTruthy();
  });
});

describe("requirePerm", () => {
  it("セッションなしは 401", async () => {
    const env = makeEnv();
    const r = await requirePerm(env, ctx(env).request, "content");
    expect(r.error.status).toBe(401);
  });
  it("権限なしは 403、ありなら user を返す", async () => {
    const env = makeEnv();
    await seedUser(env, { user: "ed", role: "editor" });
    await env.CMS.put("session:t1", JSON.stringify({ user: "ed" }));
    const req = ctx(env, { cookie: "sid=t1" }).request;
    expect((await requirePerm(env, req, "users")).error.status).toBe(403);
    expect((await requirePerm(env, req, "content")).user.user).toBe("ed");
  });
  it("無効化されたユーザーは 401", async () => {
    const env = makeEnv();
    await seedUser(env, { user: "gone", disabled: true });
    await env.CMS.put("session:t2", JSON.stringify({ user: "gone" }));
    expect((await requirePerm(env, ctx(env, { cookie: "sid=t2" }).request, null)).error.status).toBe(401);
  });
  it("PBKDF2 は同じ入力で同じ値", async () => {
    const a = await pbkdf2("pw", "00ff", 1000);
    expect(safeEqual(a, await pbkdf2("pw", "00ff", 1000))).toBe(true);
    expect(safeEqual(a, await pbkdf2("px", "00ff", 1000))).toBe(false);
  });
});
