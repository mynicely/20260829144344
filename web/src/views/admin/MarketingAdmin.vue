<template>
  <div class="page admin-page">
    <h1>营销活动管理</h1>
    <AdminNav />

    <div class="card">
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <button class="btn" :class="{ on: tab === 'group' }" style="flex:1;" @click="switchTab('group')">👥 拼团活动</button>
        <button class="btn" :class="{ on: tab === 'bargain' }" style="flex:1;" @click="switchTab('bargain')">🔪 砍价活动</button>
      </div>
      <select class="input" v-model="status" @change="load">
        <option value="all">全部状态</option>
        <template v-if="tab === 'group'">
          <option value="pending">待确认收款</option>
          <option value="opening">拼团中</option>
          <option value="success">已成团</option>
          <option value="failed">已失败</option>
        </template>
        <template v-else>
          <option value="pending">待确认收款</option>
          <option value="active">砍价中</option>
          <option value="success">已砍到</option>
          <option value="expired">已过期</option>
        </template>
      </select>
      <button class="btn btn-outline" @click="cleanup">🧹 清理过期活动</button>
    </div>

    <!-- 拼团列表 -->
    <template v-if="tab === 'group'">
      <div class="card" v-for="g in list" :key="g.id">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <p><b>团 #{{ g.id }}</b>（{{ g.group_no }}）<span class="tag">{{ groupStatusText(g.status) }}</span></p>
          <span v-if="g.status === 'opening' || g.status === 'pending'" class="countdown"><span class="box">剩</span>{{ groupRemain(g) }}</span>
        </div>
        <p>课程：<b>{{ g.course_title || '未知' }}</b>｜主理人：#{{ g.leader_user }}</p>
        <p>
          进度：<b>{{ g.memberCount }}/{{ g.min_count }}</b> 人
          ｜优惠：<span class="price">¥{{ g.discount_amount || 0 }}</span>
          ｜发起：{{ g.created_at }}
        </p>
        <div class="progress-track" style="height:8px;margin:8px 0 6px;">
          <div class="progress-fill" :style="{ width: groupProgress(g) + '%' }"></div>
        </div>
        <p class="muted" style="font-size:12px;">还差 {{ Math.max(0, (g.min_count || 0) - (g.memberCount || 0)) }} 人成团｜进度 {{ groupProgress(g) }}%</p>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
          <span v-for="m in g.members" :key="m.id" class="tag" style="background:#5d4037;">
            {{ m.user_id === g.leader_user ? '👑' : '' }}{{ m.nickname }}（#{{ m.user_id }}）
          </span>
        </div>
      </div>
      <p v-if="!list.length" class="muted" style="text-align:center;">暂无拼团活动</p>
    </template>

    <!-- 砍价列表 -->
    <template v-else>
      <div class="card" v-for="b in list" :key="b.id">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <p><b>砍价 #{{ b.id }}</b>（{{ b.course_title || '未知' }}）<span class="tag">{{ bargainStatusText(b.status) }}</span></p>
          <span v-if="b.status === 'active' || b.status === 'pending'" class="countdown"><span class="box">剩</span>{{ bargainRemain(b) }}</span>
        </div>
        <p>发起人：#{{ b.initiator_id }}</p>
        <p>
          价格：<span class="price">¥{{ b.current_price }}</span> / ¥{{ b.original_price }}
          （底价 ¥{{ b.floor_price }}）｜已砍 <b>{{ b.helps }}/{{ b.max_helps }}</b> 人
        </p>
        <div class="progress-track" style="height:8px;margin:8px 0 6px;">
          <div class="progress-fill" :style="{ width: bargainProgress(b) + '%' }"></div>
        </div>
        <p class="muted" style="font-size:12px;">已砍 {{ bargainProgress(b) }}%</p>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
          <span v-for="h in b.helpsList" :key="h.id" class="tag" style="background:#e65100;">
            {{ h.nickname }}（-¥{{ h.cut_amount }}）
          </span>
        </div>
      </div>
      <p v-if="!list.length" class="muted" style="text-align:center;">暂无砍价活动</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const route = useRoute()
const tab = ref(route.query.tab === 'bargain' ? 'bargain' : 'group')
const status = ref(route.query.status || 'all')
const list = ref([])
const now = ref(Date.now())
let timer = null
const pad = (n) => String(n).padStart(2, '0')

const groupStatusText = (s) => ({ pending: '待确认收款', opening: '拼团中', success: '已成团', failed: '已失败', cancelled: '已取消' }[s] || s)
const bargainStatusText = (s) => ({ pending: '待确认收款', active: '砍价中', success: '已砍到', expired: '已过期', cancelled: '已取消' }[s] || s)

function formatRemain(diff) {
  if (diff <= 0) return '已结束'
  const h = Math.floor(diff / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
const groupRemain = (g) => g.expire_at ? formatRemain(new Date(g.expire_at).getTime() - now.value) : ''
const bargainRemain = (b) => b.expire_at ? formatRemain(new Date(b.expire_at).getTime() - now.value) : ''
const groupProgress = (g) => Math.min(100, Math.round((g.member_count || 0) / (g.min_count || 1) * 100))
const bargainProgress = (b) => {
  const total = b.original_price - b.floor_price
  const done = b.original_price - b.current_price
  return total <= 0 ? 100 : Math.min(100, Math.round(done / total * 100))
}

onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000); load() })
onUnmounted(() => { if (timer) clearInterval(timer) })

function switchTab(t) { tab.value = t; status.value = 'all'; load() }

async function load() {
  try {
    const url = tab.value === 'group' ? '/admin/groups' : '/admin/bargains'
    const params = new URLSearchParams()
    if (status.value && status.value !== 'all') params.set('status', status.value)
    list.value = (await api.get(url + '?' + params.toString())).data
  } catch (e) { alert(e.message) }
}

async function cleanup() {
  try {
    const r = await api.post('/admin/marketing/cleanup')
    alert(r.msg)
    load()
  } catch (e) { alert(e.message) }
}
</script>
