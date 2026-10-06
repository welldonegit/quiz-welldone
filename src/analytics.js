/* analytics.js — передача подій квізу well done у dataLayer для Google Tag Manager.
   GTM-контейнер підключено на сторінці (один раз, у <head> та <body>). GA4 та інші
   лічильники маркетолог налаштовує через GTM. Тут — ЛИШЕ dataLayer.push:
   без gtag, без GA4, без fbq.

   Персональні дані в dataLayer не потрапляють (телефон, username, посилання,
   вписаний текст сфери, lead_id) — це контролюється на боці викликів у wd-quiz.js. */

const QUIZ_ID = "wd_quiz_v1";

// Повний перелік параметрів усіх подій квізу. Перед кожним push ці ключі
// скидаються у undefined, щоб значення з попереднього кроку не «прилипали»
// в dataLayer (він зливає обʼєкти, тож без скидання старі значення лишаються).
const EVENT_PARAM_KEYS = [
  "step_name",
  "step_number",
  "answer",
  "error_type",
  "contact_method",
  "business_sphere",
  "ad_budget",
  "services_count",
  "audit_type",
  "links_provided",
];

function isDebug() {
  try {
    return new URLSearchParams(window.location.search).get("wdq_debug") === "1";
  } catch (e) {
    return false;
  }
}

export function track(event, params) {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];

    // скидаємо всі відомі параметри попередньої події
    const payload = {};
    EVENT_PARAM_KEYS.forEach((k) => { payload[k] = undefined; });
    payload.event = event;
    payload.quiz_id = QUIZ_ID;
    Object.assign(payload, params || {});

    window.dataLayer.push(payload);

    if (isDebug()) {
      try { console.table(payload); } catch (e) { console.log("[wd-quiz][dataLayer]", payload); }
    }
  } catch (e) {
    /* no-op */
  }
}
