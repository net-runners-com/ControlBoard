import React from "react";
import { richField, imageField, Rich } from "@controlboard/core/puck";
import { publishedNews, newsHref } from "@controlboard/core/runtime/news";

/* 作例「みどり会計事務所」のブロック。管理画面の「サイト編集」で、ここに並べた部品を
   積み木のように組み替えられる。共通の内容（電話番号・お知らせなど）は、管理画面でも
   公開ページでも puck.metadata.site から読む。 */

const siteOf = (puck) => (puck && puck.metadata && puck.metadata.site) || {};
const text = (label) => ({ type: "text", label });
const area = (label) => ({ type: "textarea", label });

const Hero = {
  label: "メインビジュアル",
  fields: {
    eyebrow: text("小見出し"), title: area("見出し"), lead: area("リード文"),
    image: imageField("背景画像", "横長 1600×900px 程度"),
    ctaLabel: text("ボタンの文言"), ctaHref: text("ボタンのリンク先"),
  },
  defaultProps: {
    eyebrow: "税務・会計・創業支援", title: "数字の不安を、\n次の一手に。",
    lead: "中小企業と個人事業主の経理・税務を、最初のご相談から決算まで伴走します。",
    image: "", ctaLabel: "無料相談を予約する", ctaHref: "/contact",
  },
  render: ({ eyebrow, title, lead, image, ctaLabel, ctaHref }) => (
    <section className="ex-hero" style={image ? { backgroundImage: `linear-gradient(90deg,rgba(10,30,20,.72),rgba(10,30,20,.2)),url(${image})` } : undefined}>
      <div className="ex-wrap">
        {eyebrow ? <p className="ex-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {lead ? <p className="ex-lead">{lead}</p> : null}
        {ctaLabel ? <a className="ex-btn" href={ctaHref || "/contact"}>{ctaLabel}</a> : null}
      </div>
    </section>
  ),
};

const Features = {
  label: "選ばれる理由",
  fields: {
    heading: text("見出し"),
    items: { type: "array", label: "項目", getItemSummary: (it) => it.title || "項目",
      arrayFields: { num: text("番号"), title: text("題"), text: area("説明") },
      defaultItemProps: { num: "01", title: "題", text: "説明" } },
  },
  defaultProps: {
    heading: "選ばれる3つの理由",
    items: [
      { num: "01", title: "毎月の顧問料は定額", text: "記帳代行から年末調整まで、月額に含めています。追加費用の心配はありません。" },
      { num: "02", title: "クラウド会計に強い", text: "freee・マネーフォワードの導入から運用まで。紙の領収書も写真で送るだけ。" },
      { num: "03", title: "創業融資の実績多数", text: "事業計画書づくりから金融機関との面談まで、一緒に準備します。" },
    ],
  },
  render: ({ heading, items }) => (
    <section className="ex-sec">
      <div className="ex-wrap">
        <h2 className="ex-h2">{heading}</h2>
        <div className="ex-grid3">
          {(items || []).map((it, i) => (
            <article className="ex-card" key={i}>
              <span className="ex-num">{it.num}</span>
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  ),
};

const ImageText = {
  label: "画像と文章",
  fields: {
    heading: text("見出し"), html: richField("本文"), image: imageField("画像", "4:3 程度"),
    reverse: { type: "radio", label: "画像の位置", options: [{ label: "左", value: false }, { label: "右", value: true }] },
  },
  defaultProps: { heading: "ごあいさつ", html: "<p>本文を入れてください。</p>", image: "", reverse: false },
  render: ({ heading, html, image, reverse }) => (
    <section className="ex-sec">
      <div className={"ex-wrap ex-split" + (reverse ? " is-rev" : "")}>
        <div className="ex-split-img">{image ? <img src={image} alt="" loading="lazy" /> : <div className="ex-ph">画像</div>}</div>
        <div>
          <h2 className="ex-h2 is-left">{heading}</h2>
          <Rich className="ex-rich" html={html} />
        </div>
      </div>
    </section>
  ),
};

const Services = {
  label: "料金表",
  fields: {
    heading: text("見出し"), note: text("注記"),
    items: { type: "array", label: "プラン", getItemSummary: (it) => it.name || "プラン",
      arrayFields: { name: text("名前"), price: text("料金"), text: area("内容"), featured: { type: "radio", label: "おすすめ", options: [{ label: "いいえ", value: false }, { label: "はい", value: true }] } },
      defaultItemProps: { name: "プラン", price: "月額 0円", text: "", featured: false } },
  },
  defaultProps: {
    heading: "料金プラン", note: "表示はすべて税込です。",
    items: [
      { name: "個人事業主", price: "月額 11,000円〜", text: "記帳チェック\n確定申告\nメール・チャット相談", featured: false },
      { name: "法人スタンダード", price: "月額 33,000円〜", text: "月次決算\n決算・法人税申告\n年末調整\n面談 年4回", featured: true },
      { name: "創業サポート", price: "110,000円", text: "設立手続き\n創業融資の申込支援\n会計ソフト導入", featured: false },
    ],
  },
  render: ({ heading, note, items }) => (
    <section className="ex-sec is-tint">
      <div className="ex-wrap">
        <h2 className="ex-h2">{heading}</h2>
        <div className="ex-grid3">
          {(items || []).map((it, i) => (
            <article className={"ex-plan" + (it.featured ? " is-featured" : "")} key={i}>
              {it.featured ? <span className="ex-badge">おすすめ</span> : null}
              <h3>{it.name}</h3>
              <p className="ex-price">{it.price}</p>
              <ul>{String(it.text || "").split("\n").filter(Boolean).map((l, j) => <li key={j}>{l}</li>)}</ul>
            </article>
          ))}
        </div>
        {note ? <p className="ex-note">{note}</p> : null}
      </div>
    </section>
  ),
};

const Staff = {
  label: "スタッフ紹介",
  fields: {
    heading: text("見出し"),
    items: { type: "array", label: "スタッフ", getItemSummary: (it) => it.name || "スタッフ",
      arrayFields: { photo: imageField("写真", "正方形"), name: text("名前"), role: text("肩書き"), text: area("ひとこと") },
      defaultItemProps: { photo: "", name: "名前", role: "", text: "" } },
  },
  defaultProps: {
    heading: "スタッフ",
    items: [
      { photo: "", name: "緑川 誠", role: "代表税理士", text: "銀行勤務を経て開業。数字の裏にある事情まで聞くのが信条です。" },
      { photo: "", name: "森本 彩", role: "税理士", text: "クラウド会計の導入が得意。IT が苦手な方もご安心ください。" },
      { photo: "", name: "林 健太", role: "スタッフ", text: "記帳と給与計算を担当しています。" },
    ],
  },
  render: ({ heading, items }) => (
    <section className="ex-sec">
      <div className="ex-wrap">
        <h2 className="ex-h2">{heading}</h2>
        <div className="ex-grid3">
          {(items || []).map((it, i) => (
            <article className="ex-staff" key={i}>
              {it.photo ? <img src={it.photo} alt={it.name} loading="lazy" /> : <div className="ex-avatar">{String(it.name || "").slice(0, 1)}</div>}
              <p className="ex-role">{it.role}</p>
              <h3>{it.name}</h3>
              <p>{it.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  ),
};

const NewsList = {
  label: "お知らせ一覧",
  fields: { heading: text("見出し"), count: { type: "number", label: "表示する件数", min: 1, max: 20 } },
  defaultProps: { heading: "お知らせ", count: 3 },
  render: ({ heading, count, puck }) => {
    const list = publishedNews(siteOf(puck).news).slice(0, count || 3);
    return (
      <section className="ex-sec">
        <div className="ex-wrap ex-narrow">
          <h2 className="ex-h2">{heading}</h2>
          {list.length ? (
            <ul className="ex-news">
              {list.map((n) => (
                <li key={n.id || n.title}><a href={newsHref(n)}><time>{n.date}</time><span>{n.title}</span></a></li>
              ))}
            </ul>
          ) : <p className="ex-note">お知らせはまだありません。管理画面の「お知らせ」から追加できます。</p>}
          <p className="ex-more"><a href="/news">お知らせ一覧へ →</a></p>
        </div>
      </section>
    );
  },
};

const Faq = {
  label: "よくある質問",
  fields: {
    heading: text("見出し"),
    items: { type: "array", label: "質問", getItemSummary: (it) => it.q || "質問",
      arrayFields: { q: text("質問"), a: area("答え") }, defaultItemProps: { q: "質問", a: "答え" } },
  },
  defaultProps: {
    heading: "よくある質問",
    items: [
      { q: "相談だけでも費用はかかりますか？", a: "初回のご相談（60分）は無料です。オンラインでも承ります。" },
      { q: "今の税理士から切り替えられますか？", a: "はい。引き継ぎに必要な書類の整理からお手伝いします。" },
    ],
  },
  render: ({ heading, items }) => (
    <section className="ex-sec">
      <div className="ex-wrap ex-narrow">
        <h2 className="ex-h2">{heading}</h2>
        {(items || []).map((it, i) => (
          <details className="ex-faq" key={i}><summary>{it.q}</summary><p>{it.a}</p></details>
        ))}
      </div>
    </section>
  ),
};

const Cta = {
  label: "お問い合わせ誘導",
  fields: { title: text("見出し"), text: area("文章"), label: text("ボタンの文言") },
  defaultProps: { title: "まずは無料相談から", text: "お電話・フォームどちらでもお気軽にどうぞ。", label: "フォームで相談する" },
  render: ({ title, text: body, label, puck }) => {
    const tel = (siteOf(puck).contact || {}).tel;
    return (
      <section className="ex-cta">
        <div className="ex-wrap">
          <h2>{title}</h2>
          <p>{body}</p>
          <div className="ex-cta-row">
            {tel ? <a className="ex-tel" href={"tel:" + tel.replace(/[^\d+]/g, "")}>☎ {tel}</a> : null}
            <a className="ex-btn is-light" href="/contact">{label}</a>
          </div>
        </div>
      </section>
    );
  },
};

const Text = {
  label: "文章",
  fields: { heading: text("見出し"), html: richField("本文") },
  defaultProps: { heading: "", html: "<p>本文を入れてください。</p>" },
  render: ({ heading, html }) => (
    <section className="ex-sec">
      <div className="ex-wrap ex-narrow">
        {heading ? <h2 className="ex-h2 is-left">{heading}</h2> : null}
        <Rich className="ex-rich" html={html} />
      </div>
    </section>
  ),
};

const components = { Hero, Features, ImageText, Services, Staff, NewsList, Faq, Cta, Text };
const categories = {
  top: { title: "見せる", components: ["Hero", "Features", "ImageText", "Staff"] },
  info: { title: "伝える", components: ["Services", "NewsList", "Faq", "Text", "Cta"] },
};

export const homeConfig = {
  components, categories,
  quick: [{ type: "Features", t: "選ばれる理由", d: "番号付きの3カラム" }, { type: "Cta", t: "お問い合わせ誘導", d: "電話とフォームへの案内" }],
};

/* 下層ページは上部に題名の帯が付く。題名は root の入力欄で変えられる。 */
export const subConfig = {
  components, categories,
  root: { fields: { jp: text("ページ名"), en: text("英語の見出し") } },
};
