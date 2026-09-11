<template>
  <span class="count-up">{{ display }}</span>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  duration: { type: Number, default: 1200 },
  decimals: { type: Number, default: 0 },
  prefix: { type: String, default: '' },
  suffix: { type: String, default: '' },
  /** 动画延迟（ms） */
  delay: { type: Number, default: 0 },
})

const display = ref('')
let raf = null
let timer = null

function fmt(v) {
  return props.prefix + v.toFixed(props.decimals) + props.suffix
}

function animate(from, to) {
  if (raf) cancelAnimationFrame(raf)
  const start = performance.now()
  const dur = props.duration
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur)
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    display.value = fmt(from + (to - from) * eased)
    if (t < 1) raf = requestAnimationFrame(step)
    else display.value = fmt(to)
  }
  raf = requestAnimationFrame(step)
}

function run() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => animate(0, Number(props.value) || 0), props.delay)
}

onMounted(run)
watch(() => props.value, run)
</script>
