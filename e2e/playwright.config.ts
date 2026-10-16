import { defineConfig, devices } from '@playwright/test';

/**
 * Uçtan uca testler yalıtılmış bir Docker ortamına karşı çalışır:
 *   pnpm test:e2e   (scripts/with-test-stack.sh ortamı kurar ve E2E_BASE_URL'i verir)
 * Tarayıcı olarak sistemdeki Google Chrome kullanılır (ayrı indirme gerekmez).
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL,
    channel: 'chrome',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
