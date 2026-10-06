// Збереження заявок у data/leads.jsonl (append, без БД). Страховка: жодна заявка не губиться.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_FILE = fileURLToPath(new URL("../../data/leads.jsonl", import.meta.url));
export const leadsFile = () => process.env.LEADS_FILE || DEFAULT_FILE;

async function ensureDir(file) {
  await mkdir(dirname(file), { recursive: true });
}

// Атомарний дозапис одного рядка JSON (append не блокує event loop).
export async function appendLead(record) {
  const file = leadsFile();
  await ensureDir(file);
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
  return record;
}

// Для ідемпотентності після рестарту: зчитати lead_id за останні ttlMs.
export async function loadRecentLeadIds(ttlMs = 24 * 60 * 60 * 1000) {
  const file = leadsFile();
  const map = new Map();
  let text;
  try { text = await readFile(file, "utf8"); } catch (e) { return map; }
  const now = Date.now();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o._t) continue; // службові події (статус нотифікації) — не заявки
      const t = Date.parse(o.received_at);
      if (o.lead_id && !Number.isNaN(t) && now - t < ttlMs) map.set(o.lead_id, t);
    } catch (e) { /* пошкоджений рядок — пропускаємо */ }
  }
  return map;
}

// Дозаписати подію зміни статусу нотифікації (sent/failed) окремим рядком —
// без переписування всього файлу. Поточний статус = остання подія для lead_id.
export async function appendStatus(lead_id, notify_status, error = "") {
  return appendLead({ _t: "notify_status", lead_id, notify_status, error: error || "", at: new Date().toISOString() });
}

// Заявки за останні ttlMs, чий актуальний статус нотифікації — pending або failed
// (для повторної відправки після падіння/рестарту). Повертає повні записи заявок.
export async function loadPendingLeads(ttlMs = 24 * 60 * 60 * 1000) {
  const file = leadsFile();
  let text;
  try { text = await readFile(file, "utf8"); } catch (e) { return []; }
  const now = Date.now();
  const leads = new Map();     // lead_id -> останній повний запис заявки
  const statuses = new Map();  // lead_id -> { status, at } — остання подія статусу
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch (e) { continue; }
    if (!o.lead_id) continue;
    if (o._t === "notify_status") {
      const at = Date.parse(o.at) || 0;
      const prev = statuses.get(o.lead_id);
      if (!prev || at >= prev.at) statuses.set(o.lead_id, { status: o.notify_status, at });
      continue;
    }
    const t = Date.parse(o.received_at);
    if (Number.isNaN(t) || now - t >= ttlMs) continue;
    leads.set(o.lead_id, o);
  }
  const out = [];
  for (const [id, rec] of leads) {
    const st = statuses.get(id);
    const status = st ? st.status : (rec.notify_status || "pending");
    if (status === "pending" || status === "failed") out.push(rec);
  }
  return out;
}
