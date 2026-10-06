// Надіслати тестове повідомлення з фейковою заявкою (з усіма UTM) у чат(и) з .env —
// щоб перевірити токен і chat_id (і thread_id).  npm run tg:test
import { getTelegramConfig, sendTelegramMessage } from "../server/lib/telegram.js";
import { formatLeadMessage } from "../server/lib/format.js";

const cfg = getTelegramConfig();
if (!cfg.configured) {
  console.error("✖ Заповніть TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID у .env");
  process.exit(1);
}

// Час у Києві у форматі, який очікує formatLeadMessage ("YYYY-MM-DDTHH:mm:ss").
const kyiv = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date()).replace(" ", "T");

const fakeLead = {
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
  page_url: "https://quiz.well-done.com.ua/?utm_source=facebook&utm_medium=cpc",
  referrer: "https://www.facebook.com/",
  received_at_kyiv: kyiv,
  lead_id: "test-0000-0000-0000-000000000000",
};

const { text, replyMarkup } = formatLeadMessage(fakeLead);
console.log("─── Текст повідомлення ───");
console.log(text);
console.log("──────────────────────────\n");

let allOk = true;
for (const chatId of cfg.chatIds) {
  const r = await sendTelegramMessage({ token: cfg.token, chatId, text, threadId: cfg.threadId, replyMarkup });
  if (r.ok) console.log(`✓ chat ${chatId}${cfg.threadId ? " (thread " + cfg.threadId + ")" : ""} — надіслано${r.fallback ? " (fallback без HTML)" : ""}`);
  else { allOk = false; console.error(`✗ chat ${chatId} — ${r.error}`); }
}
process.exit(allOk ? 0 : 1);
