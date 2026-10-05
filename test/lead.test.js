import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, rmSync } from "node:fs";

// Ізольований файл заявок для тестів (до імпорту app, бо storage читає env динамічно).
const LEADS = join(tmpdir(), `wdq-test-${process.pid}-${Date.now()}.jsonl`);
process.env.LEADS_FILE = LEADS;
process.env.NODE_ENV = "test";

const { createApp } = await import("../server/app.js");

function startServer(seen = new Map()) {
  const app = createApp({ seen });
  return new Promise((resolve) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address();
      resolve({
        port,
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => srv.close(r)),
      });
    });
  });
}

function post(base, body) {
  return fetch(base + "/api/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPayload(over = {}) {
  return {
    source: "quiz_wd_v1",
    sphere: "realty",
    sphereLabel: "Нерухомість і будівництво",
    problems: ["leads", "cac"],
    adsOwner: "contractor",
    services: ["meta", "google"],
    budget: "3-10",
    audit: "yes-run",
    links: "site.com.ua",
    channel: "tg",
    contact: "@welldone_user",
    utm: { utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" },
    click_ids: { fbclid: "", gclid: "" },
    page_url: "https://quiz.example/",
    lead_id: randomUUID(),
    hp: "",
    started_at: new Date(Date.now() - 60000).toISOString(),
    ...over,
  };
}

function readLines() {
  if (!existsSync(LEADS)) return [];
  return readFileSync(LEADS, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function clearLeads() { try { rmSync(LEADS); } catch (e) {} }

test("валідна заявка → 200 ok і запис у файл", async () => {
  clearLeads();
  const s = await startServer();
  const r = await post(s.base, validPayload());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(j.lead_id);
  const lines = readLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].sphere, "realty");
  assert.equal(lines[0].notify_status, "pending");
  assert.ok(lines[0].received_at && lines[0].received_at_kyiv);
  assert.equal(lines[0].hp, undefined);
  await s.close();
});

test("невалідний телефон (viber) → 400 з помилкою поля contact", async () => {
  clearLeads();
  const s = await startServer();
  const r = await post(s.base, validPayload({ channel: "viber", contact: "067123" }));
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.ok(j.errors.contact);
  assert.equal(readLines().length, 0);
  await s.close();
});

test("невідомий id відповіді → 400", async () => {
  clearLeads();
  const s = await startServer();
  const r = await post(s.base, validPayload({ problems: ["leads", "hacking"] }));
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.ok(j.errors.problems);
  await s.close();
});

test("honeypot заповнений → 200, нічого не збережено", async () => {
  clearLeads();
  const s = await startServer();
  const r = await post(s.base, validPayload({ hp: "я бот" }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(readLines().length, 0);
  await s.close();
});

test("занадто швидке заповнення (<5с) → 200, нічого не збережено", async () => {
  clearLeads();
  const s = await startServer();
  const r = await post(s.base, validPayload({ started_at: new Date().toISOString() }));
  assert.equal(r.status, 200);
  assert.equal(readLines().length, 0);
  await s.close();
});

test("дубль lead_id → duplicate:true, збережено лише раз", async () => {
  clearLeads();
  const s = await startServer();
  const p = validPayload();
  const r1 = await post(s.base, p);
  assert.equal(r1.status, 200);
  const r2 = await post(s.base, p);
  assert.equal(r2.status, 200);
  const j2 = await r2.json();
  assert.equal(j2.duplicate, true);
  assert.equal(readLines().length, 1);
  await s.close();
});

test("rate limit: 6-та заявка за вікно → 429", async () => {
  clearLeads();
  const s = await startServer();
  let last;
  for (let i = 0; i < 6; i++) last = await post(s.base, validPayload());
  assert.equal(last.status, 429);
  const j = await last.json();
  assert.equal(j.ok, false);
  assert.ok(j.message);
  await s.close();
});

test("UTM витягуються з page_url, якщо їх немає в payload", async () => {
  clearLeads();
  const s = await startServer();
  const p = validPayload({
    utm: undefined,
    click_ids: undefined,
    page_url: "https://quiz.example/?utm_source=facebook&utm_medium=cpc&utm_campaign=test_quiz&utm_content=ad1&utm_term=marketing&fbclid=abc123",
  });
  const r = await post(s.base, p);
  assert.equal(r.status, 200);
  const rec = readLines().pop();
  assert.equal(rec.utm.utm_source, "facebook");
  assert.equal(rec.utm.utm_campaign, "test_quiz");
  assert.equal(rec.utm.utm_term, "marketing");
  assert.equal(rec.click_ids.fbclid, "abc123");
  await s.close();
});

test("Telegram приймає username, call — лише телефон", async () => {
  clearLeads();
  const s = await startServer();
  const r1 = await post(s.base, validPayload({ channel: "tg", contact: "welldone_user" }));
  assert.equal(r1.status, 200);
  const r2 = await post(s.base, validPayload({ channel: "call", contact: "@username" }));
  assert.equal(r2.status, 400);
  await s.close();
});

test("нормалізація телефону 0671234567 → +380 67 123 45 67", async () => {
  clearLeads();
  const s = await startServer();
  const r = await post(s.base, validPayload({ channel: "viber", contact: "0671234567" }));
  assert.equal(r.status, 200);
  assert.equal(readLines().pop().contact, "+380 67 123 45 67");
  await s.close();
});
