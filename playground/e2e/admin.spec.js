import { test, expect } from "@playwright/test";

async function signIn(page) {
  await page.goto("/admin/");
  await page.getByLabel("ユーザー名").fill("e2e");
  await page.getByLabel("パスワード").fill("e2e-pass-1");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("button", { name: "サイト編集" })).toBeVisible();
}

async function openSettings(page) {
  await page.getByRole("button", { name: "サイト編集" }).click();
  await page.locator(".se-picker").click();
  await page.getByText("共通設定").first().click();
  await expect(page.getByText("基本情報")).toBeVisible();
}

test("オフにした機能はメニューに出ない", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await signIn(page);
  await expect(page.getByRole("button", { name: "お知らせ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "リンク管理" })).toBeVisible();
  await expect(page.getByText("アクセス統計")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("共通設定は既定値を表示し、変えた電話番号が公開ページに出る", async ({ page }) => {
  await signIn(page);
  await openSettings(page);
  const tel = page.getByLabel("電話番号");
  await expect(tel).toHaveValue(/^03-/);
  const value = "03-" + String(Date.now()).slice(-4) + "-1111";
  await tel.fill(value);
  await page.getByRole("button", { name: /保存/ }).first().click();
  await expect(page.getByText(/保存しました/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("tel")).toHaveText(value);
});

test("Puck で文章ブロックを足して公開すると、公開ページに出る", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await signIn(page);
  await page.goto("/");
  const before = await page.locator(".pg-text").count();
  await page.goto("/admin/");
  await page.getByRole("button", { name: "サイト編集" }).click();
  await page.getByRole("button", { name: "追加" }).click();
  await page.locator(".se-fab-it", { hasText: "文章" }).click();
  await page.getByText("Publish", { exact: true }).click();
  await expect(page.getByText(/公開しました|保存しました/)).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".pg-text")).toHaveCount(before + 1);
  expect(errors).toEqual([]);
});

test("お問い合わせフォームの送信が管理画面の一覧に出る", async ({ page }) => {
  const name = "テスト" + Date.now();
  await page.goto("/contact");
  await page.getByPlaceholder("お名前").fill(name);
  await page.getByPlaceholder("メール").fill("e2e@example.test");
  await page.locator("textarea").fill("相談です");
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.getByText("送信しました")).toBeVisible();
  await signIn(page);
  await page.getByRole("button", { name: "お問い合わせ" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
});
