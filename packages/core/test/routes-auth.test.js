import { describe, it, expect } from "vitest";
import { makeEnv, ctx, seedUser, login } from "./helpers.js";
import * as loginR from "../src/routes/login.js";
import * as meR from "../src/routes/me.js";
import * as usersR from "../src/routes/users.js";

const post = (env, path, body, cookie, method = "POST") =>
  ctx(env, { method, url: "https://example.test/api/" + path, body, cookie });

describe("login", () => {
  it("正しい ID とパスワードで sid を発行し、7日で切れる", async () => {
    const env = makeEnv();
    await seedUser(env);
    const res = await loginR.POST(post(env, "login", { user: "owner", password: "pass-1234" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/^sid=[0-9a-f]{48}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
    const token = cookie.slice(4, 52);
    expect(env.CMS.ttl.get("session:" + token)).toBe(604800);
  });
  it("パスワード違い・存在しない ID は同じ 401", async () => {
    const env = makeEnv();
    await seedUser(env);
    expect((await loginR.POST(post(env, "login", { user: "owner", password: "x" }))).status).toBe(401);
    expect((await loginR.POST(post(env, "login", { user: "nobody", password: "x" }))).status).toBe(401);
  });
  it("me はログイン中の権限を返す", async () => {
    const env = makeEnv();
    await seedUser(env);
    const cookie = await login(env);
    const data = await (await meR.GET(ctx(env, { cookie }))).json();
    expect(data.perms).toContain("users");
  });
});

describe("users", () => {
  it("最後のオーナーを編集者に下げられない", async () => {
    const env = makeEnv();
    const u = await seedUser(env);
    const cookie = await login(env);
    const res = await usersR.PUT(post(env, "users", { id: u.id, role: "editor" }, cookie, "PUT"));
    expect(res.status).toBe(400);
  });
  it("users 権限のない人は一覧を見られない", async () => {
    const env = makeEnv();
    await seedUser(env, { user: "ed", role: "editor" });
    const cookie = await login(env, "ed");
    expect((await usersR.GET(ctx(env, { cookie }))).status).toBe(403);
  });
});
