<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>
    <div class="card">
      <h1>{{ info?.title || '为什么选择我们' }}</h1>
      <div class="rich-content" v-html="info?.content || '<p>加载中...</p>'" style="line-height:1.9;"></div>
    </div>
    <div class="card" style="text-align:center;">
      <button class="btn btn-block" @click="$router.push('/')">返回首页</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'
const info = ref(null)
onMounted(async () => {
  try { info.value = (await api.get('/company')).data } catch (e) {}
})
</script>
