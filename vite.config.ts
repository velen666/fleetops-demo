import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    // юнит-уровень: только src; e2e-спеки исполняет Playwright (`npx playwright test`)
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    strictPort: false,
    host: true,
    allowedHosts: true,
    watch: {
      // e2e-артефакты не должны ронять watcher (EBUSY на .crdownload)
      ignored: ['**/e2e-results/**', '**/e2e-screens/**'],
    },
  },
})
