<template>
  <div class="page">
    <h1>消息通知</h1>

    <div class="card" v-if="!store.token">
      <p class="muted">请先登录</p>
      <button class="btn btn-block" @click="$router.push('/login')">登录</button>
    </div>

    <template v-else>
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
        <p>共 <b>{{ list.length }}</b> 条通知，未读 <b style="color:#d32f2f;">{{ unread }}</b> 条</p>
        <button class="btn btn-outline" @click="markAllRead">全部已读</button>
      </div>

      <div class="card">
        <div v-for="n in list" :key="n.id" class="trial-item" :style="{ background: n.is_read ? 'transparent' : '#fff8e1', borderRadius: '8px', padding: '10px' }">
          <p>
            <span class="tag" :style="typeStyle(n.type)">{{ typeText(n.type) }}</span>
            <span v-if="!n.is_read" class="tag" style="background:#d32f2f;">未读</span>
            <span class="muted" style="float:right;font-size:12px;">{{ n.created_at }}</span>
          </p>
          <p style="line-height:1.7;">{{ n.content }}</p>
        </div>
        <p v-if="!list.length" class="muted" style="text-align:center;">暂无通知</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'
import { useUserStore } from '../store'

const store = useUserStore()
const list = ref([])
const unread = ref(0)

const typeMap = {
  trainee_warning: '管培生预警',
  fill_remind: '补位提醒',
  frozen_income: '收入冻结',
  reward: '奖励到账',
  system: '系统通知',
}
const typeStyle = (t) => {
  const map = {
    trainee_warning: 'background:#f57c00;',
    fill_remind: 'background:#1565c0;',
    frozen_income: 'background:#d32f2f;',
    reward: 'background:#2e7d32;',
  }
  return map[t] || 'background:#666;'
}
const typeText = (t) => typeMap[t] || '系统通知'

onMounted(load)

async function load() {
  if (!store.token) return
  try {
    const r = await api.get('/user/notices')
    list.value = r.data
    unread.value = r.unread
  } catch (e) { alert(e.message) }
}

async function markAllRead() {
  try {
    await api.post('/user/notices/read')
    unread.value = 0
    list.value = list.value.map(n => ({ ...n, is_read: 1 }))
    alert('已全部标记为已读')
  } catch (e) { alert(e.message) }
}
</script>
