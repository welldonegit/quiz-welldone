# Деплой квіза well done на HostPro (cPanel → Node.js)

HostPro використовує **Node.js Selector (CloudLinux + Phusion Passenger)** у cPanel.
Застосунок запускається через «Application startup file», порт і `NODE_ENV` дає Passenger,
змінні середовища задаються в UI застосунку.

> Проєкт уже адаптований під Passenger: стартовий файл — **`app.cjs`** (місток до ESM),
> порт береться з `process.env.PORT` як є (Passenger може дати unix-сокет), `.env` читається
> автоматично, якщо є, але **не перезаписує** змінні, задані в панелі.

## 0. Білд НЕ потрібен

Квіз — це нативні ES-модулі + звичайний CSS, тож у production Node віддає **джерела напряму**
(`index.html` + `/src` + `/shared`). Vite потрібен лише для dev (`npm run dev`) та як **опційна**
оптимізація — якщо колись зробите `npm run build`, сервер автоматично почне віддавати `dist/`.
Без `dist/` він віддає джерела. Тому звичайний цикл — **без білда**:

```
локально: git push   →   cPanel: git pull   →   Restart застосунку
```

Що лежить у репозиторії (усе потрібне їде через git): `app.cjs`, `server/`, `shared/`, `src/`,
`assets/`, `content/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`.
У `.gitignore` (на сервері створюються/задаються): `node_modules/`, `dist/`, `data/`, `.env`.

> ⚠️ Теку **`shared/`** бекенд імпортує (`server/lib/validate.js`) — вона в репозиторії, тож
> приїде через git. Без неї застосунок не стартує.

## 1. Піддомен

cPanel → **Domains / Subdomains** → створити, напр. `quiz.well-done.com.ua`.
Запамʼятайте його Document Root (напр. `/home/USER/quiz`) — туди заллємо проєкт.

## 2. Завантаження файлів

Через **File Manager**, FTP або Git — у теку піддомену (Application root).

## 3. Створення Node.js-застосунку

cPanel → **Setup Node.js App** → **Create Application**:

| Поле | Значення |
|------|----------|
| Node.js version | 20 (підійде будь-яка 20–24) |
| Application mode | **Production** |
| Application root | тека з проєктом (напр. `quiz`) |
| Application URL | ваш піддомен |
| **Application startup file** | **`app.cjs`** |

## 4. Змінні середовища (кнопка «Add Variable» у застосунку)

```
NODE_ENV = production
TRUST_PROXY = 1
ALLOWED_ORIGIN =        (порожньо — фронт і API на тому самому піддомені)
```
**PORT не задавайте** — його надає Passenger.
Для Етапу 2 пізніше додасте: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, (за потреби `TELEGRAM_THREAD_ID`).

## 5. Встановлення залежностей

У налаштуваннях застосунку → **Run NPM Install**.
Якщо з панелі не спрацює (буває на деяких проєктах) — через SSH:

```bash
source /home/USER/nodevenv/quiz/20/bin/activate && cd /home/USER/quiz
npm install --omit=dev      # лише runtime-залежності (express, zod, helmet, express-rate-limit)
```

> `npm install` потрібен лише при першому деплої та коли змінюються залежності. У звичайному
> оновленні (правки коду/контенту) достатньо `git pull` + **Restart** — `node_modules` на сервері
> зберігається між деплоями.

## 6. Запуск

Натисніть **Restart** (або Start). Відкрийте піддомен — квіз має працювати.
Перевірка API: `https://ваш-піддомен/api/health` → `{"ok":true}`.

Заявки зберігаються у файл **`data/leads.jsonl`** в Application root (створюється автоматично).
Переконайтесь, що тека з правом запису (за замовчуванням так і є) і додайте її в бекап.

## Оновлення в майбутньому

Звичайний цикл для будь-яких змін (фронтенд, бекенд, тексти): **локально `git push` → у cPanel
Git Version Control `Pull` (або `git pull` по SSH) → `Restart` застосунку.** Білд не потрібен.

- Змінили **фронтенд** (`src/`, `index.html`): просто push → pull → Restart.
- Змінили **бекенд** (`server/`): так само. Якщо додали npm-залежність — ще `npm install` (крок 5).
- Правили **тексти**: оновіть `content/quiz-content.json`, перегенеруйте `src/wd-quiz-content.js`
  (команда в `src/README.md`), push → pull → Restart.

> Опційно: якщо хочете мініфікований/хешований фронтенд, зробіть локально `npm run build` і залийте
> `dist/` на сервер (напр. через File Manager) — сервер автоматично віддаватиме `dist/` замість джерел.
> Для звичайного деплою це не потрібно.

## Аналітика (Google Tag Manager)

GTM-контейнер `GTM-T5P4WRDH` вшито в `index.html` — один раз:
`<script>` у `<head>` + `<noscript>` одразу після `<body>`. Квіз шле події **лише** у `window.dataLayer`
(`quiz_start`, `quiz_step`, `quiz_answer`, `quiz_back`, `quiz_submit_error`, `generate_lead`) —
без `gtag`/GA4/`fbq`; GA4 та інші теги маркетолог вмикає всередині GTM.

- CSP вимкнено на сервері (`contentSecurityPolicy: false` у `server/app.js`), тож GTM не блокується.
- Перевірка подій на проді: відкрийте `https://ваш-піддомен/?wdq_debug=1` — кожен push друкується в
  консолі (`console.table`). Також працює GTM Preview.
- Персональні дані в dataLayer не передаються (телефон, username, посилання, текст «іншої» сфери, lead_id).

## Типові помилки

- **Білий екран / немає стилів** → не приїхали теки `src/`/`shared/`, або застосунок не на корені
  піддомену (квіз використовує абсолютні шляхи `/src`, `/shared`, `/assets`).
- **Фото не вантажаться** → не залито теку `assets/`.
- **Застосунок не стартує** → перевірте, що startup file = `app.cjs`, версія Node ≥ 20 і що
  залито теку `shared/` (бекенд її імпортує — без неї `Cannot find module ua-mobile-codes.js`).
- **`/api/health` не відповідає** → подивіться лог застосунку в cPanel (кнопка перегляду логів).
