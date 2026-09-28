import { describe, it, expect } from "vitest";
import { makeEnv, ctx, seedUser, login } from "./helpers.js";
import { createToken, verifyToken, TOKEN_HEADER } from "../src/runtime/tokens.js";
import { readUsers, writeUsers } from "../src/runtime/users.js";
import * as meR from "../src/routes/me.js";
import * as contentR from "../src/routes/content.js";
import * as usersR from "../src/routes/users.js";
import * as tokensR from "../src/routes/tokens.js";

const withToken = (env, raw, opts = {}) =>
  ctx(env, { ...opts, headers: { ...(opts.headers || {}), [TOKEN_HEADER]: raw } });

describe("API トークン", () => {
  it("発行したトークンで本人として通り、KV には平文を残さない", async () => {
    const env = makeEnv();
    const u = await seedUser(env);
    const { raw, item } = await createToken(env, u, "Claude");
    expect(raw).toMatch(/^cb_[0-9a-f]{48}$/);
    expect(JSON.stringify([...env.CMS.m.values()])).not.toContain(raw);
    expect(item.label).toBe("Claude");
    expect((await verifyToken(env, raw)).user).toBe("owner");
    expect(await verifyToken(env, raw + "x")).toBeNull();
  });

  it("ヘッダーで送れば me と権限付きの API が通る", async () => {
    const env = makeEnv();
    const u = await seedUser(env);
    const { raw } = await createToken(env, u, "t");
    const me = await (await meR.GET(withToken(env, raw))).json();
    expect(me.authenticated).toBe(true);
    expect(me.user).toBe("owner");
    const res = await contentR.PATCH(withToken(env, raw, { method: "PATCH", body: { contact: { tel: "1" } } }));
    expect(res.status).toBe(200);
  });

  it("持ち主の権限に従う", async () => {
    const env = makeEnv();
    await seedUser(env);
    const ed = await seedUser(env, { user: "ed", role: "editor" });
    const { raw } = await createToken(env, ed, "t");
    expect((await usersR.GET(withToken(env, raw))).status).toBe(403);
  });

  it("持ち主を止める・消すと使えなくなる", async () => {
    const env = makeEnv();
    await seedUser(env);
    const ed = await seedUser(env, { user: "ed", role: "editor" });
    const { raw } = await createToken(env, ed, "t");
    let items = await readUsers(env);
    items.find((x) => x.id === ed.id).disabled = true;
    await writeUsers(env, items);
    expect(await verifyToken(env, raw)).toBeNull();
    items = (await readUsers(env)).filter((x) => x.id !== ed.id);
    await writeUsers(env, items);
    expect(await verifyToken(env, raw)).toBeNull();
  });

  it("管理画面から発行・一覧・取り消しでき、取り消すとすぐ使えない", async () => {
    const env = makeEnv();
    await seedUser(env);
    const cookie = await login(env);
    const created = await (await tokensR.POST(ctx(env, { method: "POST", body: { label: "Claude" }, cookie }))).json();
    expect(created.token).toMatch(/^cb_/);
    const list = await (await tokensR.GET(ctx(env, { cookie }))).json();
    expect(list.items).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.token);
    const del = await tokensR.DELETE(ctx(env, { method: "DELETE", body: { id: created.item.id }, cookie }));
    expect(del.status).toBe(200);
    expect(await verifyToken(env, created.token)).toBeNull();
  });

  it("トークンでトークンは作れない", async () => {
    const env = makeEnv();
    const u = await seedUser(env);
    const { raw } = await createToken(env, u, "t");
    const res = await tokensR.POST(withToken(env, raw, { method: "POST", body: { label: "x" } }));
    expect(res.status).toBe(403);
  });

  it("他人のトークンはユーザー管理の権限がないと消せない", async () => {
    const env = makeEnv();
    const owner = await seedUser(env);
    await seedUser(env, { user: "ed", role: "editor" });
    const { item } = await createToken(env, owner, "t");
    const cookie = await login(env, "ed");
    const list = await (await tokensR.GET(ctx(env, { cookie }))).json();
    expect(list.items).toHaveLength(0);
    const res = await tokensR.DELETE(ctx(env, { method: "DELETE", body: { id: item.id }, cookie }));
    expect(res.status).toBe(404);
  });
});

describe("schema", () => {
  it("ページ・設定・ブロックを JSON にできる形で返す", async () => {
    const schemaR = await import("../src/routes/schema.js");
    const env = makeEnv();
    const u = await seedUser(env, { user: "ed", role: "editor" });
    const { raw } = await createToken(env, u, "t");
    const data = await (await schemaR.GET(withToken(env, raw))).json();
    expect(data.pages.map((p) => p.id)).toEqual(["home", "about", "news"]);
    expect(data.pages.find((p) => p.id === "about").deletable).toBe(true);
    expect(data.pages.find((p) => p.id === "news").deletable).toBe(false);
    expect(data.settings[0].fields[0].key).toBe("contact.tel");
    expect(data.modules.links).toBe(false);
    expect(data.blocks.home.components).toEqual({});
  });
  it("ログインしていなければ 401", async () => {
    const schemaR = await import("../src/routes/schema.js");
    expect((await schemaR.GET(ctx(makeEnv()))).status).toBe(401);
  });
});
