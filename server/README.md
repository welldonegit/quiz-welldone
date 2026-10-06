# Бекенд квіза well done

Простий Node.js-бекенд: приймає заявку з квіза, валідує, зберігає у файл і надсилає в Telegram-чат(и) команди.

## Структура

```
server/
├── index.js          старт: seed ідемпотентності з файлу, listen
├── app.js            createApp(): helmet, json(20kb), rate-limit, роути, роздача dist/ та /assets
├── routes/lead.js    POST /api/lead (honeypot, анти-бот за часом, валідація, дедуп, збереження, notify у фоні)
└── lib/
    ├── content.js    допустимі id + людські підписи (LABELS) — з content/quiz-content.json (не дублюємо вручну)
    ├── validate.js   zod-схема payload + нормалізація контакту
    ├── phone.js      нормалізація/формат телефону +380 XX XXX XX XX
    ├── utm.js        гарантія UTM/click-id (+ добір із page_url)
    ├── storage.js    append у data/leads.jsonl, seed lead_id за 24 год, статуси нотифікації, pending за 24 год
    ├── telegram.js   клієнт Telegram Bot API (fetch, таймаут 5с, ретраї 1/3/9с, 429 retry_after, 400→без HTML)
    ├── format.js     HTML-повідомлення про заявку (підписи з LABELS) + inline-кнопки, ліміт 4096
    └── notify.js     відправка в Telegram у фоні, запис статусу sent/failed, повтор pending/failed на старті
scripts/
├── tg-check.js       npm run tg:test — тестове повідомлення (фейкова заявка з усіма UTM)
└── tg-chatid.js      npm run tg:chatid — getUpdates → chat_id і thread_id
data/leads.jsonl      усі валідні заявки + події статусу нотифікації (jsonl, у .gitignore)
```

## Telegram (нотифікації про заявки)

Кожна заявка після збереження йде в Telegram **у фоні** — користувач не чекає на відправку
(відповідь `200` повертається одразу). Транспорт — прямий `fetch` до Bot API, без SDK.

- **Куди:** `TELEGRAM_CHAT_ID` (можна кілька через кому — надсилається в кожен). Для груп із темами —
  `TELEGRAM_THREAD_ID` (передається як `message_thread_id`).
- **Надійність:** таймаут 5 с; до 3 ретраїв (паузи 1→3→9 с); на `429` чекаємо `retry_after`;
  на `400` (помилка формату) — одразу спрощена версія без HTML. Токен ніколи не потрапляє в логи/помилки.
- **Статуси:** після відправки у `data/leads.jsonl` дописується подія `{_t:"notify_status", notify_status:"sent"|"failed", …}`
  (без переписування файлу). Актуальний статус заявки = остання така подія.
- **Відновлення:** на старті сервера заявки за 24 год зі статусом `pending`/`failed` надсилаються повторно
  (щоб нічого не загубилось після падіння/рестарту чи поки не були задані ключі).

Перевірити налаштування:

```bash
npm run tg:chatid   # напишіть щось боту → побачите chat_id і thread_id
npm run tg:test     # надішле тестову заявку з усіма UTM у чат(и) з env
```

## Команди

```bash
npm install
cp .env.example .env     # (robиться автоматично перед npm run dev)
npm run dev              # Vite (5173) + API (3001) паралельно, auto-reload
npm run build            # збірка фронтенду у dist/
npm start                # production: один Node-процес віддає dist/ + /api на PORT
npm test                 # тести бекенду (node:test)
```

У dev фронт на `http://localhost:5173`, запити `/api` і `/assets` проксуються на `http://localhost:3001`.
У production усе на одному порту (`PORT`, типово 3001).

## Змінні середовища (`.env`)

| Змінна | Опис |
|--------|------|
| `PORT` | порт сервера (типово 3001) |
| `NODE_ENV` | `production` на хостингу |
| `ALLOWED_ORIGIN` | дозволений origin, якщо фронт і API на різних доменах (інакше порожньо = той самий origin) |
| `TRUST_PROXY` | кількість проксі перед застосунком (1 для типового Nginx) — для коректного IP |
| `LEADS_FILE` | нестандартний шлях до файлу заявок (необов’язково) |
| `TELEGRAM_BOT_TOKEN` | токен бота від @BotFather (ніколи не у фронтенді/логах) |
| `TELEGRAM_CHAT_ID` | куди слати заявки; кілька id через кому |
| `TELEGRAM_THREAD_ID` | id теми для груп із темами (необов’язково) |

## API

- `POST /api/lead` — приймає payload (див. `SPEC.md` §5) + `lead_id` (UUID), `hp` (honeypot), `started_at`.
  - Відповіді: `200 {ok:true, lead_id}`; дубль → `200 {ok:true, duplicate:true}`; `400 {ok:false, errors:{field}}`;
    `429 {ok:false, message}`; `500 {ok:false}`.
  - Захист: honeypot і «надто швидке» заповнення (<5 с) → тихий `200` без збереження; rate-limit 5/10 хв на IP;
    ідемпотентність за `lead_id` 24 год; ліміт тіла 20 КБ.
  - Сервер додає: `received_at` (ISO) та `received_at_kyiv` (Europe/Kyiv), `ip`, `user_agent`, `notify_status:"pending"`.
  - UTM/`fbclid`/`gclid` добираються з `page_url`, якщо відсутні в payload.
- `GET /api/health` → `{ok:true}`.

## Деплой (що потрібно від вас)

Рекомендований варіант — «один Node-процес за Nginx»:

1. На сервері: Node 20+, `npm ci && npm run build`.
2. Запуск `npm start` під процес-менеджером (**pm2**/**systemd**), `NODE_ENV=production`, потрібний `PORT`.
3. Nginx: проксі `your-domain → http://127.0.0.1:PORT`, HTTPS (Let’s Encrypt), `proxy_set_header X-Forwarded-For`.
   `TRUST_PROXY=1`.
4. `data/` має бути з правом запису й у бекапі (там усі заявки).

Для цього від вас потрібно: **домен**, **доступ до хостингу** (VPS/панель), і чи є перед застосунком проксі
(щоб виставити `TRUST_PROXY`). Якщо фронт лишиться на іншому домені — дайте його для `ALLOWED_ORIGIN`.
