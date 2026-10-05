// Відправка сповіщення про заявку. ЕТАП 2: тут буде інтеграція з Telegram.
// Зараз — заглушка: лише логує в dev і повертає статус. Помилки тут не мають ламати відповідь користувачу.
export async function notifyLead(lead) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[notify:stub] нова заявка", {
      lead_id: lead.lead_id,
      sphere: lead.sphere,
      channel: lead.channel,
      contact: lead.contact,
    });
  }
  // Місце для етапу 2:
  //   const token = process.env.TELEGRAM_BOT_TOKEN;
  //   const chatId = process.env.TELEGRAM_CHAT_ID;
  //   await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { ... });
  return { ok: true, provider: "stub" };
}
