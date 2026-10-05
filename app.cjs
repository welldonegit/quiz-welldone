// Стартовий файл для cPanel / Phusion Passenger (HostPro).
// CommonJS-місток до ESM-застосунку: уникаємо проблем Passenger із ESM-entry.
// У налаштуваннях Node.js-застосунку cPanel вкажіть "Application startup file": app.cjs
import("./server/index.js").catch((err) => {
  console.error("[wd-quiz] не вдалося запустити застосунок:", err);
  process.exit(1);
});
