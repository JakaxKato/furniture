import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run build && npm run e2e:server -w @teduh/api',
      url: 'http://127.0.0.1:4100/api/v1/health',
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
    },
  ],
});
