<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from 'vue-sonner'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
onMounted(() => auth.restore())

// TZ v1.6 §11: индикатор загрузки при переходах (ленивые чанки страниц).
const routeLoading = ref(false)
const router = useRouter()
router.beforeEach(() => {
  routeLoading.value = true
})
router.afterEach(() => {
  routeLoading.value = false
})
</script>

<template>
  <div
    v-if="routeLoading"
    class="fixed top-0 inset-x-0 z-[90] h-0.5 overflow-hidden"
    role="progressbar"
    aria-label="Загрузка страницы"
  >
    <div class="h-full w-1/3 animate-[route-slide_1s_ease-in-out_infinite] bg-primary" />
  </div>
  <RouterView />
  <Toaster position="top-right" rich-colors />
</template>

<style>
@keyframes route-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}
</style>
