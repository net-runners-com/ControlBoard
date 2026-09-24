import { json, randHex } from "../runtime/api.js";
import { getContent } from "../runtime/content.js";
import { inquiryRecipient, sendInquiryMail } from "../runtime/mail.js";
export const prerender = false;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  let b;
  try { b = await request.json(); }
  catch { return json({ error: "bad_json" }, 400); }

  if (str(b.website, 10)) return json({ ok: true }); // honeypot

  const item = {
    at: new Date().toISOString(),
    name: str(b.name, 80),
    company: str(b.company, 120),
    zip: str(b.zip, 16),
    address: str(b.address, 200),
    mail: str(b.mail, 160),
    tel: str(b.tel, 40),
    detail: str(b.detail, 5000),
    read: false,
  };
  if (!item.name || !item.mail || !item.detail) {
    return json({ error: "missing", message: "必須項目が未入力です。" }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.mail)) {
    return json({ error: "mail", message: "メールアドレスの形式が正しくありません。" }, 400);
  }

  /* The admin list is the record of truth. Sending never throws — a provider
     that is down or unset is recorded on the enquiry instead of losing it. */
  const to = await inquiryRecipient(env, await getContent(env));
  const mail = await sendInquiryMail(env, to, item);
  item.mailedTo = mail.sent ? to : "";
  item.mailStatus = mail.sent ? "sent" : mail.reason;
  if (mail.detail) item.mailError = mail.detail;

  const key = "inq:" + String(1e13 - Date.now()).padStart(13, "0") + ":" + randHex(3);
  await env.CMS.put(key, JSON.stringify(item));
  return json({ ok: true });
}
