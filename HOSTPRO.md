# Деплой квіза well done на HostPro (cPanel → Node.js)

HostPro використовує **Node.js Selector (CloudLinux + Phusion Passenger)** у cPanel.
Застосунок запускається через «Application startup file», порт і `NODE_ENV` дає Passenger,
змінні середовища задаються в UI застосунку.

> Проєкт уже адаптований під Passenger: стартовий файл — **`app.cjs`** (місток до ESM),
> порт береться з `process.env.PORT` як є (Passenger може дати unix-сокет), `.env` читається
> автоматично, якщо є, але **не перезаписує** змінні, задані в панелі.

## 0. Підготовка локально (один раз перед завантаженням)

```bash
npm install
npm run build     # створює dist/ (зібраний фронтенд)
```

Завантажуємо на сервер **увесь проєкт разом із `dist/`**, але **без**:
`node_modules/`, `.env`, `data/` (створяться на сервері).

Тобто вантажимо: `app.cjs`, `server/`, `src/`, `assets/`, `content/`, `index.html`,
`dist/`, `package.json`, `package-lock.json`, `vite.config.js`.

> Чому так: якщо залити вже зібраний `dist/`, на сервері потрібні лише runtime-залежності
> (express, zod, helmet, express-rate-limit), а важкий Vite ставити й білдити на хостингу не треба.

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
npm install --omit=dev      # лише runtime-залежності (dist уже зібрано локально)
```

## 6. Запуск

Натисніть **Restart** (або Start). Відкрийте піддомен — квіз має працювати.
Перевірка API: `https://ваш-піддомен/api/health` → `{"ok":true}`.

Заявки зберігаються у файл **`data/leads.jsonl`** в Application root (створюється автоматично).
Переконайтесь, що тека з правом запису (за замовчуванням так і є) і додайте її в бекап.

## Оновлення в майбутньому

- Змінили **фронтенд** (квіз): локально `npm run build`, залийте оновлені `dist/` і `src/`, **Restart**.
- Змінили **бекенд** (`server/`): залийте зміни, **Restart**.
- Якщо правили лише тексти — оновіть `content/quiz-content.json`, перегенеруйте `src/wd-quiz-content.js`
  (команда в `src/README.md`), `npm run build`, залийте `dist/`, **Restart**.

## Типові помилки

- **Білий екран / немає стилів** → не залито `dist/` або застосунок не на корені піддомену
  (квіз використовує абсолютні шляхи `/assets`, `/bundle`).
- **Фото не вантажаться** → не залито теку `assets/`.
- **Застосунок не стартує** → перевірте, що startup file = `app.cjs` і версія Node ≥ 20.
- **`/api/health` не відповідає** → подивіться лог застосунку в cPanel (кнопка перегляду логів).
