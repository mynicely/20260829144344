<template>
  <div class="page">
    <div class="rule-hero">
      <h1 style="margin:0 0 4px;">平台规则公示</h1>
      <p class="muted" style="margin:0;">合规运营 · 权益透明 · 仅两级分享，无多层级躺赚</p>
    </div>
    <div class="card" style="display:flex;gap:8px;">
      <button class="btn" :class="ver==='simple' ? 'btn-primary' : 'btn-ghost'" style="flex:1;" @click="load('simple')">极简用户版</button>
      <button class="btn" :class="ver==='full' ? 'btn-primary' : 'btn-ghost'" style="flex:1;" @click="load('full')">完整官方版</button>
    </div>
    <div class="card rule-body">{{ rule }}</div>
    <div class="card" style="text-align:center;">
      <router-link to="/" class="btn btn-outline">返回首页</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'
const rule = ref('加载中...')
const ver = ref('simple')
async function load(v) {
  ver.value = v
  try { rule.value = (await api.get('/rules/' + v)).data } catch (e) { rule.value = '加载失败' }
}
onMounted(() => load('simple'))
</script>

<style scoped>
.rule-hero {
  background: var(--grad);
  color: #fff;
  border-radius: 18px;
  padding: 18px 20px;
  margin-bottom: 14px;
  box-shadow: 0 10px 26px rgba(138, 74, 30, .26);
}
.rule-hero h1 { color: #fff; }
.rule-hero .muted { color: rgba(255, 255, 255, .8); }
.rule-body { white-space: pre-wrap; line-height: 1.9; }
</style>
