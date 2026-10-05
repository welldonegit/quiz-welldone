// Гарантуємо наявність усіх UTM/click-id. Якщо в payload їх немає, але є в page_url — витягуємо з query.
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["fbclid", "gclid"];

export function resolveUtm(payload) {
  const utm = {};
  const click = {};
  UTM_KEYS.forEach((k) => (utm[k] = ""));
  CLICK_KEYS.forEach((k) => (click[k] = ""));

  const srcUtm = payload && payload.utm && typeof payload.utm === "object" ? payload.utm : {};
  const srcClick = payload && payload.click_ids && typeof payload.click_ids === "object" ? payload.click_ids : {};
  UTM_KEYS.forEach((k) => { if (typeof srcUtm[k] === "string" && srcUtm[k]) utm[k] = srcUtm[k]; });
  CLICK_KEYS.forEach((k) => { if (typeof srcClick[k] === "string" && srcClick[k]) click[k] = srcClick[k]; });

  // добираємо з page_url
  try {
    if (payload && payload.page_url) {
      const q = new URL(payload.page_url).searchParams;
      UTM_KEYS.forEach((k) => { if (!utm[k] && q.get(k)) utm[k] = q.get(k); });
      CLICK_KEYS.forEach((k) => { if (!click[k] && q.get(k)) click[k] = q.get(k); });
    }
  } catch (e) { /* невалідний URL — ігноруємо */ }

  // обрізаємо довгі значення (захист)
  const cap = (s) => String(s).slice(0, 300);
  UTM_KEYS.forEach((k) => (utm[k] = cap(utm[k])));
  CLICK_KEYS.forEach((k) => (click[k] = cap(click[k])));
  return { utm, click_ids: click };
}

export { UTM_KEYS, CLICK_KEYS };
