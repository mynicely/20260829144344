<template>
  <div class="page admin-page">
    <h1>提现审核</h1>
    <AdminNav />

    <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span class="tag" style="background:#f57c00;">待审核 {{ stat('pending').c }} / ¥{{ stat('pending').s }}</span>
      <span class="tag" style="background:#1976d2;">待打款 {{ stat('approved').c }} / ¥{{ stat('approved').s }}</span>
      <span class="tag" style="background:#2e7d32;">已打款 {{ stat('paid').c }} / ¥{{ stat('paid').s }}</span>
      <span class="tag" style="background:#d32f2f;">已驳回 {{ stat('rejected').c }}</span>
      <select class="input" v-model="status" style="flex:1;margin-bottom:0;" @change="load">
        <option value="all">全部状态</option>
        <option value="pending">待审核</option>
        <option value="approved">待打款</option>
        <option value="paid">已打款</option>
        <option value="rejected">已驳回</option>
      </select>
    </div>

    <div class="card">
      <table class="table">
        <tr><th>ID</th><th>申请人</th><th>金额</th><th>收款信息</th><th>状态</th><th>申请时间</th><th>操作</th></tr>
        <tr v-for="w in list" :key="w.id">
          <td>#{{ w.id }}</td>
          <td>{{ w.nickname || '#' + w.user_id }}<br/><span class="muted">{{ w.phone }}</span></td>
          <td class="price">¥{{ w.amount }}</td>
          <td>{{ payTypeText(w.pay_type) }}<br/><span class="muted">{{ w.account }}（{{ w.real_name }}）</span></td>
          <td><span class="tag" :style="tagStyle(w.status)">{{ statusText(w.status) }}</span><br/><span v-if="w.admin_remark" class="muted" style="font-size:11px;">{{ w.admin_remark }}</span></td>
          <td class="muted">{{ w.created_at }}<br/>{{ w.processed_at ? '处理：' + w.processed_at : '' }}</td>
          <td>
            <button v-if="w.status === 'pending'" class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:#2e7d32;border-color:#2e7d32;" @click="act(w,'approve')">通过</button>
            <button v-if="w.status === 'approved'" class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:#1976d2;border-color:#1976d2;margin-top:4px;" @click="act(w,'pay')">确认打款</button>
            <button v-if="w.status === 'pending'" class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:#d32f2f;border-color:#d32f2f;margin-top:4px;" @click="act(w,'reject')">驳回</button>
          </td>
        </tr>
        <tr v-if="!list.length"><td colspan="7" class="muted">暂无提现单</td></tr>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../api'
import { dialog } from '../../utils/dialog'
import AdminNav from './AdminNav.vue'

const route = useRoute()
const list = ref([])
const stats = ref([])
const status = ref(route.query.status || 'all')

onMounted(load)
async function load() {
  try {
    const params = new URLSearchParams()
    if (status.value && status.value !== 'all') params.set('status', status.value)
    const r = await api.get('/admin/withdrawals?' + params.toString())
    list.value = r.data
    stats.value = r.stats || []
  } catch (e) { alert(e.message) }
}
function stat(s) { return stats.value.find(x => x.status === s) || { c: 0, s: 0 } }

async function act(w, action) {
  const texts = { approve: '通过该提现申请？通过后进入待打款', pay: '确认已向该用户打款？', reject: '驳回该提现申请？金额将释放回可提现余额' }
  if (!(await dialog.confirm(`确认${texts[action]}（¥${w.amount}）？`))) return
  const remark = await dialog.prompt('备注（选填）：')
  if (remark === null) return
  try {
    const r = await api.post('/admin/withdrawals/' + w.id, { action, remark })
    alert(r.msg); load()
  } catch (e) { alert(e.message) }
}

function statusText(s) { return { pending: '待审核', approved: '待打款', paid: '已打款', rejected: '已驳回' }[s] || s }
function payTypeText(s) { return { wechat: '微信', alipay: '支付宝', bank: '银行卡' }[s] || s }
function tagStyle(s) {
  return {
    pending: 'background:#f57c00;',
    approved: 'background:#1976d2;',
    paid: 'background:#2e7d32;',
    rejected: 'background:#d32f2f;',
  }[s] || ''
}
</script>
