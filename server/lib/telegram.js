// Низькорівневий клієнт Telegram Bot API (sendMessage) без важких SDK — лише вбудований fetch.
// Таймаут 5 с, ретраї 1→3→9 с, 429 з retry_after, 400 → спрощена версія без HTML.
// Токен НІКОЛИ не потрапляє у фронтенд, логи чи текст помилок (sanitize).

const API = "https://api.telegram.org";
const DEFAULT_DELAYS = [1000, 3000, 9000]; // паузи між повторними спробами (до 3 ретраїв)
const DEFAULT_TIMEOUT = 5000;

// Читання конфігу з env. TELEGRAM_CHAT_ID може містити кілька id через кому.
export function getTelegramConfig(env = process.env) {
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatIds = (env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const threadId = (env.TELEGRAM_THREAD_ID || "").trim() || null;
  return { token, chatIds, threadId, configured: Boolean(token && chatIds.length) };
}

// Екранування для parse_mode: "HTML" — лише & < > (решту Telegram дозволяє).
export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// HTML → простий текст для fallback-повідомлення (прибрати теги, повернути символи).
export function htmlToPlain(html) {
  return String(html)
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Приховати токен у будь-якому рядку-помилці.
function sanitize(token, msg) {
  const s = String(msg == null ? "" : msg);
  return token ? s.split(token).join("***") : s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Один HTTP-виклик sendMessage із таймаутом. Повертає нормалізований результат.
async function callOnce(fetchImpl, token, params, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* не JSON — лишаємо null */ }
    if (res.ok && json && json.ok) return { ok: true };
    const desc = (json && json.description) || `HTTP ${res.status}`;
    return {
      ok: false,
      status: res.status,
      error: desc,
      retryAfter: json && json.parameters && json.parameters.retry_after,
    };
  } catch (e) {
    const timeout = e && e.name === "AbortError";
    return { ok: false, status: 0, error: timeout ? `таймаут ${timeoutMs} мс` : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Надіслати одне повідомлення в один чат. Сам керує ретраями та fallback.
// opts: { fetchImpl, delays, timeoutMs } — для тестів.
export async function sendTelegramMessage(
  { token, chatId, text, threadId = null, replyMarkup = null },
  opts = {}
) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const delays = opts.delays || DEFAULT_DELAYS;
  const timeoutMs = opts.timeoutMs == null ? DEFAULT_TIMEOUT : opts.timeoutMs;

  const base = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId) base.message_thread_id = threadId;
  if (replyMarkup) base.reply_markup = replyMarkup;

  let retries = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await callOnce(fetchImpl, token, base, timeoutMs);
    if (r.ok) return { ok: true, fallback: false };

    // 400 — помилка формату: не ретраїмо, шлемо спрощену версію без HTML.
    if (r.status === 400) {
      const plain = { chat_id: chatId, text: htmlToPlain(text), disable_web_page_preview: true };
      if (threadId) plain.message_thread_id = threadId;
      if (replyMarkup) plain.reply_markup = replyMarkup; // кнопки не залежать від parse_mode
      const r2 = await callOnce(fetchImpl, token, plain, timeoutMs);
      if (r2.ok) return { ok: true, fallback: true };
      return { ok: false, error: sanitize(token, r2.error) };
    }

    if (retries >= delays.length) {
      return { ok: false, error: sanitize(token, r.error) };
    }
    // 429 — чекаємо стільки, скільки просить Telegram; інакше — бекоф 1→3→9 с.
    let wait = delays[retries];
    if (r.status === 429 && typeof r.retryAfter === "number") wait = r.retryAfter * 1000;
    retries++;
    if (wait > 0) await sleep(wait);
  }
}

export { DEFAULT_DELAYS };
