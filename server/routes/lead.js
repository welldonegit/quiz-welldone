import { Router } from "express";
import { validateLead } from "../lib/validate.js";
import { resolveUtm } from "../lib/utm.js";
import { appendLead } from "../lib/storage.js";
import { notifyLeadInBackground } from "../lib/notify.js";

const MIN_FILL_MS = 5000;     // швидше 5 с від старту квіза — вважаємо ботом
const DEDUPE_TTL = 24 * 60 * 60 * 1000;

function kyivTime(date) {
  // "YYYY-MM-DD HH:mm:ss" у Europe/Kyiv
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
  return p.replace(" ", "T").replace(",", "");
}

// seen — Map<lead_id, timestamp> для ідемпотентності (seed з файлу при старті).
export function createLeadRouter({ seen = new Map() } = {}) {
  const router = Router();

  const prune = () => {
    const now = Date.now();
    for (const [id, t] of seen) if (now - t > DEDUPE_TTL) seen.delete(id);
  };

  router.post("/lead", async (req, res) => {
    try {
      const body = req.body || {};

      // 1) honeypot — приховане поле заповнене лише ботами → тихий успіх, нічого не зберігаємо
      if (typeof body.hp === "string" && body.hp.trim() !== "") {
        return res.status(200).json({ ok: true });
      }

      // 2) занадто швидке заповнення → бот → тихий успіх
      const started = Date.parse(body.started_at);
      if (!Number.isNaN(started) && Date.now() - started < MIN_FILL_MS) {
        return res.status(200).json({ ok: true });
      }

      // 3) валідація
      const v = validateLead(body);
      if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
      const data = v.data;

      // 4) ідемпотентність
      prune();
      if (seen.has(data.lead_id)) {
        return res.status(200).json({ ok: true, duplicate: true, lead_id: data.lead_id });
      }

      // 5) UTM (добір із page_url)
      const { utm, click_ids } = resolveUtm(body);

      const now = new Date();
      const record = {
        ...data,
        hp: undefined,
        utm,
        click_ids,
        received_at: now.toISOString(),
        received_at_kyiv: kyivTime(now),
        ip: req.ip,
        user_agent: req.get("user-agent") || "",
        notify_status: "pending",
      };
      delete record.hp;

      // 6) збереження (страховка — перед нотифікацією)
      await appendLead(record);
      seen.set(data.lead_id, Date.now());

      // 7) нотифікація — у фоні: користувач не чекає на Telegram, відповідь повертаємо одразу
      notifyLeadInBackground(record);

      return res.status(200).json({ ok: true, lead_id: data.lead_id });
    } catch (err) {
      console.error("[/api/lead] помилка:", err);
      return res.status(500).json({ ok: false });
    }
  });

  return router;
}
