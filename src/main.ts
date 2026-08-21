import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './assets/styles/style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// TZ v1.6 §11: ошибка загрузки ленивого модуля страницы (устаревший чанк после
// новой сборки) не должна оставлять пустой экран — предлагаем перезагрузку.
router.onError((error) => {
  const message = error instanceof Error ? error.message : String(error)
  if (
    /Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)
  ) {
    const overlay = document.createElement('div')
    overlay.className =
      'fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6'
    overlay.innerHTML = `
      <div class="max-w-md space-y-4 text-center">
        <p class="text-lg font-semibold text-foreground">Не удалось загрузить часть приложения</p>
        <p class="text-sm text-muted-foreground">Возможно, обновилась версия стенда. Перезагрузите страницу, чтобы получить актуальную сборку.</p>
        <button type="button" class="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" onclick="location.reload()">Перезагрузить</button>
      </div>
    `
    document.body.appendChild(overlay)
    return
  }
  console.error('[router]', error)
})

app.mount('#app')
