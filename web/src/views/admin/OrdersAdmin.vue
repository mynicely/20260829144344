<template>
  <div class="page admin-page">
    <h1>订单管理</h1>
    <AdminNav />

    <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <span class="tag">共 {{ stats.total?.c || 0 }} 单 / ¥{{ stats.total?.s || 0 }}</span>
      <span class="tag" style="background:#f57c00;">待确认收款 {{ stats.pending?.c || 0 }} / ¥{{ stats.pending?.s || 0 }}</span>
      <span class="tag" style="background:#2e7d32;">已支付 {{ stats.paid?.c || 0 }} / ¥{{ stats.paid?.s || 0 }}</span>
      <span class="tag" style="background:#666;">已关闭 {{ stats.closed?.c || 0 }}</span>
      <span class="tag" style="background:#d32f2f;">已退款 {{ stats.refunded?.c || 0 }} / ¥{{ stats.refunded?.s || 0 }}</span>
      <button class="btn btn-outline" style="margin-left:auto;" @click="exportCsv('orders')">⬇️ 导出CSV</button>
    </div>

    <div class="card">
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <select class="input" v-model="status" style="flex:1;margin-bottom:0;" @change="load">
          <option value="all">全部状态</option>
          <option value="pending">待确认收款</option>
          <option value="paid">已支付</option>
          <option value="closed">已关闭</option>
          <option value="refunded">已退款</option>
        </select>
        <input class="input" v-model="kw" style="flex:2;margin-bottom:0;" placeholder="搜索单号/学员/手机号" @keyup.enter="load" />
        <button class="btn" @click="load" style="padding:8px 14px;">搜索</button>
      </div>

      <table class="table">
        <tr><th>单号</th><th>学员</th><th>产品</th><th>金额</th><th>推荐人</th><th>状态</th><th>操作</th></tr>
        <tr v-for="o in orders" :key="o.id">
          <td style="font-size:11px;">{{ o.order_no }}</td>
          <td>{{ o.nickname || '#' + o.user_id }}</td>
          <td>{{ o.product_type }}</td>
          <td class="price">¥{{ o.amount }}</td>
          <td>{{ referrerName(o.referrer_id) }}</td>
          <td :style="{ color: statusColor(o.status) }">{{ statusText(o.status) }}</td>
          <td>
            <button class="btn btn-outline" style="padding:4px 10px;font-size:12px;" @click="detail(o)">详情</button>
            <button v-if="o.status === 'pending'" class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:#2e7d32;border-color:#2e7d32;margin-left:4px;" @click="confirmPay(o)">✓ 确认收款</button>
            <button v-if="o.status === 'pending'" class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:#f57c00;border-color:#f57c00;margin-left:4px;" @click="closeOrder(o)">关闭</button>
            <button v-if="o.status === 'paid'" class="btn btn-outline" style="padding:4px 10px;font-size:12px;color:#d32f2f;border-color:#d32f2f;margin-left:4px;" @click="refund(o)">退款</button>
          </td>
        </tr>
        <tr v-if="!orders.length"><td colspan="7" class="muted">暂无订单</td></tr>
      </table>
    </div>

    <!-- 订单详情弹窗 -->
    <div v-if="showDetail" class="modal-mask">
      <div class="modal">
        <h2>订单详情 #{{ cur.id }}</h2>
        <p><b>订单号：</b>{{ cur.order_no }}</p>
        <p><b>学员：</b>{{ cur.nickname || '#' + cur.user_id }}（{{ cur.phone || '-' }}）</p>
        <p><b>产品：</b>{{ cur.product_type }} ｜ <b>实付：</b><span class="price">¥{{ cur.amount }}</span></p>
        <p><b>使用抵用券：</b>¥{{ cur.coupon_used || 0 }}</p>
        <p><b>推荐人：</b>{{ referrerName(cur.referrer_id) }}</p>
        <p><b>支付方式：</b>{{ cur.pay_type || 'wechat' }}</p>
        <p><b>下单时间：</b>{{ cur.created_at }}</p>
        <p><b>状态：</b>{{ statusText(cur.status) }}</p>
        <p v-if="cur.paid_at"><b>支付时间：</b>{{ cur.paid_at }}</p>
        <p v-if="cur.wx_transaction_id"><b>微信交易号：</b>{{ cur.wx_transaction_id }}</p>
        <div style="display:flex;gap:8px;">
          <button class="btn" style="flex:1;" @click="showDetail = false">关闭</button>
        </div>
      </div>
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
const orders = ref([])
const stats = ref({})
const status = ref(route.query.status || 'all')
const kw = ref('')
const showDetail = ref(false)
const cur = ref({})
const userMap = ref({})

onMounted(async () => {
  try {
    const users = (await api.get('/admin/users')).data
    userMap.value = Object.fromEntries(users.map(u => [u.id, u]))
  } catch (e) {}
  load()
})

function referrerName(id) {
  if (!id) return '无'
  const u = userMap.value[id]
  return u ? u.nickname + '（#' + id + '）' : '#' + id
}

async function load() {
  try {
    const params = new URLSearchParams()
    if (status.value && status.value !== 'all') params.set('status', status.value)
    if (kw.value.trim()) params.set('kw', kw.value.trim())
    const r = await api.get('/admin/orders?' + params.toString())
    orders.value = r.data.list
    stats.value = r.data.stats
  } catch (e) { alert(e.message) }
}

function detail(o) { cur.value = o; showDetail.value = true }

const statusMap = { pending: { text: '待确认收款', color: '#f57c00' }, paid: { text: '已支付', color: '#2e7d32' }, closed: { text: '已关闭', color: '#666' }, refunded: { text: '已退款', color: '#d32f2f' } }
function statusText(s) { return statusMap[s]?.text || s }
function statusColor(s) { return statusMap[s]?.color || '#666' }

async function confirmPay(o) {
  const pt = await dialog.prompt('确认客户已通过以下方式付款？\n输入 wechat/alipay/bank（默认 wechat）：')
  if (pt === null) return
  const payType = (['wechat', 'alipay', 'bank'].includes(pt) ? pt : 'wechat')
  const note = await dialog.prompt('确认备注（选填）：')
  if (note === null) return
  if (!(await dialog.confirm(`确认已收到订单 ${o.order_no}（¥${o.amount}）的款项？确认后将立即开通课程并结算奖励/名额。`))) return
  try {
    const r = await api.post('/admin/orders/' + o.id + '/confirm-pay', { payType, note })
    alert(r.msg); load()
  } catch (e) { alert(e.message) }
}

async function closeOrder(o) {
  if (!(await dialog.confirm(`确认关闭待确认收款订单 ${o.order_no}（¥${o.amount}）？`))) return
  try {
    const r = await api.post('/admin/orders/' + o.id + '/close')
    alert(r.msg); load()
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

async function refund(o) {
  if (!(await dialog.confirm(`确认将订单 ${o.order_no}（¥${o.amount}）标记为退款？关联介绍奖励将一并回滚。`))) return
  const note = await dialog.prompt('退款备注（选填）：')
  if (note === null) return
  try {
    const r = await api.post('/admin/orders/' + o.id + '/refund', { note })
    alert(r.msg); load()
  } catch (e) { alert(e.message) }
}
</script>
