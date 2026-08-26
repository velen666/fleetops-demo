import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Демо-E2E: dev-сервер :5180 поднимается Playwright'ом автоматически
// (reuseExistingServer — уже запущенный вручную pnpm dev переиспользуется).
// outputDir вне проекта: .crdownload-артефакты роняли vite-watcher (EBUSY).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  outputDir: join(tmpdir(), 'opencode', 'pw-demo-results'),
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:5180',
    ...devices['Desktop Chrome'],
  },
})
