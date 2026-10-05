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
      const t = Date.parse(o.received_at);
      if (o.lead_id && !Number.isNaN(t) && now - t < ttlMs) map.set(o.lead_id, t);
    } catch (e) { /* пошкоджений рядок — пропускаємо */ }
  }
  return map;
}
