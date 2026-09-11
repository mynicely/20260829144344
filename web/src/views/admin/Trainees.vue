<template>
  <div class="page admin-page">
    <h1>管培生管理</h1>
    <AdminNav />
    <div class="card" style="display:flex;gap:8px;">
      <button class="btn btn-outline" @click="exportCsv('trainees')">⬇️ 导出管培生</button>
      <button class="btn btn-outline" @click="exportCsv('users')">⬇️ 导出学员</button>
    </div>
    <div class="card">
      <table class="table">
        <tr><th>ID</th><th>昵称</th><th>名额</th><th>类型</th><th>推荐人</th><th>帮扶主理人</th><th>状态</th><th>业绩</th><th>补位</th><th>操作</th></tr>
        <tr v-for="t in trainees" :key="t.id">
          <td>{{ t.id }}</td><td>{{ t.nickname }}</td><td>第{{ t.slot_no }}名</td>
          <td>{{ slotTypeText(t.slot_type) }}</td>
          <td>{{ t.leader_id }}</td>
          <td>{{ t.helper_id }}</td>
          <td :class="'status-' + t.month_status">{{ statusText(t.month_status) }}</td>
          <td>¥{{ t.month_perf }}</td>
          <td>{{ t.reserve_count }}/2</td>
          <td>
            <button v-if="t.slot_status === 'frozen'" class="btn btn-outline" @click="openFill(t)">补位</button>
          </td>
        </tr>
      </table>
    </div>

    <!-- 补位选人面板 -->
    <div class="card" v-if="fillTarget">
      <h2>为第{{ fillTarget.slot_no }}名额补位</h2>
      <p class="muted" style="font-size:12px;">补位学员须为该主理人介绍、已付费、且未占用其他名额。</p>
      <label class="label">新学员手机号</label>
      <div style="display:flex;gap:8px;">
        <input class="input" v-model="searchPhone" placeholder="输入手机号查询" />
        <button class="btn btn-outline" @click="searchUser">查询</button>
      </div>
      <div v-if="candidates.length" style="margin-top:10px;">
        <div v-for="u in candidates" :key="u.id" class="cand" @click="confirmFill(u)">
          {{ u.nickname }}（{{ u.phone }}） 身份:{{ u.identity }} 已付费:{{ u.is_paid ? '是' : '否' }}
        </div>
      </div>
      <p v-if="searchMsg" class="muted" style="font-size:12px;">{{ searchMsg }}</p>
      <button class="btn btn-outline" style="margin-top:8px;" @click="fillTarget = null">取消</button>
    </div>
    <div class="card">
      <h2>发放培育奖</h2>
      <p class="muted" style="font-size:12px;">培育奖归帮扶主理人：每名推荐人留下的前2名名额全部孵化合格=1组，每组200元。</p>
      <label class="label">帮扶主理人用户ID</label>
      <input class="input" v-model.number="mentorId" placeholder="输入帮扶主理人用户ID" />
      <button class="btn btn-block" @click="payHelp">发放培育奖</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import { dialog } from '../../utils/dialog'
import AdminNav from './AdminNav.vue'
const trainees = ref([])
const mentorId = ref('')
const fillTarget = ref(null)
const searchPhone = ref('')
const candidates = ref([])
const searchMsg = ref('')
function statusText(s) { return { qualified: '合格', probation: '见习', invalid: '失效', cleared: '已清退' }[s] || s }
function slotTypeText(s) { return { assessment: '考核名额', replace: '补位名额', permanent: '终身绑定' }[s] || '考核名额' }
onMounted(async () => {
  try { trainees.value = (await api.get('/admin/trainees')).data } catch (e) {}
})
function openFill(t) { fillTarget.value = t; candidates.value = []; searchPhone.value = ''; searchMsg.value = '' }
async function searchUser() {
  if (!searchPhone.value) return alert('请输入手机号')
  candidates.value = []
  searchMsg.value = '查询中...'
  try {
    const list = (await api.get('/admin/users')).data || []
    const hit = list.filter(u => String(u.phone).includes(searchPhone.value.trim()))
    candidates.value = hit.slice(0, 5)
    searchMsg.value = hit.length ? `找到 ${hit.length} 位学员，点击选择` : '未找到该手机号的学员'
  } catch (e) { searchMsg.value = e.message }
}
async function confirmFill(u) {
  if (!(await dialog.confirm(`确认由「${u.nickname}（${u.phone}）」补位第${fillTarget.value.slot_no}名额？`))) return
  try {
    const r = await api.post('/admin/fill-reserve', { traineeId: fillTarget.value.id, newUserId: u.id })
    alert(r.msg || r.message)
    fillTarget.value = null
    onMounted()
  } catch (e) { alert(e.message) }
}
async function exportCsv(type) {
  try {
    const res = await fetch('/api/admin/export/' + type, { headers: { Authorization: 'Bearer ' + localStorage.getItem('admin_token') } })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.msg || '导出失败'); return }
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const fn = decodeURIComponent((cd.match(/filename="?([^";]+)/) || [])[1] || ('hanmo_' + type + '.csv'))
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fn
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  } catch (e) { alert(e.message) }
}
async function payHelp() {
  try { const r = await api.post('/admin/pay-help-reward', { mentorId: mentorId.value }); alert(r.ok ? '发放成功 ¥'+r.total : r.msg) }
  catch (e) { alert(e.message) }
}
</script>

<style scoped>
.cand { padding: 10px 12px; margin: 6px 0; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; font-size: 13px; }
.cand:hover { border-color: #8b4513; background: #faf5ef; }
</style>
