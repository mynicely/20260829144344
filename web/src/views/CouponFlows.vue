<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>

    <div class="card" v-if="me">
      <p>可用抵用券：<b class="price" style="font-size:24px;">¥{{ fmtMoney(me.couponBalance) }}</b></p>
      <p class="muted">累计赚取 ¥{{ fmtMoney(me.totalEarned) }}｜抵用券仅可抵扣课程/活动，禁止提现、退款、折现</p>
    </div>

    <div class="card">
      <h2>抵用券收支明细</h2>
      <div v-for="f in flows" :key="f.id" class="trial-item">
        <p style="display:flex;justify-content:space-between;align-items:center;">
          <span class="tag" :style="f.change_amount >= 0 ? 'background:#2e7d32;' : 'background:#f57c00;'">{{ typeText(f.type) }}</span>
          <b :style="{ color: f.change_amount >= 0 ? '#2e7d32' : '#d32f2f', fontSize: '16px' }">
            {{ f.change_amount >= 0 ? '+' : '' }}{{ fmtMoney(f.change_amount) }}
          </b>
        </p>
        <p class="muted">{{ f.remark || '' }}｜余额 ¥{{ fmtMoney(f.balance_after) }}｜{{ f.created_at }}</p>
      </div>
      <p v-if="!flows.length" class="muted">暂无明细，完成打卡/学习任务即可赚取抵用券</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { fmtMoney } from '../utils/fmt'

const router = useRouter()
const store = useUserStore()
const me = ref(null)
const flows = ref([])

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  me.value = await store.fetchMe()
  try { flows.value = (await api.get('/user/coupon-flows')).data } catch (e) {}
})

function typeText(t) { return { task: '打卡/任务', order: '课程抵扣', reward: '奖励发放', refund: '退款返还' }[t] || t }
</script>
