// Config Playwright — outillage de test uniquement, ne fait pas partie de
// l'app livrée (voir package.json). Sert le repo tel quel via
// python -m http.server, sans aucune étape de build (cohérent avec
// .claude/launch.json, config "voidfall-static").
var defineConfig = require('@playwright/test').defineConfig;
var devices = require('@playwright/test').devices;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] }
  ],
  webServer: {
    command: 'python -m http.server 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000
  }
});
