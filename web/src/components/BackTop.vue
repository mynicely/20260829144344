<template>
  <transition name="bt-fade">
    <button v-if="visible" class="back-top" @click="scrollTop" aria-label="返回顶部">
      <svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6l6-6 6 6"/></svg>
    </button>
  </transition>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
const visible = ref(false)
let sc = null
function onScroll() {
  const el = sc || window
  const y = (el === window ? el.pageYOffset : el.scrollTop) || 0
  visible.value = y > 260
}
function scrollTop() {
  const el = sc || window
  if (el === window) window.scrollTo({ top: 0, behavior: 'smooth' })
  else el.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(() => {
  sc = document.querySelector('.page') ? (document.querySelector('.page').closest('.scroll-area') || window) : window
  onScroll()
  ;(sc === window ? window : sc).addEventListener('scroll', onScroll, { passive: true })
})
onBeforeUnmount(() => {
  ;(sc === window ? window : sc).removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.back-top {
  position: fixed;
  right: 14px; bottom: 84px;
  z-index: 120;
  width: 42px; height: 42px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 253, 249, .94);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(74, 51, 28, .20);
  color: var(--brand);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: transform .2s, box-shadow .2s;
}
.back-top:active { transform: scale(.92); }
.back-top svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.bt-fade-enter-active, .bt-fade-leave-active { transition: opacity .25s, transform .25s; }
.bt-fade-enter-from, .bt-fade-leave-to { opacity: 0; transform: translateY(10px); }
</style>
