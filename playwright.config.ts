import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:demo --workspace @marriage/server',
      port: 3000,
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev --workspace @marriage/client',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
