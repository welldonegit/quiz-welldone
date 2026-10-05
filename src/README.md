# Квіз well done — підключення

Незалежний компонент (vanilla ES-module). Без фреймворків і зовнішніх залежностей у рантаймі.
Усі стилі з префіксом `.wdq-` і замкнені на `.wdq` — не впливають на сторінку й не залежать від глобальних стилів сайту.

## Файли

```
src/
├── wd-quiz.js            головний модуль (логіка, стан, рендер, модалка, аналітика)
├── wd-quiz.css           стилі (включає @import ./fonts.css)
├── wd-quiz-content.js    контент (згенеровано з content/quiz-content.json)
├── wd-quiz-icons.js      інлайн-іконки (згенеровано з assets/icons/*.svg)
├── fonts.css             self-hosted Inter 400/500/600/700/800 (кирилиця)
└── fonts/                *.woff2 (сабсети Inter)
assets/                   logo.svg, icons/, images/ (+ images/webp/)
```

## Швидкий старт

```html
<link rel="stylesheet" href="/src/wd-quiz.css">

<!-- 1) Вбудована секція -->
<div data-wd-quiz></div>

<!-- 2) Будь-яка кнопка відкриває квіз у повноекранній модалці -->
<button data-wd-quiz-open>Пройти квіз</button>

<!-- Конфіг — ДО підключення скрипта (необов’язково) -->
<script>
  window.WDQ_CONFIG = {
    submitUrl: "https://your-backend.example/api/quiz", // бекенд-проксі → Telegram
    debug: false
  };
</script>
<script type="module" src="/src/wd-quiz.js"></script>
```

Квіз ініціалізується автоматично (`DOMContentLoaded`). Можна й вручну: `import initQuiz from '/src/wd-quiz.js'; initQuiz();`.

## Конфіг (`QUIZ_CONFIG` / `window.WDQ_CONFIG`)

| Ключ | За замовч. | Опис |
|------|-----------|------|
| `submitUrl` | `""` | Куди POST-ити заявку (JSON). Порожньо → заглушка (лог у debug). |
| `storageKey` | `wdq_state_v1` | Ключ `localStorage` для прогресу. |
| `storageTtlMs` | 24 год | TTL збереженого прогресу. |
| `autoAdvanceMs` | `380` | Затримка автопереходу після одиночного вибору. |
| `debug` | `false` | Логи в консоль, у т.ч. payload заглушки. |
| `assetsBase` | `../assets/` | Базовий шлях до фото/лого (відносно `wd-quiz.js`). |

## Куди йдуть заявки

`submitUrl` має вказувати на **ваш бекенд/проксі**, який уже пересилає заявку в Telegram.
**Токен бота у фронтенд не кладемо** — лише ваш endpoint. Поки `submitUrl` порожній, працює заглушка
(успіх імітується, payload логується в debug-режимі). Формат payload — див. `SPEC.md`, розділ 5.

## Аналітика

Якщо на сторінці є `window.dataLayer` (GTM) — надсилаються події `quiz_view`, `quiz_start`,
`quiz_step_view`, `quiz_answer`, `quiz_back`, `quiz_links_skipped`, `quiz_submit`,
`quiz_submit_success`, `quiz_submit_error`. На успіх додатково `fbq('track','Lead')` і
`gtag('event','generate_lead')`, якщо вони існують. UTM/`fbclid`/`gclid` зчитуються з URL і зберігаються
в `sessionStorage`, щоб не губитися при навігації.

## Оновлення контенту

Правте `content/quiz-content.json` і перегенеруйте модуль:

```bash
node -e "const fs=require('fs');fs.writeFileSync('src/wd-quiz-content.js','export const CONTENT = '+fs.readFileSync('content/quiz-content.json','utf8').trim()+';\nexport default CONTENT;\n')"
```

Іконки — аналогічно з `assets/icons/*.svg` (див. історію генерації).
