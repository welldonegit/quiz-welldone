import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, rmSync } from "node:fs";

// Ізольований файл заявок (storage читає env динамічно).
const LEADS = join(tmpdir(), `wdq-notify-${process.pid}-${Date.now()}.jsonl`);
process.env.LEADS_FILE = LEADS;
process.env.NODE_ENV = "test";

const { notifyLead, retryPendingLeads } = await import("../server/lib/notify.js");
const { sendTelegramMessage } = await import("../server/lib/telegram.js");
const { appendLead, appendStatus, loadPendingLeads } = await import("../server/lib/storage.js");
const { createApp } = await import("../server/app.js");

const CFG = { token: "SECRET-TOKEN", chatIds: ["111"], threadId: null, configured: true };
const FAST = { delays: [0, 0, 0], timeoutMs: 1000 };

function res(status, json) {
  return { ok: status >= 200 && status < 300, status, json: async () => json };
}
// Послідовність відповідей fetch; остання повторюється. Записує тіла викликів.
function fetchSeq(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  fn.calls = calls;
  return fn;
}

function sampleLead(over = {}) {
  return {
    sphere: "realty", problems: ["leads"], adsOwner: "contractor", services: ["meta"],
    budget: "3-10", audit: "yes-run", links: "", channel: "tg", contact: "@u",
    utm: { utm_source: "fb", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" },
    click_ids: { fbclid: "", gclid: "" },
    page_url: "https://quiz.example/", referrer: "",
    received_at: new Date().toISOString(), received_at_kyiv: "2026-10-06T10:00:00",
    lead_id: randomUUID(), notify_status: "pending",
    ...over,
  };
}
function clear() { try { rmSync(LEADS); } catch (e) {} }
function lines() {
  if (!existsSync(LEADS)) return [];
  return readFileSync(LEADS, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

test("успішна відправка → статус sent (подія у файлі)", async () => {
  clear();
  const fetchImpl = fetchSeq([res(200, { ok: true })]);
  const lead = sampleLead();
  const r = await notifyLead(lead, { config: CFG, send: { ...FAST, fetchImpl } });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  const ev = lines().find((o) => o._t === "notify_status");
  assert.equal(ev.notify_status, "sent");
  assert.equal(ev.lead_id, lead.lead_id);
});

test("кілька chat_id → відправка в кожен", async () => {
  clear();
  const fetchImpl = fetchSeq([res(200, { ok: true })]);
  const cfg = { ...CFG, chatIds: ["111", "222"] };
  const r = await notifyLead(sampleLead(), { config: cfg, send: { ...FAST, fetchImpl } });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 2);
  assert.deepEqual(fetchImpl.calls.map((c) => c.body.chat_id), ["111", "222"]);
});

test("429 → ретрай з retry_after, потім успіх", async () => {
  clear();
  const fetchImpl = fetchSeq([
    res(429, { ok: false, description: "Too Many Requests", parameters: { retry_after: 0 } }),
    res(200, { ok: true }),
  ]);
  const r = await notifyLead(sampleLead(), { config: CFG, send: { ...FAST, fetchImpl } });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 2);
});

test("5xx → ретраї, потім успіх (3-тя спроба)", async () => {
  clear();
  const fetchImpl = fetchSeq([
    res(500, { ok: false, description: "Internal" }),
    res(503, { ok: false, description: "Unavailable" }),
    res(200, { ok: true }),
  ]);
  const r = await notifyLead(sampleLead(), { config: CFG, send: { ...FAST, fetchImpl } });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 3);
});

test("5xx весь час → failed, не більше 4 викликів (1 + 3 ретраї)", async () => {
  clear();
  const fetchImpl = fetchSeq([res(500, { ok: false, description: "Internal" })]);
  const r = await notifyLead(sampleLead(), { config: CFG, send: { ...FAST, fetchImpl } });
  assert.equal(r.ok, false);
  assert.equal(fetchImpl.calls.length, 4);
  assert.equal(lines().find((o) => o._t === "notify_status").notify_status, "failed");
});

test("400 → спрощена версія без HTML, без ретраю", async () => {
  clear();
  const fetchImpl = fetchSeq([
    res(400, { ok: false, description: "Bad Request: can't parse entities" }),
    res(200, { ok: true }),
  ]);
  const r = await notifyLead(sampleLead(), { config: CFG, send: { ...FAST, fetchImpl } });
  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 2);
  // друга спроба — без parse_mode (plain)
  assert.equal(fetchImpl.calls[0].body.parse_mode, "HTML");
  assert.equal(fetchImpl.calls[1].body.parse_mode, undefined);
  assert.doesNotMatch(fetchImpl.calls[1].body.text, /<b>/);
});

test("токен не потрапляє в текст помилки", async () => {
  clear();
  const fetchImpl = fetchSeq([res(400, { ok: false, description: "Bad Request" })]);
  const r = await sendTelegramMessage(
    { token: "SECRET-TOKEN", chatId: "111", text: "<b>hi</b>" },
    { ...FAST, fetchImpl }
  );
  assert.equal(r.ok, false);
  assert.ok(!r.error.includes("SECRET-TOKEN"), "токен не має бути в помилці");
});

test("таймаут (fetch зависає) → failed, без падіння", async () => {
  clear();
  // Стаб поважає AbortController, як справжній fetch: на abort кидає AbortError.
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
    const err = new Error("aborted"); err.name = "AbortError";
    signal.addEventListener("abort", () => reject(err), { once: true });
  });
  const r = await sendTelegramMessage(
    { token: "T", chatId: "111", text: "hi" },
    { delays: [0, 0, 0], timeoutMs: 20, fetchImpl }
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /таймаут/);
});

test("не налаштовано → заявка лишається pending (статус не пишемо)", async () => {
  clear();
  const r = await notifyLead(sampleLead(), { config: { configured: false, chatIds: [] } });
  assert.equal(r.skipped, true);
  assert.equal(lines().filter((o) => o._t === "notify_status").length, 0);
});

test("retryPendingLeads: повторно шле pending/failed за 24 год", async () => {
  clear();
  const sent = sampleLead();
  await appendLead(sent);
  await appendStatus(sent.lead_id, "sent"); // цю більше не чіпаємо
  const pend = sampleLead();
  await appendLead(pend); // лишилась pending
  const fail = sampleLead();
  await appendLead(fail);
  await appendStatus(fail.lead_id, "failed", "timeout");

  const pendingBefore = await loadPendingLeads();
  assert.equal(pendingBefore.length, 2); // pend + fail, не sent

  const fetchImpl = fetchSeq([res(200, { ok: true })]);
  const r = await retryPendingLeads({ config: CFG, send: { ...FAST, fetchImpl } });
  assert.equal(r.tried, 2);
  assert.equal(r.sent, 2);
});

test("фонова відправка не блокує відповідь POST /api/lead", async () => {
  clear();
  process.env.TELEGRAM_BOT_TOKEN = "SECRET-TOKEN";
  process.env.TELEGRAM_CHAT_ID = "111";
  const prevFetch = globalThis.fetch;
  let tgCalled = false;
  let release;
  const gate = new Promise((r) => { release = r; });
  // Перехоплюємо лише виклики до Telegram API (решту — клієнтський POST — пускаємо справжнім fetch).
  // Виклик до Telegram «зависає» до release: якби роут чекав на нього, POST би завис.
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) { tgCalled = true; await gate; return res(200, { ok: true }); }
    return prevFetch(url, init);
  };

  const app = createApp({ seen: new Map() });
  const srv = app.listen(0);
  await new Promise((r) => srv.once("listening", r));
  const { port } = srv.address();

  const payload = {
    source: "quiz_wd_v1", sphere: "realty", problems: ["leads"], adsOwner: "contractor",
    services: ["meta"], budget: "3-10", audit: "yes-run", links: "", channel: "tg",
    contact: "@welldone_user", page_url: "https://quiz.example/",
    lead_id: randomUUID(), started_at: new Date(Date.now() - 60000).toISOString(),
  };
  const r = await fetch(`http://127.0.0.1:${port}/api/lead`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(tgCalled, true, "фонова відправка в Telegram стартувала");

  release(); // відпускаємо фонову відправку, даємо їй завершитись
  await new Promise((r) => setTimeout(r, 30));
  await new Promise((r) => srv.close(r));
  globalThis.fetch = prevFetch;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});
