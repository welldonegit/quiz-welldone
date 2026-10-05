// Нормалізація українського номера до формату +380 XX XXX XX XX (та сама логіка, що й у фронтенді).
export function normalizePhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.indexOf("380") !== 0) {
    if (d.indexOf("80") === 0) d = "3" + d;
    else if (d.indexOf("0") === 0) d = "38" + d;
    else if ("380".indexOf(d) === 0) d = "380";
    else d = "380" + d;
  }
  d = d.slice(0, 12);
  return d;
}

export function formatPhone(v) {
  const d = normalizePhone(v).slice(3, 12);
  let out = "+380";
  if (d.length) out += " " + d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += " " + d.slice(5, 7);
  if (d.length > 7) out += " " + d.slice(7, 9);
  return out;
}

export function isValidPhone(v) {
  return normalizePhone(v).length === 12;
}

export const USERNAME_RE = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/;
export function isValidUsername(v) {
  return USERNAME_RE.test(String(v || "").trim());
}
