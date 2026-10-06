import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLeadRouter } from "./routes/lead.js";

const assetsDir = fileURLToPath(new URL("../assets/", import.meta.url));
const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const distIndex = fileURLToPath(new URL("../dist/index.html", import.meta.url));
// Джерела фронтенду (vanilla ES-модулі + CSS) — віддаємо напряму, якщо білду немає.
const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const sharedDir = fileURLToPath(new URL("../shared/", import.meta.url));
const rootIndex = fileURLToPath(new URL("../index.html", import.meta.url));

export function createApp({ seen } = {}) {
  const app = express();

  // За проксі (Nginx/хостинг) — коректний req.ip. Налаштовується TRUST_PROXY.
  const tp = process.env.TRUST_PROXY;
  app.set("trust proxy", tp === undefined ? 1 : (/^\d+$/.test(tp) ? Number(tp) : tp));

  app.use(helmet({
    // CSP вимкнено на цьому етапі (щоб не блокувати inline-конфіг квіза). Налаштуємо під хостинг окремо.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: "20kb" }));

  // CORS: за замовчуванням той самий origin (нічого не додаємо).
  // Якщо фронт на іншому домені — дозволяємо лише ALLOWED_ORIGIN.
  const allowedOrigin = (process.env.ALLOWED_ORIGIN || "").trim();
  if (allowedOrigin) {
    app.use("/api", (req, res, next) => {
      const origin = req.get("origin");
      if (origin && origin === allowedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      }
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // Rate limit лише на прийом заявок: 5 / 10 хв на IP.
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ ok: false, message: "Забагато заявок. Спробуйте, будь ласка, за кілька хвилин." }),
  });

  app.use("/api", limiter, createLeadRouter({ seen }));

  // Статика фото/лого (і в dev через проксі Vite, і в production).
  app.use("/assets", express.static(assetsDir, { maxAge: "7d", immutable: false }));

  // Роздача фронтенду.
  // Пріоритет — зібраний dist/ (якщо робили `npm run build`: мініфікований, хешований).
  // Якщо dist немає — віддаємо ДЖЕРЕЛА напряму: index.html + /src + /shared. Білд не потрібен,
  // бо квіз — це нативні ES-модулі та звичайний CSS. Деплой: push → git pull → restart.
  if (existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(distIndex);
    });
  } else {
    // .js віддається з правильним MIME (application/javascript) — ES-модулі працюють у браузері.
    app.use("/src", express.static(srcDir, { maxAge: "1h" }));
    app.use("/shared", express.static(sharedDir, { maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(rootIndex);
    });
  }

  return app;
}

export default createApp;
