import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, fullyParallel: false, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3100', browserName: 'chromium', launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: process.env.CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote'] : [] } },
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100/login', reuseExistingServer: false, timeout: 120000 },
});
