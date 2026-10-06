// Формування HTML-повідомлення про заявку для Telegram.
// Людські назви беремо з content/quiz-content.json (LABELS) за id — нічого не хардкодимо.
import { LABELS } from "./content.js";
import { escapeHtml } from "./telegram.js";
import { normalizePhone } from "./phone.js";

const TG_LIMIT = 4096;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

const hasVal = (v) => Boolean(v && String(v).trim());

// id[] → людські підписи (невідомі id тихо відкидаємо).
function labelList(ids, map) {
  return (ids || []).map((id) => map[id]).filter(Boolean);
}

// Посилання: кожне з нового рядка, порожні відкидаємо.
function parseLinks(s) {
  return String(s || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// URL без query та hash.
function stripQuery(u) {
  if (!u) return "";
  try {
    const p = new URL(u);
    return p.origin + p.pathname;
  } catch (e) {
    return String(u).split(/[?#]/)[0];
  }
}

// received_at_kyiv ("YYYY-MM-DDTHH:mm:ss") → "дд.мм.рррр гг:хх, Київ".
function formatKyiv(lead) {
  const s = lead.received_at_kyiv;
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const [date, time] = s.split("T");
    const [Y, M, D] = date.split("-");
    const [h, m] = time.split(":");
    return `${D}.${M}.${Y} ${h}:${m}, Київ`;
  }
  // запасний шлях — з received_at через Intl
  const d = lead.received_at ? new Date(lead.received_at) : null;
  if (d && !Number.isNaN(d.getTime())) {
    const f = new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
    return `${f.replace(",", "")}, Київ`;
  }
  return "—";
}

// Inline-кнопка швидкого зв'язку: Telegram username → t.me, WhatsApp → wa.me.
// Для Viber і дзвінка кнопки не робимо (Telegram не підтримує такі посилання).
export function buildReplyMarkup(lead) {
  const buttons = [];
  const contact = String(lead.contact || "").trim();
  if (lead.channel === "tg" && contact.startsWith("@")) {
    buttons.push({ text: "✉️ Написати в Telegram", url: `https://t.me/${contact.slice(1)}` });
  } else if (lead.channel === "wa") {
    const digits = normalizePhone(contact); // 380XXXXXXXXX
    if (digits.length === 12) buttons.push({ text: "✉️ Написати у WhatsApp", url: `https://wa.me/${digits}` });
  }
  return buttons.length ? { inline_keyboard: [buttons] } : null;
}

// Збірка тексту з переданим списком рядків-посилань (для контролю довжини).
function render(lead, linkLines) {
  const L = [];
  L.push("<b>🟡 Нова заявка з квізу</b>");
  L.push("");

  const channelName = LABELS.channel[lead.channel] || lead.channel;
  L.push(`<b>Контакт:</b> ${escapeHtml(channelName)} — <code>${escapeHtml(lead.contact)}</code>`);

  // Сфера: для "other" показуємо вписаний варіант, якщо є.
  let sphere;
  if (lead.sphere === "other") sphere = hasVal(lead.sphereOther) ? lead.sphereOther : LABELS.sphere.other;
  else sphere = LABELS.sphere[lead.sphere] || lead.sphereLabel || lead.sphere;
  if (hasVal(sphere)) L.push(`<b>Сфера:</b> ${escapeHtml(sphere)}`);

  const problems = labelList(lead.problems, LABELS.problems);
  if (problems.length) L.push(`<b>Що заважає продажам:</b> ${escapeHtml(problems.join("; "))}`);

  const adsOwner = LABELS.adsOwner[lead.adsOwner];
  if (adsOwner) L.push(`<b>Хто веде рекламу:</b> ${escapeHtml(adsOwner)}`);

  const services = labelList(lead.services, LABELS.services);
  if (services.length) L.push(`<b>Послуги:</b> ${escapeHtml(services.join("; "))}`);

  const budget = LABELS.budget[lead.budget];
  if (budget) L.push(`<b>Бюджет на рекламу:</b> ${escapeHtml(budget)} / міс`);

  const audit = LABELS.audit[lead.audit];
  if (audit) L.push(`<b>Аудит:</b> ${escapeHtml(audit)}`);

  L.push("<b>Ресурси компанії:</b>");
  linkLines.forEach((line) => L.push(line));

  // Блок UTM — завжди всі 5 міток; відсутні позначаємо «—».
  L.push("");
  L.push("<b>📊 UTM</b>");
  const u = lead.utm || {};
  const c = lead.click_ids || {};
  const val = (v) => (hasVal(v) ? escapeHtml(v) : "—");
  L.push(`source: ${val(u.utm_source)}`);
  L.push(`medium: ${val(u.utm_medium)}`);
  L.push(`campaign: ${val(u.utm_campaign)}`);
  L.push(`content: ${val(u.utm_content)}`);
  L.push(`term: ${val(u.utm_term)}`);
  L.push(`fbclid: ${hasVal(c.fbclid) ? "є" : "—"} · gclid: ${hasVal(c.gclid) ? "є" : "—"}`);
  const anyUtm = UTM_KEYS.some((k) => hasVal(u[k])) || hasVal(c.fbclid) || hasVal(c.gclid);
  if (!anyUtm) L.push("Джерело: прямий захід / органіка");

  // Футер
  L.push("");
  const page = stripQuery(lead.page_url);
  if (hasVal(page)) L.push(`<b>Сторінка:</b> ${escapeHtml(page)}`);
  L.push(`<b>Referrer:</b> ${hasVal(lead.referrer) ? escapeHtml(lead.referrer) : "—"}`);
  L.push(`<b>Час:</b> ${formatKyiv(lead)}`);
  L.push(`<b>ID:</b> <code>${escapeHtml(lead.lead_id)}</code>`);

  return L.join("\n");
}

// Головна функція: повертає { text, replyMarkup }.
export function formatLeadMessage(lead) {
  const links = parseLinks(lead.links);
  const allLinkLines = links.length ? links.map(escapeHtml) : ["не вказані"];

  let text = render(lead, allLinkLines);

  // Ліміт 4096: якщо через посилання повідомлення задовге — обрізаємо блок ресурсів із «…».
  if (text.length > TG_LIMIT && links.length) {
    let keep = links.length;
    while (keep > 0 && text.length > TG_LIMIT) {
      keep--;
      const lines = links.slice(0, keep).map(escapeHtml).concat("…");
      text = render(lead, lines);
    }
  }

  return { text, replyMarkup: buildReplyMarkup(lead) };
}

export default formatLeadMessage;
