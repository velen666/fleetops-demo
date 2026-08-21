import { defineConfig, devices } from '@playwright/test'

// Демо-E2E: dev-сервер :5180 должен быть запущен вручную (pnpm dev).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  outputDir: './e2e-results',
  use: {
    baseURL: 'http://localhost:5180',
    ...devices['Desktop Chrome'],
  },
})
