<template>
  <div class="route-progress" :class="{ show: active }">
    <div class="rp-bar"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const active = ref(false)
let timer = null

function start() {
  if (timer) clearTimeout(timer)
  active.value = true
}
function done() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { active.value = false }, 260)
}

onMounted(() => {
  router.beforeEach((to, from, next) => { start(); next() })
  router.afterEach(() => { done() })
})
</script>

<style scoped>
.route-progress {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 3px;
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
  transition: opacity .3s;
}
.route-progress.show { opacity: 1; }
.rp-bar {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, var(--gold), #ff8f2b);
  border-radius: 0 3px 3px 0;
  animation: rp-slide 1.1s ease-in-out infinite;
  box-shadow: 0 0 10px rgba(255, 143, 43, .6);
}
@keyframes rp-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(280%); }
}
</style>
