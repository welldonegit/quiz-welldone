/* well done quiz — незалежний компонент (vanilla ES-module).
   Два режими: вбудована секція <div data-wd-quiz> та повноекранна модалка (кнопки data-wd-quiz-open).
   Конфіг: window.WDQ_CONFIG або QUIZ_CONFIG нижче. Контент — із wd-quiz-content.js (джерело: content/quiz-content.json). */

import { CONTENT } from "./wd-quiz-content.js";
import { ICONS } from "./wd-quiz-icons.js";
import { normalizeUaDigits, isKnownOperatorCode, isValidUaMobile } from "../shared/ua-mobile-codes.js";
import { track } from "./analytics.js";

// Підказка про код оператора (жива валідація телефону)
const OP_HINT = "Перевірте код оператора. Номер має починатися, наприклад, з 050, 067, 073, 093";

/* ───────────────────────── КОНФІГ ───────────────────────── */
export const QUIZ_CONFIG = Object.assign(
  {
    // Куди надсилати заявку (POST JSON) — відносний шлях до Node-бекенду (той самий origin).
    submitUrl: "/api/lead",
    requestTimeoutMs: 10000, // таймаут запиту; при мережевій помилці — одна повторна спроба
    storageKey: "wdq_state_v1",
    storageTtlMs: 24 * 60 * 60 * 1000, // 24 год
    autoAdvanceMs: 380,
    debug: false,
    assetsBase: "/assets/", // шлях до фото/лого (той самий origin). Можна перевизначити для drop-in.
  },
  (typeof window !== "undefined" && window.WDQ_CONFIG) || {}
);

/* ───────────────────────── ДАНІ (з CONTENT) ───────────────────────── */
const C = CONTENT;
const ORDER = C.meta.flowOrder;
const PN = C.meta.progressIndex;
const TOTAL = C.meta.totalProgressSteps;
const SPH = C.sphereShortLabels;
const Q = C.questions;
const CH = C.contact.channels;
const CASES = C.cases.sets;
const SPHERE_TO_SET = C.cases.sphereToSet;

function find(qid, oid) {
  const q = Q[qid];
  if (!q) return null;
  return q.opts.find((o) => o.id === oid) || null;
}

/* ───────────────────────── ХЕЛПЕРИ ───────────────────────── */
const genUuid = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  // запасний варіант (RFC4122 v4)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const iconBase = (path) => String(path || "").split("/").pop().replace(/\.svg$/, "");
const icon = (path, cls = "") => {
  const inner = ICONS[iconBase(path)] || "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
};
// стрілка «далі»
const ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const ARROW_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`;
const CHEVRON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;
const CHECK = (w = 12, sw = 3.5) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const INFO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5h.01"/></svg>`;
const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13.5a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>`;
const PLAN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>`;

const asset = (rel) => {
  // rel у контенті: "assets/images/oleh.jpg" → базуємо на assetsBase
  const name = String(rel || "").replace(/^assets\//, "");
  return QUIZ_CONFIG.assetsBase + name;
};
// WebP-варіант для <picture> (assets/images/webp/<name>.webp)
const assetWebp = (rel) => {
  const base = String(rel || "").split("/").pop().replace(/\.(jpe?g|png)$/i, ".webp");
  return QUIZ_CONFIG.assetsBase + "images/webp/" + base;
};
const picture = (rel, alt, imgAttrs = "") => {
  return `<picture><source type="image/webp" srcset="${esc(assetWebp(rel))}"><img src="${esc(asset(rel))}" alt="${esc(alt)}" ${imgAttrs}></picture>`;
};

const log = (...a) => { if (QUIZ_CONFIG.debug) console.log("[wd-quiz]", ...a); };

/* Аналітика: track(event, params) живе в ./analytics.js (лише dataLayer.push для GTM).
   Відповідність внутрішнього кроку → крок воронки (step_name) та його номер (step_number).
   За цими назвами й номерами маркетолог будує воронку в GTM/GA4. */
const STEP_MAP = {
  start: { name: "start", number: 1 },
  q1:    { name: "q1_sphere", number: 2 },
  cases: { name: "cases", number: 3 },
  q2:    { name: "q2_problem", number: 4 },
  q3:    { name: "q3_ads_owner", number: 5 },
  q4:    { name: "q4_services", number: 6 },
  q5:    { name: "q5_budget", number: 7 },
  q6:    { name: "q6_audit", number: 8 },
  links: { name: "links", number: 9 },
  q7:    { name: "q7_channel", number: 10 },
  q8:    { name: "q8_contact", number: 11 },
  done:  { name: "thanks", number: 12 },
};
const stepName = (s) => (STEP_MAP[s] ? STEP_MAP[s].name : s);
const stepNumber = (s) => (STEP_MAP[s] ? STEP_MAP[s].number : 0);

// Ідемпотентність generate_lead: один раз на lead_id (захист від подвійного кліку/повтору запиту).
const GENERATED_LEADS = new Set();

/* маска телефону: +380 XX XXX XX XX */
function fmtPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.indexOf("380") !== 0) {
    if (d.indexOf("80") === 0) d = "3" + d;
    else if (d.indexOf("0") === 0) d = "38" + d;
    else if ("380".indexOf(d) === 0) d = "380";
    else d = "380" + d;
  }
  d = d.slice(3, 12);
  let out = "+380";
  if (d.length) out += " " + d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += " " + d.slice(5, 7);
  if (d.length > 7) out += " " + d.slice(7, 9);
  return d.length ? out : "+380 ";
}

/* UTM + click id — зчитати при першому заході, зберегти у sessionStorage */
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const CLICK_KEYS = ["fbclid", "gclid"];
function captureUtm() {
  const empty = () => {
    const u = {}; UTM_KEYS.forEach((k) => (u[k] = "")); const c = {}; CLICK_KEYS.forEach((k) => (c[k] = "")); return { utm: u, click_ids: c };
  };
  if (typeof window === "undefined") return empty();
  const SKEY = "wdq_utm_v1";
  try {
    const stored = sessionStorage.getItem(SKEY);
    const params = new URLSearchParams(window.location.search);
    const base = stored ? JSON.parse(stored) : empty();
    let changed = false;
    UTM_KEYS.forEach((k) => { const v = params.get(k); if (v && !base.utm[k]) { base.utm[k] = v; changed = true; } });
    CLICK_KEYS.forEach((k) => { const v = params.get(k); if (v && !base.click_ids[k]) { base.click_ids[k] = v; changed = true; } });
    if (changed || !stored) sessionStorage.setItem(SKEY, JSON.stringify(base));
    return base;
  } catch (e) { return empty(); }
}

/* ───────────────────────── КЛАС КВІЗУ ───────────────────────── */
class WDQuiz {
  constructor(root, opts = {}) {
    this.root = root;
    this.mode = opts.mode || "embed"; // 'embed' | 'modal'
    this.utm = captureUtm();
    this.started = false;
    this.submitting = false;
    this.netError = "";
    this.state = this.load() || { step: "start", a: { q2: [], q4: [] }, contact: "", links: "", otherText: "", err: false, caseIdx: 0 };
    if (!this.state.a) this.state.a = { q2: [], q4: [] };
    // Антиспам/ідемпотентність: один lead_id і час старту на заявку (переживають reload, скидаються після успіху).
    if (!this.state.lead_id) this.state.lead_id = genUuid();
    if (!this.state.started_at) this.state.started_at = new Date().toISOString();
    this.state.hp = "";
    if (!this.state.tgMode) this.state.tgMode = "phone"; // спосіб контакту для Telegram: phone | username
    this.serverErr = null;
    this.dir = "fwd";      // напрямок анімації екрана
    this.animate = true;   // анімувати лише перший показ і переходи між кроками
    this.save();

    this.root.classList.add("wdq");
    if (this.mode === "embed") this.root.classList.add("wdq--embed");

    this.render();
    track("quiz_step", { step_name: stepName(this.state.step), step_number: stepNumber(this.state.step) });
    if (this.state.step !== "start") this.started = true;
  }

  destroy() { clearTimeout(this.t); }

  /* ───── storage ───── */
  load() {
    try {
      const raw = localStorage.getItem(QUIZ_CONFIG.storageKey);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !o.ts || Date.now() - o.ts > QUIZ_CONFIG.storageTtlMs) {
        localStorage.removeItem(QUIZ_CONFIG.storageKey);
        return null;
      }
      if (o.step === "done") return null; // після успіху не відновлюємо
      return o.state;
    } catch (e) { return null; }
  }
  save() {
    try {
      localStorage.setItem(QUIZ_CONFIG.storageKey, JSON.stringify({ ts: Date.now(), step: this.state.step, state: this.state }));
    } catch (e) { /* приватний режим тощо */ }
  }
  clearStore() { try { localStorage.removeItem(QUIZ_CONFIG.storageKey); } catch (e) {} }

  /* ───── навігація ───── */
  go(step, dir = "fwd") {
    clearTimeout(this.t);
    this.dir = dir;        // напрямок переходу для анімації (fwd/back)
    this.animate = true;   // анімуємо зміну кроку
    const prev = this.state.step;
    this.state.step = step;
    this.state.err = false;
    this.netError = "";
    if (step === "cases") this.state.caseIdx = 0;

    // маска: підставляємо +380 при вході на крок контакту (крім режиму username у Telegram)
    if (step === "q8" && !this.isUsernameMode()) {
      const cur = this.state.contact || "";
      if (!cur.replace(/\D/g, "").length || /^@/.test(cur)) this.state.contact = "+380 ";
    }

    if (!this.started && step !== "start") { this.started = true; track("quiz_start", {}); }
    this.save();
    this.render();
    // показ кожного екрана (включно з cases і thanks); повторний показ після «Назад» теж
    track("quiz_step", { step_name: stepName(step), step_number: stepNumber(step) });
    const sc = this.root.querySelector(".wdq-scroll");
    if (sc) sc.scrollTop = 0;

    // автофокус на текстові кроки
    if (step === "q8") this.focusContact();
    else if (step === "links") { const t = this.root.querySelector(".wdq-textarea"); if (t) setTimeout(() => t.focus(), 30); }
    else if (prev !== step && step === "q1") { /* нічого */ }
  }
  next() {
    const step = this.state.step;
    // множинний вибір: відповідь надсилаємо при «Далі» (а не на кожному кліку), id через кому
    if (Q[step] && Q[step].multi) {
      track("quiz_answer", { step_name: stepName(step), answer: (this.state.a[step] || []).join(",") });
    } else if (step === "links") {
      // крок links: заповнено чи пропущено (самі посилання в dataLayer не передаємо)
      track("quiz_answer", { step_name: stepName(step), answer: (this.state.links || "").trim() ? "filled" : "skipped" });
    }
    const i = ORDER.indexOf(step);
    if (i < ORDER.length - 1) this.go(ORDER[i + 1], "fwd");
  }
  back() { track("quiz_back", { step_name: stepName(this.state.step) }); const i = ORDER.indexOf(this.state.step); if (i > 0) this.go(ORDER[i - 1], "back"); }

  focusContact() {
    setTimeout(() => {
      const inp = this.root.querySelector(".wdq-field input");
      if (inp) inp.focus();
    }, 40);
  }

  pick(qid, oid) {
    const q = Q[qid];
    const a = this.state.a;
    if (q.multi) {
      let cur = (a[qid] || []).slice();
      if (oid === "rec") {
        cur = cur.indexOf("rec") >= 0 ? [] : ["rec"]; // виключний варіант
      } else {
        cur = cur.filter((x) => x !== "rec");
        const k = cur.indexOf(oid);
        if (k >= 0) cur.splice(k, 1); else cur.push(oid);
      }
      a[qid] = cur;
      // множинний вибір: quiz_answer надсилаємо при «Далі» (у next()), не на кожному кліку
      this.save();
      this.syncAfterPick(qid); // точкове оновлення без перебудови екрана (без смикання)
    } else {
      const prev = a[qid];
      a[qid] = oid;
      // одиночний вибір: відповідь при кліку (для «Інша сфера» answer = "other", текст не передаємо)
      track("quiz_answer", { step_name: stepName(qid), answer: oid });
      this.save();
      const opt = find(qid, oid);
      // q1 «Інша сфера»: показ/приховання поля вводу змінює розмітку → потрібен повний (але без анімації) рендер
      if (qid === "q1" && (oid === "other" || prev === "other")) {
        this.render();
        if (oid === "other") { const inp = this.root.querySelector("#wdq-other"); if (inp) setTimeout(() => inp.focus(), 30); }
      } else {
        this.syncAfterPick(qid);
      }
      if (q.auto && !(opt && opt.custom)) {
        clearTimeout(this.t);
        this.t = setTimeout(() => this.next(), QUIZ_CONFIG.autoAdvanceMs);
      }
    }
  }

  // Точкове оновлення стану відповідей і кнопки «Далі» без повного ререндеру екрана.
  syncAfterPick(qid) {
    const q = Q[qid];
    const a = this.state.a;
    const r = this.root;
    r.querySelectorAll(".wdq-opt[data-pick]").forEach((btn) => {
      const id = btn.getAttribute("data-pick");
      const on = q.multi ? (a[qid] || []).indexOf(id) >= 0 : a[qid] === id;
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    const answered = q.multi ? (a[qid] || []).length > 0 : !!a[qid];
    const note = answered ? "" : q.multi ? "Оберіть хоча б один варіант" : "Оберіть варіант відповіді";
    // mobile: липкий футер
    const fCta = r.querySelector(".wdq-footer .wdq-cta");
    if (fCta) fCta.disabled = !answered;
    this._setNote(r.querySelector(".wdq-footer"), note, "append");
    // desktop: внутрішня навігація
    const dCta = r.querySelector(".wdq-nav-d .wdq-cta-d");
    if (dCta) dCta.disabled = !answered;
    this._setNote(r.querySelector(".wdq-nav-d-right"), note, "prepend");
  }

  _setNote(container, text, pos) {
    if (!container) return;
    let el = Array.prototype.find.call(container.children, (c) => c.classList && c.classList.contains("wdq-cta-note"));
    if (text) {
      if (!el) { el = document.createElement("span"); el.className = "wdq-cta-note"; pos === "prepend" ? container.prepend(el) : container.appendChild(el); }
      el.textContent = text;
    } else if (el) {
      el.remove();
    }
  }

  setContact(v, { live } = {}) {
    const ch = this.state.a.q7 || "tg";
    const raw = String(v || "");
    const t = raw.trim();
    const isHandle = ch === "tg" && t.length > 0 && !/^[+\d(]/.test(t);
    this.state.contact = isHandle ? raw : t.length ? fmtPhone(raw) : "";
    this.state.err = false;
    this.save();
  }

  valid() {
    const v = (this.state.contact || "").trim();
    const ch = this.state.a.q7 || "tg";
    if (ch === "tg" && (this.state.tgMode || "phone") === "username") {
      return /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v);
    }
    return isValidUaMobile(v); // 12 цифр + код мобільного оператора зі списку
  }
  // чи поле працює в режимі username (без маски телефону)
  isUsernameMode() {
    return (this.state.a.q7 || "tg") === "tg" && (this.state.tgMode || "phone") === "username";
  }

  // Показ/зняття помилки поля контакту без повного ререндеру (для живої валідації).
  _showContactError(msg) {
    const r = this.root;
    const field = r.querySelector(".wdq-field");
    if (field) field.classList.add("wdq-field--err");
    const inp = r.querySelector(".wdq-field input");
    if (inp) { inp.setAttribute("aria-invalid", "true"); inp.setAttribute("aria-describedby", "wdq-err"); }
    let el = r.querySelector("#wdq-err");
    if (!el) {
      el = document.createElement("p");
      el.id = "wdq-err"; el.className = "wdq-err-msg"; el.setAttribute("role", "alert");
      const block = r.querySelector(".wdq-contact-block");
      const hp = r.querySelector(".wdq-hp");
      if (block) block.insertBefore(el, hp ? hp.nextSibling : (field ? field.nextSibling : null));
    }
    el.textContent = msg;
  }
  _clearContactError() {
    const r = this.root;
    const field = r.querySelector(".wdq-field"); if (field) field.classList.remove("wdq-field--err");
    const el = r.querySelector("#wdq-err"); if (el) el.remove();
    const inp = r.querySelector(".wdq-field input"); if (inp) { inp.removeAttribute("aria-invalid"); inp.removeAttribute("aria-describedby"); }
  }

  // Параметри generate_lead (без персональних даних: лише id/категорії та лічильники).
  leadParams() {
    const a = this.state.a;
    return {
      contact_method: a.q7 || "",                              // tg|viber|wa|call
      business_sphere: a.q1 || "",                             // id сфери (для «Інша» — "other", без тексту)
      ad_budget: a.q5 || "",                                   // id бюджету
      services_count: (a.q4 || []).length,                     // число обраних послуг
      audit_type: a.q6 || "",                                  // id відповіді q6
      links_provided: (this.state.links || "").trim() ? "yes" : "no",
    };
  }

  async submit() {
    if (this.submitting) return; // подвійна відправка неможлива
    if (!this.valid()) {
      this.state.err = true; this.serverErr = null;
      track("quiz_submit_error", { error_type: "validation" });
      this.render();
      return;
    }
    this.submitting = true;
    this.netError = "";
    this.serverErr = null;
    this.render();
    const payload = this.buildPayload();

    let res;
    try {
      res = await this.send(payload); // таймаут + одна повторна спроба при мережевій помилці
    } catch (err) {
      this.submitting = false;
      this.netError = "Не вдалося надіслати. Спробуйте ще раз";
      track("quiz_submit_error", { error_type: "network" });
      this.render();
      return;
    }

    if (res.ok) {
      let data = {};
      try { data = await res.json(); } catch (e) {}
      this.submitting = false;
      this.clearStore();
      // generate_lead — лише при 200 {ok:true} і один раз на lead_id (без дублів)
      if (data && data.ok === true && !GENERATED_LEADS.has(this.state.lead_id)) {
        GENERATED_LEADS.add(this.state.lead_id);
        track("generate_lead", this.leadParams());
      }
      this.go("done");
      return;
    }

    this.submitting = false;
    if (res.status === 400) {
      let data = {};
      try { data = await res.json(); } catch (e) {}
      const errs = data.errors || {};
      this.serverErr = errs.contact || Object.values(errs)[0] || null;
      this.state.err = true; // підсвітити поле контакту
      track("quiz_submit_error", { error_type: "validation" });
      this.render();
      this.focusContact();
    } else if (res.status === 429) {
      let data = {};
      try { data = await res.json(); } catch (e) {}
      this.netError = data.message || "Забагато спроб. Спробуйте за кілька хвилин.";
      track("quiz_submit_error", { error_type: "rate_limit" });
      this.render();
    } else {
      this.netError = "Не вдалося надіслати. Спробуйте ще раз";
      track("quiz_submit_error", { error_type: "server" });
      this.render();
    }
  }

  async send(payload) {
    const once = async () => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), QUIZ_CONFIG.requestTimeoutMs || 10000);
      try {
        return await fetch(QUIZ_CONFIG.submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(to);
      }
    };
    try {
      return await once();
    } catch (err) {
      // мережева помилка/таймаут → одна повторна спроба з тим самим lead_id
      log("retry submit after:", (err && err.message) || err);
      return await once();
    }
  }

  /* ───── payload ───── */
  sphereLabel() {
    const sph = this.state.a.q1 || "";
    const other = (this.state.otherText || "").trim();
    if (sph === "other" && other) return other;
    return SPH[sph] || "";
  }
  buildPayload() {
    const a = this.state.a;
    return {
      source: "quiz_wd_v1",
      sphere: a.q1 || "",
      sphereLabel: SPH[a.q1] || "",
      sphereOther: a.q1 === "other" ? (this.state.otherText || "").trim() : "",
      problems: (a.q2 || []).slice(),
      adsOwner: a.q3 || "",
      services: (a.q4 || []).slice(),
      budget: a.q5 || "",
      audit: a.q6 || "",
      links: (this.state.links || "").trim(),
      channel: a.q7 || "",
      contact: (this.state.contact || "").trim(),
      answersText: this.answersText(),
      utm: this.utm.utm,
      click_ids: this.utm.click_ids,
      page_url: window.location.href,
      referrer: document.referrer || "",
      submitted_at: new Date().toISOString(),
      // антиспам / ідемпотентність
      lead_id: this.state.lead_id,
      hp: this.state.hp || "",
      started_at: this.state.started_at || "",
    };
  }
  answersText() {
    const a = this.state.a;
    const L = [];
    L.push("Заявка з квізу well done");
    L.push("Сфера: " + (this.sphereLabel() || "—"));
    if ((a.q2 || []).length) L.push("Проблеми: " + a.q2.map((id) => (find("q2", id) || {}).label).filter(Boolean).join("; "));
    if (a.q3) L.push("Хто веде рекламу: " + ((find("q3", a.q3) || {}).label || ""));
    if ((a.q4 || []).length) L.push("Послуги: " + a.q4.map((id) => (find("q4", id) || {}).label).filter(Boolean).join("; "));
    if (a.q5) L.push("Бюджет/міс: " + ((find("q5", a.q5) || {}).full || ""));
    if (a.q6) L.push("Аудит: " + ((find("q6", a.q6) || {}).label || ""));
    if ((this.state.links || "").trim()) L.push("Посилання:\n" + this.state.links.trim());
    const ch = CH[a.q7 || "tg"];
    L.push("Канал зв’язку: " + (ch ? ch.name : a.q7));
    L.push("Контакт: " + (this.state.contact || "").trim());
    return L.join("\n");
  }

  /* ───── обчислення view ───── */
  computeView() {
    const s = this.state;
    const step = s.step;
    const a = s.a;
    const q = Q[step] || null;
    const isQ = !!q;
    const answered = q ? (q.multi ? (a[step] || []).length > 0 : !!a[step]) : false;

    const n = PN[step] || 0;
    const segs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => i <= n);
    const stepNote =
      step === "cases"
        ? "кейси у вашій сфері"
        : n <= 6
        ? n === 6 ? "останнє питання про бізнес" : "ще " + (6 - n) + " пит. про бізнес"
        : n === 7 ? "ресурси компанії"
        : n === 8 ? "спосіб зв’язку"
        : "останній крок";

    const sph = a.q1 || "other";
    const otherText = s.otherText || "";
    const sphLabel = sph === "other" && otherText.trim() ? otherText.trim() : SPH[sph];
    const csKey = CASES[SPHERE_TO_SET[sph]] ? SPHERE_TO_SET[sph] : "mix";
    const cs = CASES[csKey];

    // персоналізація
    let persona = "";
    if (step === "q2" && a.q1) persona = "Ваша сфера: " + sphLabel;
    if (step === "q3" && (a.q2 || []).length) { const p2 = find("q2", a.q2[0]); persona = "Фокус розбору: " + (p2 ? p2.short : ""); }
    if (step === "q5" && (a.q4 || []).length) persona = a.q4[0] === "rec" ? "Підберемо набір послуг для вас" : "Обрано напрямів: " + a.q4.length;
    if (step === "q6" && a.q5) { const p5 = find("q5", a.q5); persona = "Медіаплан під " + (p5 ? p5.full : "") + " / міс"; }
    if (step === "q7" && a.q6) { const p6 = find("q6", a.q6); persona = p6 ? p6.short : ""; }

    const comment = q
      ? q.comment
      : step === "cases" ? cs.comment
      : step === "links" ? C.links.expertComment
      : step === "q8" ? C.contact.expertComment
      : "";

    // підсумок (чіпи)
    const summary = [];
    if (a.q1) summary.push(sphLabel);
    if ((a.q2 || []).length) { const x = find("q2", a.q2[0]); if (x) summary.push(x.short); }
    if (a.q5) { const x = find("q5", a.q5); if (x) summary.push("Бюджет " + x.full); }
    if ((a.q4 || []).length) summary.push(a.q4[0] === "rec" ? "Послуги: потрібна рекомендація" : "Послуг обрано: " + a.q4.length);
    if (a.q6) { const x = find("q6", a.q6); if (x) summary.push(x.short); }
    if ((s.links || "").trim()) summary.push("Посилання додано");

    const chKey = a.q7 || "tg";
    const chd = CH[chKey];
    const doneText = chKey === "call"
      ? C.thanks.textCall
      : C.thanks.textMessenger.replace("{channel}", chd.name);

    return {
      step, isQ, q, answered, a,
      n, segs, stepNote, stepLabel: "Крок " + (n || 1) + " з " + TOTAL,
      sph, sphLabel, otherText, cs,
      caseIdx: Math.max(0, Math.min(cs.cards.length - 1, s.caseIdx || 0)),
      persona, comment, summary,
      chKey, chd, doneText,
      err: !!s.err, netError: this.netError,
      hasLinks: !!(s.links || "").trim(),
      submitting: this.submitting,
    };
  }

  /* ───── рендер ───── */
  render(keepFocus) {
    const activeId = keepFocus && document.activeElement ? document.activeElement.getAttribute("data-focus-id") : null;
    const v = this.computeView();
    const step = v.step;
    const isStart = step === "start";
    const isDone = step === "done";

    let html = "";
    if (this.mode === "modal") {
      html += `<button type="button" class="wdq-modal-close" data-act="close" aria-label="Закрити квіз"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    }

    // header
    html += this.renderHeader(v, isStart, isDone);

    // scroll area
    const scrollCls = this.animate ? `wdq-scroll wdq-animate wdq-dir-${this.dir || "fwd"}` : "wdq-scroll";
    html += `<div class="${scrollCls}">`;
    if (isStart) html += this.renderStart(v);
    else if (step === "cases") html += this.renderCases(v);
    else if (step === "links") html += this.renderLinks(v);
    else if (step === "q8") html += this.renderContact(v);
    else if (isDone) html += this.renderDone(v);
    else if (v.isQ) html += this.renderQuestion(v);
    html += `</div>`;

    // sticky footer (mobile only, крім done)
    html += this.renderFooter(v, isStart, isDone);

    this.root.innerHTML = html;
    this.animate = false; // анімація спрацювала; наступні рендери без неї, поки не буде переходу

    // відновити значення текстових полів (не через HTML — безпечно)
    this.bind(v);
    if (activeId) { const el = this.root.querySelector(`[data-focus-id="${activeId}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); } }
  }

  renderHeader(v, isStart, isDone) {
    const inFlow = !isStart && !isDone;
    const brand = `<img src="${esc(asset("logo.svg"))}" alt="well done"><span class="wdq-brand-sep"></span><span class="wdq-brand-note">маркетингова агенція</span>`;

    // desktop header (плитка)
    let dhead = `<header class="wdq-head--desktop">
      <div class="wdq-dhead-brand">${brand}</div>
      <div class="wdq-dhead-center">`;
    if (inFlow) {
      dhead += `<div class="wdq-dhead-prog">
        <span class="wdq-step-label">${esc(v.stepLabel)}</span>
        <div class="wdq-segs">${v.segs.map((on) => `<span class="wdq-seg${on ? " wdq-seg--on" : ""}"></span>`).join("")}</div>
        <span class="wdq-step-note">${esc(v.stepNote)}</span>
      </div>`;
    }
    dhead += `</div>
      <div class="wdq-dhead-right"><span class="wdq-free">Безкоштовно · близько 1 хвилини</span><span class="wdq-6q">6 питань</span></div>
    </header>`;

    // mobile header
    let mhead = "";
    if (isStart || isDone) {
      mhead = `<header class="wdq-head wdq-head--start"><div class="wdq-brand">${brand}</div></header>`;
    } else if (inFlow) {
      mhead = `<header class="wdq-head wdq-head--flow"><div class="wdq-prog">
        <div class="wdq-prog-top"><span class="wdq-step-label">${esc(v.stepLabel)}</span><span class="wdq-step-note">${esc(v.stepNote)}</span></div>
        <div class="wdq-segs">${v.segs.map((on) => `<span class="wdq-seg${on ? " wdq-seg--on" : ""}"></span>`).join("")}</div>
      </div></header>`;
    }
    // Desktop-плитка присутня завжди (на mobile прихована через CSS); mobile-шапка — лише start/flow.
    return dhead + mhead;
  }

  expertCard(v) {
    const chip = v.persona ? `<span class="wdq-chip">${esc(v.persona)}</span>` : "";
    return `<aside class="wdq-expert">
      <img class="wdq-expert-av" src="${esc(asset(C.expert.photo))}" alt="${esc(C.expert.name)}" width="60" height="60" loading="lazy">
      <div class="wdq-expert-id"><span class="wdq-expert-name">${esc(C.expert.name)}</span><span class="wdq-expert-role">${esc(C.expert.role)}</span></div>
      ${chip}
      <p class="wdq-expert-comment">${esc(v.comment)}</p>
    </aside>`;
  }

  renderStart(v) {
    const s = C.start;
    const bullets = s.bullets.map((b) => `<li><span class="wdq-check">${CHECK(12, 3.2)}</span>${esc(b)}</li>`).join("");
    const stats = s.stats.map((st) => `<div class="wdq-stat${st.accent ? " wdq-stat--accent" : ""}"><span class="wdq-stat-v">${esc(st.value)}</span><span class="wdq-stat-l">${esc(st.label)}</span></div>`).join("");
    const title = esc(s.title).replace(esc(s.titleHighlight), `<span class="wdq-mark">${esc(s.titleHighlight)}</span>`);
    return `<div class="wdq-scr wdq-start">
      <section class="wdq-start-card">
        <span class="wdq-badge-d">${esc(s.desktopBadge)}</span>
        <h1 class="wdq-h1">${title}</h1>
        <p class="wdq-lead">${esc(s.lead)}</p>
        <ul class="wdq-bullets">${bullets}</ul>
        <div class="wdq-start-ctarow">
          <button type="button" class="wdq-start-cta" data-act="start">${esc(s.cta)}${ARROW}</button>
          <span class="wdq-start-ctanote">6 питань · близько 1 хвилини<br>без реєстрації</span>
        </div>
      </section>
      <div class="wdq-start-right">
        <figure class="wdq-fig">
          ${picture(s.photo.src, s.photo.alt, 'width="760" height="500" fetchpriority="high"')}
          <figcaption>${esc(s.photo.caption)}</figcaption>
        </figure>
        <div class="wdq-stats">${stats}</div>
      </div>
    </div>`;
  }

  optionsHtml(v) {
    const q = v.q, step = v.step, a = v.a;
    const selected = (id) => (q.multi ? (a[step] || []).indexOf(id) >= 0 : a[step] === id);
    const pressAttr = (id) => (q.multi ? `role="checkbox" aria-checked="${selected(id) ? "true" : "false"}"` : `role="radio" aria-checked="${selected(id) ? "true" : "false"}"`);
    const indCls = q.multi ? "wdq-ind--check" : "wdq-ind--radio";
    const ind = `<span class="wdq-ind ${indCls}">${CHECK(12, 3.5)}</span>`;

    const btn = (id, inner, extra = "") =>
      `<button type="button" class="wdq-opt" data-pick="${esc(id)}" ${pressAttr(id)} ${extra}>${inner}</button>`;

    if (q.layout === "grid") {
      const cells = q.opts.map((o) => btn(o.id,
        `<span class="wdq-ic">${icon(o.icon)}</span><span class="wdq-opt-label">${esc(o.label)}</span>${ind}`)).join("");
      let other = "";
      if (a.q1 === "other") {
        other = `<div class="wdq-scr wdq-other">
          <label for="wdq-other">${esc(C.q1OtherInput.label)}</label>
          <input id="wdq-other" class="wdq-field-bare" type="text" placeholder="${esc(C.q1OtherInput.placeholder)}" data-input="other" data-focus-id="other" autocomplete="off">
        </div>`;
      }
      return `<div class="wdq-grid" role="radiogroup" aria-label="${esc(q.t1)}">${cells}</div>${other}`;
    }

    if (q.layout === "list") {
      const cols = step === "q2" ? " wdq-list--2col" : "";
      const cells = q.opts.map((o) =>
        btn(o.id, `${o.icon ? `<span class="wdq-ic">${icon(o.icon)}</span>` : ""}<span class="wdq-opt-label">${esc(o.label)}</span>${ind}`)).join("");
      const role = q.multi ? "group" : "radiogroup";
      return `<div class="wdq-list${cols}" role="${role}" aria-label="${esc(q.t1)}">${cells}</div>`;
    }

    if (q.layout === "tiles") {
      const cells = q.opts.map((o) =>
        btn(o.id, `<span class="wdq-tiles-top"><span class="wdq-ic">${icon(o.icon)}</span>${ind}</span><span class="wdq-opt-label">${esc(o.label)}</span>`)).join("");
      return `<div class="wdq-tiles" role="group" aria-label="${esc(q.t1)}">${cells}</div>`;
    }

    if (q.layout === "sum") {
      const cells = q.opts.map((o) => {
        const loCls = o.word ? "wdq-sum-lo wdq-sum-lo--word" : "wdq-sum-lo";
        return btn(o.id,
          `${ind}<span class="wdq-sum-nums"><span class="${loCls}">${esc(o.lo)}</span><span class="wdq-sum-hi">${esc(o.hi)}</span></span><span class="wdq-sum-per">на місяць</span>`);
      }).join("");
      return `<div class="wdq-sumwrap"><div class="wdq-sum" role="radiogroup" aria-label="${esc(q.t1)}">${cells}</div>
        <p class="wdq-note">${INFO}${esc(C.q5Note)}</p></div>`;
    }

    if (q.layout === "channel") {
      const cells = q.opts.map((o) =>
        btn(o.id, `<span class="wdq-ic">${icon(o.icon)}</span><span class="wdq-ch-txt"><span class="wdq-ch-name">${esc(o.label)}</span><span class="wdq-ch-sub">${esc(o.sub)}</span></span>${ind}`)).join("");
      return `<div class="wdq-channel" role="radiogroup" aria-label="${esc(q.t1)}">${cells}</div>`;
    }
    return "";
  }

  auditCard() {
    const c = C.q6AuditCard;
    const items = c.items.map((it) => `<li>${CHECK(14, 3)}${esc(it)}</li>`).join("");
    return `<section class="wdq-audit">
      <span class="wdq-audit-title">${esc(c.title)}</span>
      <ul>${items}</ul>
      <div class="wdq-audit-hl">${PLAN_ICON}${esc(c.highlight)}</div>
    </section>`;
  }

  renderQuestion(v) {
    const q = v.q;
    const title = `${esc(q.t1)}${q.hl ? `<span class="wdq-mark">${esc(q.hl)}</span>` : ""}${esc(q.t2)}`;
    const isQ6 = v.step === "q6";
    const navNote = !v.answered ? (q.multi ? "Оберіть хоча б один варіант" : "Оберіть варіант відповіді") : "";
    const navD = `<div class="wdq-nav-d">
      <button type="button" class="wdq-back-d" data-act="back">${CHEVRON_BACK}Назад</button>
      <div class="wdq-nav-d-right">
        ${navNote ? `<span class="wdq-cta-note">${esc(navNote)}</span>` : ""}
        <button type="button" class="wdq-cta-d wdq-cta-d--shadow" data-act="next" ${v.answered ? "" : "disabled"}>Далі${ARROW}</button>
      </div>
    </div>`;

    return `<div class="wdq-scr wdq-flow">
      <section class="wdq-panel">
        <div class="wdq-qhead"><h1>${title}</h1><p class="wdq-qhint">${esc(q.hint)}</p></div>
        ${this.optionsHtml(v)}
        ${navD}
      </section>
      <aside class="wdq-aside">
        ${isQ6 ? this.auditCard() : ""}
        ${this.expertCard(v)}
      </aside>
    </div>`;
  }

  renderCases(v) {
    const cs = v.cs;
    const cards = cs.cards.map((c) => {
      const media = c.img
        ? `<div class="wdq-case-imgwrap">${picture(c.img, c.name, 'class="wdq-case-img" width="300" height="170" loading="lazy"')}</div>`
        : `<div class="wdq-case-ph">${esc(c.ph || "")}</div>`;
      return `<article class="wdq-case">
        ${media}
        <div class="wdq-case-body">
          <span class="wdq-case-name">${esc(c.name)}</span>
          <div class="wdq-case-metrics">
            <div class="wdq-metric"><span class="wdq-metric-v">${esc(c.m1)}</span><span class="wdq-metric-l">${esc(c.m1l)}</span></div>
            <div class="wdq-metric"><span class="wdq-metric-v">${esc(c.m2)}</span><span class="wdq-metric-l">${esc(c.m2l)}</span></div>
          </div>
          <p class="wdq-case-note">${esc(c.note)}</p>
        </div>
      </article>`;
    }).join("");
    const dots = cs.cards.map((_, i) => `<span class="wdq-dot${i === v.caseIdx ? " wdq-dot--on" : ""}"></span>`).join("");

    const head = `<div class="wdq-cases-head"><h1>${esc(cs.title)}</h1><p>${esc(cs.text)}</p></div>`;
    const carousel = `<div class="wdq-carousel">${cards}</div>`;
    const dotsRow = `<div class="wdq-case-dots"><div class="wdq-dots">${dots}</div><span class="wdq-case-num">${v.caseIdx + 1} із ${cs.cards.length}</span></div>`;

    // mobile: картка експерта + вступний текст (нав — у липкому футері)
    const expertM = this.expertCard({ persona: "", comment: cs.comment });
    const preM = `<p class="wdq-cases-pre">${esc(C.cases.ctaPreText)}</p>`;

    // desktop: підвал (експерт + жовтий блок з навігацією)
    const expertInner = `<img src="${esc(asset(C.expert.photo))}" alt="${esc(C.expert.name)}" width="52" height="52" loading="lazy"><div class="wdq-expert-body"><div class="wdq-expert-id"><span class="wdq-expert-name">${esc(C.expert.name)}</span><span class="wdq-expert-role">${esc(C.expert.role)}</span></div><p class="wdq-expert-comment">${esc(cs.comment)}</p></div>`;
    const foot = `<div class="wdq-cases-foot">
      <div class="wdq-cases-expert">${expertInner}</div>
      <div class="wdq-cases-cta">
        <p>${esc(C.cases.ctaPreText)}</p>
        <div class="wdq-cases-cta-row">
          <button type="button" class="wdq-back" data-act="back" aria-label="Назад">${ARROW_BACK}</button>
          <button type="button" class="wdq-cta-go" data-act="next">${esc(C.cases.cta)}${ARROW}</button>
        </div>
      </div>
    </div>`;

    return `<div class="wdq-scr wdq-cases">${head}${carousel}${dotsRow}${expertM}${preM}${foot}</div>`;
  }

  renderLinks(v) {
    return `<div class="wdq-scr wdq-flow wdq-flow--full-m">
      <section class="wdq-panel">
        <div class="wdq-qhead"><h1>${esc(C.links.title)}</h1><p class="wdq-qhint">${esc(C.links.subtitle)}</p></div>
        <div class="wdq-links-field">
          <label class="wdq-links-label" for="wdq-links"><span class="wdq-links-ic">${LINK_ICON}</span>${esc(C.links.fieldLabel)}</label>
          <textarea id="wdq-links" class="wdq-textarea" rows="4" placeholder="${esc(C.links.placeholder)}" data-input="links" data-focus-id="links"></textarea>
        </div>
        <p class="wdq-note">${INFO}${esc(C.links.hint)}</p>
        <div class="wdq-nav-d wdq-nav-d--links">
          <button type="button" class="wdq-back-d" data-act="back">${CHEVRON_BACK}Назад</button>
          <button type="button" class="wdq-cta-d wdq-cta-d--shadow" data-act="next">${v.hasLinks ? C.links.ctaFilled : C.links.ctaEmpty}${ARROW}</button>
        </div>
      </section>
      <aside class="wdq-aside">${this.expertCard(v)}</aside>
    </div>`;
  }

  renderContact(v) {
    const ch = v.chd;
    const chips = v.summary.map((l) => `<span>${esc(l)}</span>`).join("");
    const sc = C.contact.summaryCard;
    const summaryCard = (mod) => `<section class="wdq-summary wdq-summary--${mod}">
      <div class="wdq-summary-top"><span class="wdq-summary-title">${esc(sc.title)}</span><span class="wdq-summary-badge">${esc(sc.badge)}</span></div>
      <div class="wdq-summary-bar"><i></i></div>
      <div class="wdq-summary-chips">${chips}</div>
      <span class="wdq-summary-note">${esc(sc.desktopNote)}</span>
    </section>`;

    // Telegram: явний перемикач способу контакту (телефон / @username) замість «вгадування» за першим символом
    const isTg = v.chKey === "tg";
    const mode = isTg ? (this.state.tgMode || "phone") : "tel";
    let fType = ch.type, fMode = ch.mode, fAuto = ch.auto, fPh = ch.ph, fLabel = ch.label;
    if (isTg && mode === "username") { fType = "text"; fMode = "text"; fAuto = "username"; fPh = "@username"; fLabel = "Юзернейм у Telegram"; }
    else if (isTg) { fType = "tel"; fMode = "tel"; fAuto = "tel"; fPh = "+380 __ ___ __ __"; fLabel = "Номер телефону"; }

    const toggle = isTg ? `<div class="wdq-tgmode" role="group" aria-label="Як з вами звʼязатися в Telegram">
      <button type="button" class="wdq-tgmode-btn" data-tgmode="phone" aria-pressed="${mode === "phone" ? "true" : "false"}">${icon("assets/icons/phone.svg")}Телефон</button>
      <button type="button" class="wdq-tgmode-btn" data-tgmode="username" aria-pressed="${mode === "username" ? "true" : "false"}"><span class="wdq-tgmode-at">@</span>username</button>
    </div>` : "";

    let errMsg;
    if (this.serverErr) errMsg = this.serverErr;
    else if (isTg && mode === "username") errMsg = "Вкажіть коректний @username: 4–32 символи, латиниця, цифри або _";
    else {
      // телефонний режим: якщо код введено, але він невідомий — підказка про оператора; інакше — про повний номер
      const d = normalizeUaDigits(this.state.contact);
      errMsg = d.length >= 5 && !isKnownOperatorCode(d.slice(3, 5)) ? OP_HINT : C.contact.errors.phone;
    }
    const err = v.err ? `<p class="wdq-err-msg" role="alert" id="wdq-err">${esc(errMsg)}</p>` : "";
    const showHint = isTg ? mode === "phone" : !!ch.hint;
    const hint = showHint && ch.hint ? `<p class="wdq-contact-hint">${esc(ch.hint)}</p>` : "";
    const net = v.netError ? `<p class="wdq-neterr" role="alert">${esc(v.netError)}</p>` : "";

    // honeypot — приховане поле для ботів (люди його не бачать і не заповнюють)
    const honeypot = `<div class="wdq-hp" aria-hidden="true"><label>Не заповнюйте це поле<input type="text" tabindex="-1" autocomplete="off" data-input="hp"></label></div>`;

    const field = `<div class="wdq-contact-block">
      <h1>${esc(ch.title)}</h1>
      ${toggle}
      <label class="wdq-contact-label" for="wdq-contact">${esc(fLabel)}</label>
      <div class="wdq-field${v.err ? " wdq-field--err" : ""}">
        <span class="wdq-field-ic">${icon(ch.icon)}</span>
        <input id="wdq-contact" type="${esc(fType)}" inputmode="${esc(fMode)}" autocomplete="${esc(fAuto)}" placeholder="${esc(fPh)}" data-input="contact" data-focus-id="contact" ${v.err ? 'aria-invalid="true" aria-describedby="wdq-err"' : ""}>
      </div>
      ${honeypot}
      ${err}${hint}
      <button type="button" class="wdq-change" data-act="change-channel">${esc(C.contact.changeChannelLink)}</button>
      ${net}
      <div class="wdq-contact-nav">
        <div class="wdq-contact-nav-row">
          <button type="button" class="wdq-back" data-act="back" aria-label="Назад">${ARROW_BACK}</button>
          <button type="button" class="wdq-submit-d" data-act="submit" ${v.submitting ? "disabled" : ""}>${v.submitting ? `<span class="wdq-spinner"></span>Надсилаємо…` : `${esc(C.contact.cta)}${ARROW}`}</button>
        </div>
        <span class="wdq-cta-note">${esc(C.contact.ctaNote)}</span>
      </div>
    </div>`;

    return `<div class="wdq-scr wdq-flow">
      <section class="wdq-panel wdq-panel--contact">
        ${summaryCard("m")}
        ${field}
      </section>
      <aside class="wdq-aside">${summaryCard("d")}${this.expertCard(v)}</aside>
    </div>`;
  }

  renderDone(v) {
    const t = C.thanks;
    const steps = t.nextSteps.map((st, i) => `<li><span class="wdq-next-n">${i + 1}</span><span class="wdq-next-txt"><b>${esc(st.title)}</b><span>${esc(st.text)}</span></span></li>`).join("");
    const chips = v.summary.map((l) => `<span>${esc(l)}</span>`).join("");
    const answers = (mod) => `<div class="wdq-answers wdq-answers--${mod}"><span class="wdq-answers-title">${esc(t.answersTitle)}</span><div class="wdq-answers-chips">${chips}</div></div>`;
    return `<div class="wdq-scr wdq-done">
      <section class="wdq-done-card">
        <span class="wdq-done-badge">${CHECK(28, 2.6)}</span>
        <h1>${esc(t.title)}</h1>
        <p class="wdq-done-text">${esc(v.doneText)}</p>
        <div class="wdq-done-expert"><img src="${esc(asset(C.expert.photo))}" alt="${esc(C.expert.name)}" width="36" height="36" loading="lazy"><span><b>${esc(C.expert.name)}</b> ${esc(t.expertLine.replace(C.expert.name, "").trim())}</span></div>
        ${answers("d")}
      </section>
      <aside class="wdq-done-aside">
        <section class="wdq-next"><h2>${esc(t.nextStepsTitle)}</h2><ol>${steps}</ol></section>
        ${answers("m")}
        <a href="${esc(t.casesLink.href)}" class="wdq-caseslink" target="_blank" rel="noopener">${esc(t.casesLink.text)}${ARROW}</a>
      </aside>
    </div>`;
  }

  renderFooter(v, isStart, isDone) {
    if (isDone) return "";
    const hasBack = !isStart;
    let label, note = "", disabled = false, act = "next", extra = "";
    if (isStart) { label = C.start.cta; note = C.start.ctaNote; act = "start"; }
    else if (v.step === "cases") { label = C.cases.cta; }
    else if (v.step === "links") { label = v.hasLinks ? C.links.ctaFilled : C.links.ctaEmpty; }
    else if (v.step === "q8") {
      label = v.submitting ? "" : C.contact.cta; note = C.contact.ctaNote; act = "submit"; disabled = v.submitting;
    } else if (v.isQ) {
      label = "Далі";
      disabled = !v.answered;
      if (!v.answered) note = v.q.multi ? "Оберіть хоча б один варіант" : "Оберіть варіант відповіді";
    }
    const net = v.step === "q8" && v.netError ? `<p class="wdq-neterr" role="alert">${esc(v.netError)}</p>` : "";
    const inner = v.submitting && v.step === "q8" ? `<span class="wdq-spinner"></span>Надсилаємо…` : `${esc(label)}${ARROW}`;
    const back = hasBack ? `<button type="button" class="wdq-back" data-act="back" aria-label="Назад">${ARROW_BACK}</button>` : "";
    return `<footer class="wdq-footer">
      ${net}
      <div class="wdq-footer-row">${back}<button type="button" class="wdq-cta" data-act="${act}" ${disabled ? "disabled" : ""}>${inner}</button></div>
      ${note ? `<span class="wdq-cta-note">${esc(note)}</span>` : ""}
    </footer>`;
  }

  /* ───── події ───── */
  bind(v) {
    const r = this.root;
    // відновлення значень полів
    const other = r.querySelector('[data-input="other"]'); if (other) other.value = this.state.otherText || "";
    const links = r.querySelector('[data-input="links"]'); if (links) links.value = this.state.links || "";
    const contact = r.querySelector('[data-input="contact"]'); if (contact) contact.value = this.state.contact || "";
    const hp = r.querySelector('[data-input="hp"]');
    if (hp) { hp.value = this.state.hp || ""; hp.addEventListener("input", (e) => { this.state.hp = e.target.value; }); }

    // кліки (делегування)
    r.querySelectorAll("[data-act]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const act = el.getAttribute("data-act");
        if (act === "start") { this.next(); }
        else if (act === "next") { this.next(); }
        else if (act === "back") { this.back(); }
        else if (act === "submit") { this.submit(); }
        else if (act === "change-channel") { this.go("q7", "back"); }
        else if (act === "close") { if (this.onClose) this.onClose(); }
      });
    });
    r.querySelectorAll("[data-pick]").forEach((el) => {
      el.addEventListener("click", () => this.pick(this.state.step, el.getAttribute("data-pick")));
    });

    // текстові поля
    if (other) other.addEventListener("input", (e) => { this.state.otherText = e.target.value; this.save(); });
    if (links) links.addEventListener("input", (e) => {
      this.state.links = e.target.value; this.save();
      // оновити лейбл CTA без повного ререндеру
      const want = (e.target.value || "").trim() ? C.links.ctaFilled : C.links.ctaEmpty;
      const ctaM = r.querySelector(".wdq-footer .wdq-cta");
      const ctaD = r.querySelector(".wdq-nav-d--links .wdq-cta-d");
      [ctaM, ctaD].forEach((b) => { if (b) b.childNodes[0].nodeValue = want; });
    });
    // перемикач способу контакту в Telegram
    r.querySelectorAll("[data-tgmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = btn.getAttribute("data-tgmode");
        if ((this.state.tgMode || "phone") === m) return;
        this.state.tgMode = m;
        this.state.contact = m === "phone" ? "+380 " : "";
        this.state.err = false; this.serverErr = null;
        this.save();
        this.render(); // той самий крок → без анімації
        const inp = this.root.querySelector(".wdq-field input");
        if (inp) setTimeout(() => { inp.focus(); if (inp.value) inp.setSelectionRange(inp.value.length, inp.value.length); }, 20);
      });
    });

    if (contact) {
      contact.addEventListener("input", (e) => {
        const el = e.target;
        const raw = el.value;
        if (this.isUsernameMode()) {
          this.state.contact = raw; // username — без маски
        } else {
          const t = raw.trim();
          const formatted = t.length ? fmtPhone(raw) : "";
          this.state.contact = formatted;
          if (formatted !== raw) { el.value = formatted; el.setSelectionRange(formatted.length, formatted.length); }
        }
        this.save();
        this.state.err = false;
        this.serverErr = null;
        // жива валідація коду оператора (лише телефонний режим)
        if (!this.isUsernameMode()) {
          const d = normalizeUaDigits(this.state.contact);
          if (d.length >= 5 && !isKnownOperatorCode(d.slice(3, 5))) this._showContactError(OP_HINT);
          else this._clearContactError();
        } else {
          this._clearContactError();
        }
      });
      contact.addEventListener("focus", (e) => {
        if (!e.target.value && !this.isUsernameMode()) { e.target.value = "+380 "; this.state.contact = "+380 "; this.save(); }
      });
    }

    // каруселя кейсів: синхронізація індикатора
    const car = r.querySelector(".wdq-carousel");
    if (car && v.step === "cases") {
      car.addEventListener("scroll", () => {
        const cardW = 312; // 300 + gap 12
        const i = Math.round(car.scrollLeft / cardW);
        if (i !== this.state.caseIdx) {
          this.state.caseIdx = i;
          const dots = r.querySelectorAll(".wdq-dot");
          dots.forEach((d, di) => d.classList.toggle("wdq-dot--on", di === i));
          const num = r.querySelector(".wdq-case-num"); if (num) num.textContent = (i + 1) + " із " + v.cs.cards.length;
        }
      }, { passive: true });
    }
  }
}

/* ───────────────────────── МОДАЛКА ───────────────────────── */
let modalInstance = null;
let modalEl = null;
let lastFocused = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement("div");
  modalEl.className = "wdq-modal";
  modalEl.setAttribute("role", "dialog");
  modalEl.setAttribute("aria-modal", "true");
  modalEl.setAttribute("aria-label", "Квіз well done");
  const host = document.createElement("div");
  host.className = "wdq";
  modalEl.appendChild(host);
  document.body.appendChild(modalEl);

  modalInstance = new WDQuiz(host, { mode: "modal" });
  modalInstance.onClose = closeModal;

  // Esc
  modalEl.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  return modalEl;
}

export function openModal() {
  lastFocused = document.activeElement;
  ensureModal();
  modalEl.setAttribute("data-open", "true");
  document.documentElement.classList.add("wdq-body-lock");
  document.body.classList.add("wdq-body-lock");
  const close = modalEl.querySelector(".wdq-modal-close");
  setTimeout(() => { if (close) close.focus(); }, 30);
}

export function closeModal() {
  if (!modalEl) return;
  modalEl.removeAttribute("data-open");
  document.documentElement.classList.remove("wdq-body-lock");
  document.body.classList.remove("wdq-body-lock");
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

/* ───────────────────────── ІНІЦІАЛІЗАЦІЯ ───────────────────────── */
const instances = [];
export function initQuiz() {
  // вбудовані секції
  document.querySelectorAll("[data-wd-quiz]").forEach((node) => {
    if (node.__wdq) return;
    node.__wdq = true;
    instances.push(new WDQuiz(node, { mode: "embed" }));
  });
  // кнопки-тригери модалки
  document.querySelectorAll("[data-wd-quiz-open]").forEach((btn) => {
    if (btn.__wdqBound) return;
    btn.__wdqBound = true;
    btn.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initQuiz);
  else initQuiz();
}

export { WDQuiz };
export default initQuiz;
