// Допоміжний скрипт: викликає getUpdates і виводить chat_id та thread_id останніх чатів,
// де писали боту. Напишіть щось боту (або додайте його в групу й напишіть) — потім запустіть.
//   npm run tg:chatid
import { getTelegramConfig } from "../server/lib/telegram.js";

const { token } = getTelegramConfig();
if (!token) {
  console.error("✖ Немає TELEGRAM_BOT_TOKEN у .env");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();
if (!data.ok) {
  console.error("✖ Telegram помилка:", data.description || res.status);
  process.exit(1);
}

if (!data.result.length) {
  console.log("Немає оновлень. Напишіть щось боту (у приваті або в групі) і запустіть знову.");
  console.log("Підказка: для груп з темами напишіть у потрібну тему, щоб отримати thread_id.");
  process.exit(0);
}

const seen = new Map();
for (const upd of data.result) {
  const msg = upd.message || upd.channel_post || upd.my_chat_member || {};
  const chat = msg.chat;
  if (!chat) continue;
  const key = `${chat.id}:${msg.message_thread_id || ""}`;
  if (seen.has(key)) continue;
  seen.set(key, {
    chat_id: chat.id,
    type: chat.type,
    name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || (chat.username ? "@" + chat.username : ""),
    thread_id: msg.message_thread_id || "",
  });
}

console.log("Знайдені чати (останні оновлення):\n");
for (const c of seen.values()) {
  console.log(`• ${c.name || "(без назви)"} [${c.type}]`);
  console.log(`    TELEGRAM_CHAT_ID=${c.chat_id}`);
  if (c.thread_id) console.log(`    TELEGRAM_THREAD_ID=${c.thread_id}`);
  console.log("");
}
console.log("Скопіюйте потрібний chat_id (і thread_id для груп з темами) у .env.");
