// Валідація payload заявки. Усі id-відповідей звіряються з ALLOWED (виведено з quiz-content.json).
import { z } from "zod";
import { ALLOWED } from "./content.js";
import { isValidPhone, isValidUsername, formatPhone } from "./phone.js";

const trimmed = (max) => z.string().trim().max(max);
const inSet = (set, msg) =>
  z.string().refine((v) => set.includes(v), { message: msg });
const arrOfSet = (set, msg) =>
  z.array(z.string()).transform((a) => a || []).refine((a) => a.every((v) => set.includes(v)), { message: msg });

// Схема. Критичні для антиспаму поля (channel, contact) — суворо; решта id — перевірка належності.
const schema = z.object({
  source: z.string().max(40).optional(),
  sphere: inSet(ALLOWED.sphere, "Невідома сфера"),
  sphereLabel: z.string().max(120).optional(),
  sphereOther: trimmed(100).optional().default(""),
  problems: arrOfSet(ALLOWED.problems, "Невідома відповідь (проблеми)").optional().default([]),
  adsOwner: inSet(ALLOWED.adsOwner, "Невідома відповідь (хто веде рекламу)").optional().or(z.literal("")),
  services: arrOfSet(ALLOWED.services, "Невідома відповідь (послуги)").optional().default([]),
  budget: inSet(ALLOWED.budget, "Невідомий бюджет").optional().or(z.literal("")),
  audit: inSet(ALLOWED.audit, "Невідома відповідь (аудит)").optional().or(z.literal("")),
  links: trimmed(1000).optional().default(""),
  channel: inSet(ALLOWED.channel, "Оберіть коректний канал зв’язку"),
  contact: z.string().trim().min(1, "Вкажіть контакт").max(64),
  answersText: z.string().max(4000).optional().default(""),
  utm: z.record(z.string(), z.string()).optional(),
  click_ids: z.record(z.string(), z.string()).optional(),
  page_url: z.string().max(2000).optional().default(""),
  referrer: z.string().max(2000).optional().default(""),
  submitted_at: z.string().max(40).optional().default(""),
  // антиспам / службові
  lead_id: z.string().uuid("Некоректний lead_id"),
  hp: z.string().max(200).optional().default(""),
  started_at: z.string().max(40).optional().default(""),
}).superRefine((data, ctx) => {
  // контакт залежить від каналу
  const ok = data.channel === "tg"
    ? (isValidUsername(data.contact) || isValidPhone(data.contact))
    : isValidPhone(data.contact);
  if (!ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contact"],
      message: data.channel === "tg"
        ? "Вкажіть повний номер у форматі +380 XX XXX XX XX або @username"
        : "Вкажіть повний номер у форматі +380 XX XXX XX XX",
    });
  }
});

export function validateLead(raw) {
  const r = schema.safeParse(raw);
  if (r.success) {
    // нормалізуємо контакт
    const d = r.data;
    const contact = d.channel === "tg" && isValidUsername(d.contact) && !/^[+\d(]/.test(d.contact.trim())
      ? d.contact.trim().replace(/^@?/, "@")
      : formatPhone(d.contact);
    return { ok: true, data: { ...d, contact } };
  }
  const errors = {};
  for (const issue of r.error.issues) {
    const field = issue.path[0] || "form";
    if (!errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

export { schema };
