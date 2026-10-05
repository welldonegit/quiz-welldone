// Єдине джерело правди для допустимих значень — content/quiz-content.json.
// Списки id не дублюємо вручну, а виводимо з контенту квіза.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contentUrl = new URL("../../content/quiz-content.json", import.meta.url);
const CONTENT = JSON.parse(readFileSync(fileURLToPath(contentUrl), "utf8"));

const ids = (qid) => (CONTENT.questions[qid]?.opts || []).map((o) => o.id);

export const ALLOWED = {
  sphere: ids("q1"),                                   // ecom, realty, prod, b2b, b2c, other
  problems: ids("q2"),
  adsOwner: ids("q3"),
  services: ids("q4"),
  budget: ids("q5"),
  audit: ids("q6"),
  channel: Object.keys(CONTENT.contact.channels),      // tg, viber, wa, call
};

// Людиночитні підписи (для answersText/нотифікацій на етапі 2, якщо знадобиться серверу).
export const LABELS = {
  sphere: CONTENT.sphereShortLabels,
  problems: Object.fromEntries((CONTENT.questions.q2.opts || []).map((o) => [o.id, o.label])),
  adsOwner: Object.fromEntries((CONTENT.questions.q3.opts || []).map((o) => [o.id, o.label])),
  services: Object.fromEntries((CONTENT.questions.q4.opts || []).map((o) => [o.id, o.label])),
  budget: Object.fromEntries((CONTENT.questions.q5.opts || []).map((o) => [o.id, o.full])),
  audit: Object.fromEntries((CONTENT.questions.q6.opts || []).map((o) => [o.id, o.label])),
  channel: Object.fromEntries(Object.entries(CONTENT.contact.channels).map(([k, v]) => [k, v.name])),
};

export default CONTENT;
