<template>
  <div class="page admin-page">
    <h1>奖励流水管理</h1>
    <AdminNav />

    <div class="card">
      <div style="display:flex;gap:8px;">
        <button class="btn" :class="{ on: tab === 'comm' }" style="flex:1;" @click="switchTab('comm')">💸 介绍奖励</button>
        <button class="btn" :class="{ on: tab === 'allow' }" style="flex:1;" @click="switchTab('allow')">🧧 主理人待遇</button>
        <button class="btn" :class="{ on: tab === 'help' }" style="flex:1;" @click="switchTab('help')">🎓 培育奖</button>
        <button class="btn" :class="{ on: tab === 'hbonus' }" style="flex:1;" @click="switchTab('hbonus')">🏆 培育奖</button>
      </div>
      <template v-if="tab === 'comm'">
        <div style="display:flex;gap:8px;margin-top:10px;">
          <select class="input" v-model="status" @change="load">
            <option value="all">全部状态</option>
            <option value="paid">已发放</option>
            <option value="refunded">已回滚（退款）</option>
          </select>
          <input class="input" v-model="kw" placeholder="搜索昵称/手机号/档位" @keyup.enter="load" />
          <button class="btn btn-outline" @click="load">搜索</button>
        </div>
        <p v-if="stats" style="margin-top:10px;">
          已发放：<b class="price">¥{{ stats.paid.s }}</b>（{{ stats.paid.c }} 笔）
          ｜已回滚：<span class="muted">¥{{ stats.refunded.s }}</span>（{{ stats.refunded.c }} 笔）
          <button class="btn btn-outline" style="margin-left:10px;padding:4px 10px;" @click="exportCsv('commissions')">⬇️ 导出</button>
        </p>
      </template>
      <template v-else-if="tab === 'allow'">
        <p v-if="stats" style="margin-top:10px;">累计已发放待遇：<b class="price">¥{{ stats.s }}</b>（{{ stats.c }} 笔）
          <button class="btn btn-outline" style="margin-left:10px;padding:4px 10px;" @click="exportCsv('allowances')">⬇️ 导出</button>
        </p>
      </template>
      <template v-else-if="tab === 'help'">
        <p v-if="stats" style="margin-top:10px;">已发放培育奖：<b class="price">{{ stats.c }}</b> 组
          <button class="btn btn-outline" style="margin-left:10px;padding:4px 10px;" @click="exportCsv('help-rewards')">⬇️ 导出</button>
        </p>
      </template>
      <template v-else>
        <p v-if="stats" style="margin-top:10px;">已发放培育奖：<b class="price">¥{{ stats.s }}</b>（{{ stats.c }} 笔）
          <span class="muted" style="font-size:12px;">主理人名下管培生每介绍1名付费分享学员得200</span>
        </p>
      </template>
    </div>

    <!-- 介绍奖励 -->
    <div class="card" v-if="tab === 'comm'">
      <table class="table">
        <tr><th>ID</th><th>推荐人</th><th>学员</th><th>档位</th><th>金额</th><th>状态</th><th>时间</th></tr>
        <tr v-for="c in list" :key="c.id">
          <td>#{{ c.id }}</td>
          <td>{{ c.referrer_name || '#'+c.referrer_id }}</td>
          <td>{{ c.user_name || '#'+c.user_id }}</td>
          <td>{{ c.product_type }}元</td>
          <td class="price">+¥{{ c.amount }}</td>
          <td><span class="tag" :style="c.status === 'paid' ? '' : 'background:#999;'">{{ c.status === 'paid' ? '已发放' : '已回滚' }}</span></td>
          <td class="muted">{{ c.created_at }}</td>
        </tr>
        <tr v-if="!list.length"><td colspan="7" class="muted">暂无奖励流水</td></tr>
      </table>
    </div>

    <!-- 主理人待遇 -->
    <div class="card" v-if="tab === 'allow'">
      <table class="table">
        <tr><th>ID</th><th>主理人</th><th>管培生</th><th>月份</th><th>业绩</th><th>待遇</th><th>状态</th></tr>
        <tr v-for="a in list" :key="a.id">
          <td>#{{ a.id }}</td>
          <td>{{ a.leader_name || '#'+a.leader_id }}</td>
          <td>{{ a.trainee_name || '#'+a.trainee_id }}</td>
          <td>{{ a.month }}</td>
          <td>¥{{ a.valid_perf }}</td>
          <td class="price">+¥{{ a.amount }}</td>
          <td><span class="tag" style="background:#2e7d32;">已发放</span></td>
        </tr>
        <tr v-if="!list.length"><td colspan="7" class="muted">暂无待遇流水</td></tr>
      </table>
    </div>

    <!-- 培育奖 -->
    <div class="card" v-if="tab === 'help'">
      <div class="card-inner" v-for="h in list" :key="h.id" style="border-bottom:1px solid #eee;padding:8px 0;">
        <p>
          <b>{{ h.mentor_name || '#'+h.mentor_id }}</b> 帮扶 第{{ h.slot_no }}名
          <span class="tag" :style="helpTagStyle(h.status)">{{ helpStatusText(h.status) }}</span>
        </p>
        <p class="muted">
          新学员：{{ h.newbie_name || '#'+h.newbie_id }}（{{ h.newbie_phone || '无手机号' }}）
          ｜孵化数：{{ h.hatched_count }}/1
          <span v-if="h.unlocked_at">｜解锁：{{ h.unlocked_at }}</span>
          <span v-if="h.paid_at">｜发放：{{ h.paid_at }}</span>
        </p>
        <button v-if="h.status === 'full'" class="btn" @click="pay(h)">发放 ¥200 培育奖</button>
      </div>
      <p v-if="!list.length" class="muted">暂无培育奖记录</p>
    </div>

    <!-- 主理人培育奖 -->
    <div class="card" v-if="tab === 'hbonus'">
      <table class="table">
        <tr><th>ID</th><th>主理人</th><th>成员(管培生)</th><th>订单</th><th>金额</th><th>状态</th><th>时间</th></tr>
        <tr v-for="h in list" :key="h.id">
          <td>#{{ h.id }}</td>
          <td>{{ h.mentor_name || '#'+h.mentor_id }}</td>
          <td>{{ h.referrer_name || '#'+h.referrer_id }}</td>
          <td>#{{ h.order_id }}</td>
          <td class="price">+¥{{ h.amount }}</td>
          <td><span class="tag" :style="h.status === 'paid' ? '' : 'background:#999;'">{{ h.status === 'paid' ? '已发放' : '已回滚' }}</span></td>
          <td class="muted">{{ h.created_at }}</td>
        </tr>
        <tr v-if="!list.length"><td colspan="7" class="muted">暂无培育奖记录</td></tr>
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
const tab = ref(['comm', 'allow', 'help', 'hbonus'].includes(route.query.tab) ? route.query.tab : 'comm')
const status = ref('all')
const kw = ref('')
const list = ref([])
const stats = ref(null)

onMounted(load)

function switchTab(t) { tab.value = t; load() }

const helpStatusText = (s) => ({ locked: '未解锁', full: '可发放', paid: '已发放' }[s] || s)
const helpTagStyle = (s) => s === 'paid' ? 'background:#2e7d32;' : (s === 'full' ? 'background:#f57c00;' : 'background:#999;')

async function load() {
  try {
    const url = tab.value === 'comm' ? '/admin/commissions' : tab.value === 'allow' ? '/admin/allowances' : tab.value === 'help' ? '/admin/help-rewards' : '/admin/help-bonuses'
    const params = new URLSearchParams()
    if (status.value && status.value !== 'all') params.set('status', status.value)
    if (kw.value) params.set('kw', kw.value)
    const d = (await api.get(url + '?' + params.toString())).data
    list.value = d.list
    stats.value = d.stats
  } catch (e) { alert(e.message) }
}

async function pay(h) {
  if (!(await dialog.confirm(`确认向 ${h.mentor_name || '#'+h.mentor_id}（帮扶主理人）发放全部可发培育奖？`))) return
  try {
    const r = await api.post('/admin/pay-help-reward', { mentorId: h.mentor_id })
    alert(r.ok ? r.msg + '（¥' + r.total + '）' : (r.msg || '操作失败'))
    load()
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
</script>
