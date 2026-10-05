# Бекенд квіза well done (Етап 1)

Простий Node.js-бекенд: приймає заявку з квіза, валідує, зберігає у файл. Telegram — **Етап 2**
(місце підготовлено в `lib/notify.js`).

## Структура

```
server/
├── index.js          старт: seed ідемпотентності з файлу, listen
├── app.js            createApp(): helmet, json(20kb), rate-limit, роути, роздача dist/ та /assets
├── routes/lead.js    POST /api/lead (honeypot, анти-бот за часом, валідація, дедуп, збереження, notify)
└── lib/
    ├── content.js    допустимі id — виведено з content/quiz-content.json (не дублюємо вручну)
    ├── validate.js   zod-схема payload + нормалізація контакту
    ├── phone.js      нормалізація/формат телефону +380 XX XXX XX XX
    ├── utm.js        гарантія UTM/click-id (+ добір із page_url)
    ├── storage.js    append у data/leads.jsonl + seed lead_id за 24 год
    └── notify.js     заглушка нотифікації (Етап 2 — Telegram)
data/leads.jsonl      усі валідні заявки (jsonl, у .gitignore)
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
| `TELEGRAM_*` | заготовки для Етапу 2 |

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
