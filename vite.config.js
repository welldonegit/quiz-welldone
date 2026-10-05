import { defineConfig } from "vite";

// Фронт звертається лише до відносного /api та /assets.
// У dev проксуємо їх на Node-сервер (порт 3001). У production усе віддає один Node-процес.
export default defineConfig({
  root: ".",
  publicDir: false, // статику (assets) віддає Node-сервер, не Vite
  build: {
    outDir: "dist",
    assetsDir: "bundle", // хешовані js/css кладемо в dist/bundle, щоб не плутати з /assets
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true, // слухати на всіх інтерфейсах (0.0.0.0) — щоб порт форвардився у devcontainer/віддалено
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/assets": { target: "http://127.0.0.1:3001", changeOrigin: true },
    },
  },
});
