// Єдине джерело правди для кодів українських мобільних операторів.
// Використовується і фронтендом (src/wd-quiz.js), і бекендом (server/lib/validate.js).

export const UA_MOBILE_CODES_BY_OPERATOR = {
  "Київстар": ["39", "67", "68", "77", "96", "97", "98"],
  "Vodafone": ["50", "66", "75", "95", "99"],
  "lifecell": ["63", "73", "93"],
  "3Mob": ["91"],
  "PEOPLEnet": ["92"],
  "Інтертелеком": ["94"],
  // 89 — IP-телефонія (не дозволяємо); стаціонарні коди (044 тощо) — не дозволяємо.
};

export const UA_MOBILE_CODES = Object.values(UA_MOBILE_CODES_BY_OPERATOR).flat();
const CODES = new Set(UA_MOBILE_CODES);

// Нормалізація до цифр у форматі 380XXXXXXXXX (до 12 цифр). Та сама логіка, що у масці поля.
export function normalizeUaDigits(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.indexOf("380") !== 0) {
    if (d.indexOf("80") === 0) d = "3" + d;
    else if (d.indexOf("0") === 0) d = "38" + d;
    else if ("380".indexOf(d) === 0) d = "380";
    else d = "380" + d;
  }
  return d.slice(0, 12);
}

// Код оператора (2 цифри після 380), або "" якщо ще не введено.
export function uaOperatorCode(v) {
  const d = normalizeUaDigits(v);
  return d.length >= 5 ? d.slice(3, 5) : "";
}

export function isKnownOperatorCode(code) {
  return CODES.has(String(code));
}

// Валідний, якщо: 12 цифр, починається з 380, код оператора зі списку.
export function isValidUaMobile(v) {
  const d = normalizeUaDigits(v);
  return d.length === 12 && d.slice(0, 3) === "380" && CODES.has(d.slice(3, 5));
}

export default { UA_MOBILE_CODES, isValidUaMobile, uaOperatorCode, isKnownOperatorCode, normalizeUaDigits };
