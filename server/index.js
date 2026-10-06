import { createApp } from "./app.js";
import { loadRecentLeadIds } from "./lib/storage.js";
import { retryPendingLeads } from "./lib/notify.js";

// Необовʼязкове читання .env (якщо є). На cPanel/HostPro змінні задаються в UI застосунку →
// вони вже в process.env, тож тут нічого не зробиться. Не перезаписує вже задані змінні.
try { if (typeof process.loadEnvFile === "function") process.loadEnvFile(); } catch (e) { /* .env немає — ок */ }

// Passenger (cPanel/CloudLinux) передає порт через PORT — це може бути номер АБО шлях до unix-сокета.
// Тому НЕ приводимо до Number: app.listen приймає і число, і рядок-шлях.
const PORT = process.env.PORT || 3001;

// Seed ідемпотентності з файлу (переживає рестарт процесу).
const seen = await loadRecentLeadIds();

const app = createApp({ seen });

app.listen(PORT, () => {
  const mode = process.env.NODE_ENV === "production" ? "production (роздає dist/ + /api)" : "dev (тільки /api + /assets)";
  console.log(`[wd-quiz] сервер запущено (${PORT}) — ${mode}; у памʼяті ${seen.size} lead_id за 24 год`);
});

// Повторна відправка заявок, що не дійшли в Telegram (pending/failed за 24 год). Не блокує старт.
retryPendingLeads().catch((e) => console.error("[notify] retry на старті:", e && e.message));
