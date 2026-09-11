<template>
  <div class="page">
    <h1>我的学习小组 / 分享伙伴</h1>

    <div class="card" v-if="warning">
      <p style="color:#d32f2f;font-weight:600;">⚠️ {{ warning }}</p>
      <p class="muted">请及时补推合格分享伙伴完成补位，否则所有收入将冻结。</p>
    </div>

    <div class="card" v-if="!me">
      <p class="muted">请先登录</p>
      <button class="btn btn-block" @click="$router.push('/login')">登录</button>
    </div>

    <template v-if="me">
      <div class="card">
        <h2>我的学习小组（我帮扶，拿帮扶激励）共 {{ myTeam.length }} 人</h2>
        <p class="muted" style="font-size:12px;">包含：我转介绍的第3名及以后，以及补位名额留给我的第1、2名学员。</p>
        <table class="table">
          <tr><th>学员</th><th>来源</th><th>名额</th><th>状态</th><th>考核期</th><th>业绩</th></tr>
          <tr v-for="t in myTeam" :key="t.id">
            <td>{{ t.nickname || '#'+t.user_id }}</td>
            <td>{{ t.leader_id === me.id ? '我邀请' : '补位名额' }}</td>
            <td>第{{ t.slot_no }}名</td>
            <td :class="statusClass(t)">{{ statusText(t) }}</td>
            <td><span class="cycle-line">{{ cycleText(t) }}</span></td>
            <td>¥{{ fmtMoney(t.month_perf) }}</td>
          </tr>
          <tr v-if="!myTeam.length"><td colspan="6" class="muted">暂无小组成员</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>我邀请的名额（享受其奖励收入10%待遇）共 {{ myReferrals.length }} 人</h2>
        <p class="muted" style="font-size:12px;">待遇=该管培生当月实得奖励收入(介绍奖、培育奖等工资)的10%，非销售额；前2名留给介绍人帮扶，第3名起在自己学习小组。名额不达标由我重新邀请补位。</p>
        <table class="table">
          <tr><th>学员</th><th>实际帮扶人</th><th>名额</th><th>状态</th><th>考核期</th><th>业绩</th><th>操作</th></tr>
          <tr v-for="t in myReferrals" :key="t.id">
            <td>{{ t.nickname || '#'+t.user_id }}</td>
            <td>
              <template v-if="t.helper_id === me.id">我帮扶</template>
              <template v-else>{{ t.helper_nickname ? '好友「' + t.helper_nickname + '」帮扶' : '待分配' }}</template>
            </td>
            <td>第{{ t.slot_no }}名</td>
            <td :class="statusClass(t)">{{ statusText(t) }}</td>
            <td><span class="cycle-line">{{ cycleText(t) }}</span></td>
            <td>¥{{ fmtMoney(t.month_perf) }}</td>
            <td>
              <button v-if="t.slot_status === 'frozen'" class="btn btn-outline" @click="fill(t.id)">补位</button>
              <span v-else class="muted">—</span>
            </td>
          </tr>
          <tr v-if="!myReferrals.length"><td colspan="7" class="muted">暂无邀请名额</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>补位倒计时</h2>
        <div v-for="t in frozenTrainees" :key="t.id" class="mt">
          <p>第{{ t.slot_no }}名额 待补位，截止：{{ t.reserve_deadline }}</p>
          <p class="muted">已补位 {{ t.reserve_count }} 次 / 最多2次</p>
          <button class="btn" @click="fill(t.id)">立即补位</button>
        </div>
        <p v-if="!frozenTrainees.length" class="muted">暂无待补位名额</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../api'
import { useUserStore } from '../store'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'

const store = useUserStore()
const me = ref(null)
const trainees = ref([])

// 我帮扶的学习小组成员（helper_id=我）：我拿他们的培育奖/帮扶激励
const myTeam = computed(() => trainees.value.filter(t => t.helper_id === me.value?.id))
// 我邀请的名额（leader_id=我）：我享受其分享奖励10%，由我负责补位
const myReferrals = computed(() => trainees.value.filter(t => t.leader_id === me.value?.id))
const frozenTrainees = computed(() => myReferrals.value.filter(t => t.slot_status === 'frozen'))
const warning = computed(() => {
  const bad = myReferrals.value.filter(t => ['probation','invalid','cleared'].includes(t.month_status)).length
  return bad ? `您有 ${bad} 名分享伙伴未达标（见习/失效/待清退），收入可能被冻结` : ''
})

function statusText(t) {
  const map = { qualified: '合格', probation: '见习', invalid: '失效', cleared: '已清退' }
  return map[t.month_status] || t.month_status
}
function statusClass(t) {
  return 'status-' + t.month_status
}
function cycleText(t) {
  if (t.cycle_remaining_days == null) return '—'
  const end = t.cycle_end_at ? t.cycle_end_at.slice(5) : ''
  return `剩 ${t.cycle_remaining_days} 天` + (end ? ` · 至 ${end}` : '')
}

onMounted(async () => {
  me.value = await store.fetchMe()
  if (!store.token) return
  try { trainees.value = (await api.get('/user/trainees')).data } catch (e) {}
})

async function fill(id) {
  const input = await dialog.prompt('请输入补位新学员的手机号（须为您直接邀请的已付费学员）：')
  if (!input || !input.trim()) return
  try {
    const r = await api.post('/user/fill-reserve', { traineeId: id, phone: input.trim() })
    alert(r.ok ? r.msg : (r.msg || '操作失败'))
    if (r.ok) trainees.value = (await api.get('/user/trainees')).data
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.cycle-line { color: #2e7d32; font-size: 12px; font-weight: 600; white-space: nowrap; }
</style>
