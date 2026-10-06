// Відправка заявки в Telegram-чат(и) команди. Форматування — у format.js, транспорт — у telegram.js.
// Помилки тут НІКОЛИ не ламають відповідь користувачу: відправка йде у фоні, статус пишемо окремою подією.
import { getTelegramConfig, sendTelegramMessage } from "./telegram.js";
import { formatLeadMessage } from "./format.js";
import { appendStatus, loadPendingLeads } from "./storage.js";

// Надіслати заявку в усі налаштовані чати й записати підсумковий статус (sent/failed).
// opts: { config, send } — для тестів/повторів.
export async function notifyLead(lead, opts = {}) {
  const cfg = opts.config || getTelegramConfig();

  // Не налаштовано — лишаємо заявку pending (її підхопить retry на старті, коли додадуть токен).
  if (!cfg.configured) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[notify] Telegram не налаштовано (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) — заявка лишається pending:", lead.lead_id);
    }
    return { ok: false, skipped: true };
  }

  const { text, replyMarkup } = formatLeadMessage(lead);

  const results = [];
  for (const chatId of cfg.chatIds) {
    const r = await sendTelegramMessage(
      { token: cfg.token, chatId, text, threadId: cfg.threadId, replyMarkup },
      opts.send || {}
    );
    results.push({ chatId, ...r });
  }

  const failed = results.filter((r) => !r.ok);
  const ok = failed.length === 0;
  const status = ok ? "sent" : "failed";
  const error = ok ? "" : failed.map((f) => `${f.chatId}: ${f.error}`).join(" | ");

  if (!opts.skipStatus) {
    try { await appendStatus(lead.lead_id, status, error); }
    catch (e) { console.error("[notify] не вдалося записати статус:", e && e.message); }
  }
  if (!ok && process.env.NODE_ENV !== "production") {
    console.error("[notify] помилка відправки", lead.lead_id, "—", error);
  }
  return { ok, status, results };
}

// Фонова відправка: не чекаємо на Telegram, відповідь користувачу повертається одразу.
export function notifyLeadInBackground(lead, opts = {}) {
  Promise.resolve()
    .then(() => notifyLead(lead, opts))
    .catch((err) => console.error("[notify] непередбачена помилка (фон):", err && err.message));
}

// На старті сервера: заявки за 24 год зі статусом pending/failed — спробувати надіслати повторно.
export async function retryPendingLeads(opts = {}) {
  const cfg = opts.config || getTelegramConfig();
  if (!cfg.configured) return { tried: 0, sent: 0 };

  let pending = [];
  try { pending = await loadPendingLeads(); } catch (e) { return { tried: 0, sent: 0 }; }
  if (!pending.length) return { tried: 0, sent: 0 };

  if (process.env.NODE_ENV !== "production") {
    console.log(`[notify] повторна відправка ${pending.length} заявок (pending/failed за 24 год)`);
  }
  let sent = 0;
  for (const lead of pending) {
    const r = await notifyLead(lead, { ...opts, config: cfg });
    if (r.ok) sent++;
  }
  return { tried: pending.length, sent };
}
