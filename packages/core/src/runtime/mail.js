import config from "virtual:controlboard/config";

/* Where a contact form submission should be emailed, and how to send it.

   The address is read from the saved contact page rather than from the request
   body: the form is public, so letting the browser name the recipient would
   turn the site into an open relay. */

export async function inquiryRecipient(env, content) {
  try {
    const page = await env.CMS.get("page:contact", "json");
    const block = ((page && page.content) || []).find((b) => b.type === "ContactForm");
    const to = block && block.props && String(block.props.to || "").trim();
    if (to) return to;
  } catch (e) { /* KV unavailable → fall back to the shared address */ }
  return String(((content || {}).contact || {}).email || "").trim();
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ROWS = [
  ["お名前", "name"], ["会社名", "company"], ["郵便番号", "zip"], ["住所", "address"],
  ["メールアドレス", "mail"], ["電話番号", "tel"],
];

export function inquiryBody(item) {
  const lines = ROWS.filter(([, k]) => item[k]).map(([label, k]) => label + "：" + item[k]);
  lines.push("", "お問合せ内容：", item.detail);
  return lines.join("\n");
}

/* Base64 of UTF-8 — the subject and body are Japanese, so both have to be
   encoded rather than sent as raw bytes. */
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* Older Email Workers runtimes only accept a raw RFC 5322 message. Built by
   hand so the project keeps no mail dependency. */
/* お問い合わせの通知メール。Cloudflareは送信の口を持たないため、Resendの送信APIを使う。

   差出人は MAIL_FROM（未設定なら宛先と同じ）。返信先にお客様の
   アドレスを入れてあるので、受信箱で「返信」すればそのまま返せる。

   鍵（RESEND_API_KEY）が無いときや送信に失敗したときも、問い合わせ自体は
   KVに保存済み。取りこぼしにはならない。 */

export async function sendInquiryMail(env, to, item) {
  // 試験用サイトからは出さない。動作確認のたびに事務所へメールが飛ぶのを防ぐ。
  if (String(env.SITE_ENV || "") === "staging") return { sent: false, reason: "staging" };
  if (!to) return { sent: false, reason: "no_recipient" };
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return { sent: false, reason: "no_key" };
  const from = String(env.MAIL_FROM || "").trim() || to;
  const FROM_NAME = String(env.MAIL_FROM_NAME || "").trim() || ((config.site.name || "サイト") + " お問合せ");

  const subject = "【お問合せ】" + (item.name || "お名前未記入") + " 様";
  const text = inquiryBody(item);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM_NAME + " <" + from + ">",
        to: [to],
        reply_to: item.mail || undefined,
        subject,
        text,
        html: "<p>" + text.split("\n").map(esc).join("<br>") + "</p>",
      }),
    });
    if (res.ok) return { sent: true, to };
    const body = await res.text();
    return { sent: false, reason: "send_failed", detail: (res.status + " " + body).slice(0, 200) };
  } catch (e) {
    return { sent: false, reason: "send_failed", detail: String((e && e.message) || e).slice(0, 200) };
  }
}
