import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLeadMessage, buildReplyMarkup } from "../server/lib/format.js";

function lead(over = {}) {
  return {
    source: "quiz_wd_v1",
    sphere: "realty",
    sphereLabel: "Нерухомість і будівництво",
    sphereOther: "",
    problems: ["leads", "conv"],
    adsOwner: "contractor",
    services: ["meta", "rec"],
    budget: "3-10",
    audit: "yes-run",
    links: "https://well-done.com.ua\ninstagram.com/welldone",
    channel: "tg",
    contact: "@welldone_user",
    utm: { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "test_quiz", utm_content: "ad1", utm_term: "marketing" },
    click_ids: { fbclid: "abc123", gclid: "" },
    page_url: "https://quiz.example/?utm_source=facebook&utm_medium=cpc",
    referrer: "https://facebook.com/",
    received_at_kyiv: "2026-10-06T12:34:00",
    lead_id: "11111111-2222-3333-4444-555555555555",
    ...over,
  };
}

test("базовий шаблон: усі блоки на місці, людські назви з контенту", () => {
  const { text } = formatLeadMessage(lead());
  assert.match(text, /🟡 Нова заявка з квізу/);
  assert.match(text, /<b>Контакт:<\/b> Telegram — <code>@welldone_user<\/code>/);
  assert.match(text, /<b>Сфера:<\/b> Нерухомість і будівництво/);
  assert.match(text, /Замало заявок і нових клієнтів; Заявки є, але мало хто купує/);
  assert.match(text, /<b>Бюджет на рекламу:<\/b> \$3 000–10 000 \/ міс/);
  assert.match(text, /<b>Час:<\/b> 06\.10\.2026 12:34, Київ/);
  assert.match(text, /<b>ID:<\/b> <code>11111111-2222-3333-4444-555555555555<\/code>/);
});

test("'рекомендація' в послугах виводиться людською назвою", () => {
  const { text } = formatLeadMessage(lead());
  assert.match(text, /Таргетована реклама \(Meta Ads\); Потрібна рекомендація, ще не визначилися/);
});

test("екранування & < > у даних користувача", () => {
  const { text } = formatLeadMessage(lead({
    sphere: "other",
    sphereOther: "A & B <script>",
    links: "https://x.com/?a=1&b=2",
    utm: { utm_source: "<b>x</b>", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" },
    click_ids: { fbclid: "", gclid: "" },
  }));
  assert.match(text, /A &amp; B &lt;script&gt;/);
  assert.match(text, /https:\/\/x\.com\/\?a=1&amp;b=2/);
  assert.match(text, /source: &lt;b&gt;x&lt;\/b&gt;/);
  assert.doesNotMatch(text, /<script>/);
});

test("порожні поля не показуються (крім UTM)", () => {
  const { text } = formatLeadMessage(lead({
    adsOwner: "", budget: "", audit: "", problems: [], services: [],
  }));
  assert.doesNotMatch(text, /Хто веде рекламу/);
  assert.doesNotMatch(text, /Бюджет на рекламу/);
  assert.doesNotMatch(text, /Аудит:/);
  assert.doesNotMatch(text, /Що заважає продажам/);
  assert.doesNotMatch(text, /Послуги:/);
  assert.match(text, /📊 UTM/); // UTM блок лишається
});

test("sphereOther використовується для sphere=other", () => {
  const { text } = formatLeadMessage(lead({ sphere: "other", sphereOther: "Медицина" }));
  assert.match(text, /<b>Сфера:<\/b> Медицина/);
});

test("без UTM: блок є з «—» і рядок «прямий захід / органіка»", () => {
  const { text } = formatLeadMessage(lead({
    utm: { utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" },
    click_ids: { fbclid: "", gclid: "" },
  }));
  assert.match(text, /source: —/);
  assert.match(text, /term: —/);
  assert.match(text, /fbclid: — · gclid: —/);
  assert.match(text, /Джерело: прямий захід \/ органіка/);
});

test("з UTM: значення показані, без рядка прямого заходу", () => {
  const { text } = formatLeadMessage(lead());
  assert.match(text, /source: facebook/);
  assert.match(text, /campaign: test_quiz/);
  assert.match(text, /term: marketing/);
  assert.match(text, /fbclid: є · gclid: —/);
  assert.doesNotMatch(text, /прямий захід/);
});

test("ресурси: «не вказані» коли порожньо", () => {
  const { text } = formatLeadMessage(lead({ links: "" }));
  assert.match(text, /<b>Ресурси компанії:<\/b>\nне вказані/);
});

test("довгий блок посилань обрізається до ≤4096 з «…»", () => {
  const many = Array.from({ length: 400 }, (_, i) => `https://example.com/very/long/path/segment/number-${i}`).join("\n");
  const { text } = formatLeadMessage(lead({ links: many }));
  assert.ok(text.length <= 4096, `довжина ${text.length}`);
  assert.match(text, /…/);
  // решта повідомлення ціла — футер на місці
  assert.match(text, /<b>ID:<\/b>/);
});

test("inline-кнопка: Telegram username → t.me", () => {
  const rm = buildReplyMarkup(lead({ channel: "tg", contact: "@welldone_user" }));
  assert.equal(rm.inline_keyboard[0][0].url, "https://t.me/welldone_user");
});

test("inline-кнопка: WhatsApp → wa.me/380...", () => {
  const rm = buildReplyMarkup(lead({ channel: "wa", contact: "+380 67 123 45 67" }));
  assert.equal(rm.inline_keyboard[0][0].url, "https://wa.me/380671234567");
});

test("inline-кнопки нема для Viber і дзвінка", () => {
  assert.equal(buildReplyMarkup(lead({ channel: "viber", contact: "+380 67 123 45 67" })), null);
  assert.equal(buildReplyMarkup(lead({ channel: "call", contact: "+380 67 123 45 67" })), null);
});

test("tg з телефоном (не username) — без кнопки", () => {
  assert.equal(buildReplyMarkup(lead({ channel: "tg", contact: "+380 67 123 45 67" })), null);
});

test("page_url виводиться без query", () => {
  const { text } = formatLeadMessage(lead());
  assert.match(text, /<b>Сторінка:<\/b> https:\/\/quiz\.example\//);
  assert.doesNotMatch(text, /utm_source=facebook\n/); // без query у рядку сторінки
});
