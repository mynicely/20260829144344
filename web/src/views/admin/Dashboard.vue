<template>
  <div class="page admin-page">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>数据看板</h1>
      <div>
        <button class="btn btn-outline" style="margin-right:8px;" @click="changePassword">修改密码</button>
        <button class="btn btn-outline" @click="logout">退出后台</button>
      </div>
    </div>
    <AdminNav />

    <!-- 待办提醒条 -->
    <router-link v-if="todoTotal > 0" to="/admin/todo" class="todo-banner">
      🔔 您有 {{ todoTotal }} 项待处理事项（文章审核、订单、提现、作业等），点击前往待办中心处理 →
    </router-link>

    <!-- 时间范围切换 -->
    <div class="range-bar" v-if="d">
      <button v-for="n in [7,14,30,90]" :key="n" class="btn" :class="days === n ? 'btn-primary' : 'btn-outline'" @click="setDays(n)">近{{ n }}天</button>
      <span class="muted range-compare">本期营收 <b class="price">¥{{ d.compare.cur.revenue }}</b>
        <span :class="diffCls(d.compare.diff.revenue)">（{{ fmtDiff(d.compare.diff.revenue) }} vs 上一周期）</span>
      </span>
    </div>

    <!-- KPI 卡片 -->
    <div class="kpi-grid" v-if="d">
      <div class="kpi-card">
        <div class="kpi-label">累计营收</div>
        <div class="kpi-val price">¥{{ d.kpi.totalRevenue }}</div>
        <div class="kpi-sub">{{ d.kpi.orders }} 单</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">本月营收</div>
        <div class="kpi-val price">¥{{ d.kpi.monthRevenue }}</div>
        <div class="kpi-sub">今日 ¥{{ d.kpi.todayRevenue }} / {{ d.kpi.todayOrders }}单</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">付费学员</div>
        <div class="kpi-val">{{ d.kpi.paidUsers }}</div>
        <div class="kpi-sub">总用户 {{ d.kpi.totalUsers }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">累计奖励支出</div>
        <div class="kpi-val price">¥{{ d.comm.total }}</div>
        <div class="kpi-sub">介绍 ¥{{ d.comm.direct }}｜待遇 ¥{{ d.comm.allowance }}｜帮扶 ¥{{ d.comm.help }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">抵用券已抵扣</div>
        <div class="kpi-val price">¥{{ d.kpi.couponUsed }}</div>
        <div class="kpi-sub">学习抵现闭环</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">在库管培生</div>
        <div class="kpi-val">{{ totalTrainees }}</div>
        <div class="kpi-sub">合格 {{ traineeCount('qualified') }} 名</div>
      </div>
    </div>

    <!-- 趋势图 -->
    <div class="chart-row" v-if="d">
      <div class="card chart-card">
        <h2>近{{ days }}天营收趋势（¥）</h2>
        <svg :viewBox="`0 0 ${W} ${H}`" class="chart-svg">
          <line v-for="g in grid" :key="g.y" :x1="padL" :x2="W - padR" :y1="g.y" :y2="g.y" class="grid-line" />
          <text v-for="g in grid" :key="'t'+g.y" :x="padL - 6" :y="g.y + 4" class="axis-text" text-anchor="end">{{ g.label }}</text>
          <polygon :points="areaPoints" fill="rgba(46,125,50,.12)" />
          <polyline :points="linePoints" fill="none" stroke="#2e7d32" stroke-width="2.5" />
          <circle v-for="p in pts" :key="p.x" :cx="p.x" :cy="p.y" r="3" fill="#2e7d32" />
          <text v-for="(lb,i) in labels" :key="'x'+i" :x="pts[i]?.x" :y="H - 10" class="axis-text" text-anchor="middle">{{ lb }}</text>
        </svg>
      </div>
      <div class="card chart-card">
        <h2>近{{ days }}天订单 / 新增用户</h2>
        <svg :viewBox="`0 0 ${W} ${H}`" class="chart-svg">
          <line v-for="g in gridBar" :key="'g'+g.y" :x1="padL" :x2="W - padR" :y1="g.y" :y2="g.y" class="grid-line" />
          <text v-for="g in gridBar" :key="'t'+g.y" :x="padL - 6" :y="g.y + 4" class="axis-text" text-anchor="end">{{ g.label }}</text>
          <g v-for="(b,i) in barData" :key="i">
            <rect :x="b.x1" :y="b.y1" :width="b.w" :height="b.h1" fill="#2e7d32" rx="2" />
            <rect :x="b.x2" :y="b.y2" :width="b.w" :height="b.h2" fill="#1976d2" rx="2" />
            <text v-if="b.h1 > 6" :x="b.x1 + b.w/2" :y="b.y1 - 3" class="axis-text" text-anchor="middle" font-size="9">{{ b.o }}</text>
            <text v-if="b.h2 > 6" :x="b.x2 + b.w/2" :y="b.y2 - 3" class="axis-text" text-anchor="middle" font-size="9">{{ b.u }}</text>
            <text v-if="i % 2 === 0" :x="b.cx" :y="H - 10" class="axis-text" text-anchor="middle">{{ b.lb }}</text>
          </g>
        </svg>
        <p class="muted" style="margin-top:6px;"><span style="color:#2e7d32;">■</span> 订单数 <span style="color:#1976d2;margin-left:10px;">■</span> 新增用户</p>
      </div>
    </div>

    <!-- 分布统计 -->
    <div class="chart-row" v-if="d">
      <div class="card">
        <h2>产品档位营收分布</h2>
        <div v-for="p in d.productSplit" :key="p.product_type" class="bar-row">
          <span class="bar-label">{{ p.product_type }}档</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pct(p.revenue) + '%', background: barColor(p.product_type) }"></div></div>
          <span class="bar-val">¥{{ p.revenue }}（{{ p.orders }}单）</span>
        </div>
        <p v-if="!d.productSplit.length" class="muted">暂无订单</p>
      </div>
      <div class="card">
        <h2>管培生状态分布</h2>
        <div v-for="s in d.traineeStatus" :key="s.status" class="bar-row">
          <span class="bar-label">{{ statusText(s.status) }}</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pct2(s.c) + '%', background: statusColor(s.status) }"></div></div>
          <span class="bar-val">{{ s.c }} 人</span>
        </div>
        <p v-if="!d.traineeStatus.length" class="muted">暂无管培生</p>
      </div>
      <div class="card">
        <h2>奖励支出结构</h2>
        <div class="bar-row">
          <span class="bar-label">介绍奖励</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pct(d.comm.direct) + '%', background: '#2e7d32' }"></div></div>
          <span class="bar-val">¥{{ d.comm.direct }}</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">主理人待遇</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pct(d.comm.allowance) + '%', background: '#f57c00' }"></div></div>
          <span class="bar-val">¥{{ d.comm.allowance }}</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">培育奖</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pct(d.comm.help) + '%', background: '#1976d2' }"></div></div>
          <span class="bar-val">¥{{ d.comm.help }}</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">主理人培育奖</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pct(d.comm.helpBonus) + '%', background: '#00897b' }"></div></div>
          <span class="bar-val">¥{{ d.comm.helpBonus }}</span>
        </div>
        <p style="margin-top:8px;">总支出：<b class="price">¥{{ d.comm.total }}</b></p>
        <p class="muted">费率：{{ (d.comm.total / (d.kpi.totalRevenue || 1) * 100).toFixed(1) }}%（占营收）</p>
      </div>
    </div>

    <!-- 裂变漏斗 + 学习圈规模分布 -->
    <div class="chart-row" v-if="ins">
      <div class="card">
        <h2>裂变漏斗 <span class="muted" style="font-size:11px;font-weight:400;">注册 → 分享 → 付费 → 管培 → 合格 → 主理人</span></h2>
        <div v-for="(s,i) in ins.funnel" :key="s.key" class="funnel-row">
          <span class="funnel-label">{{ s.label }}</span>
          <div class="funnel-track"><div class="funnel-bar" :style="{ width: funnelPct(s.count) + '%', background: funnelColor(i) }"></div></div>
          <span class="funnel-val">{{ s.count }}<em v-if="s.pct !== null"> 转化 {{ s.pct }}%</em></span>
        </div>
      </div>
      <div class="card">
        <h2>学习圈规模分布 <span class="muted" style="font-size:11px;font-weight:400;">每人介绍人数</span></h2>
        <div v-for="b in ins.directDist" :key="b.key" class="bar-row">
          <span class="bar-label">{{ b.label }}</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: pctN(b.count) + '%', background: '#6a1b9a' }"></div></div>
          <span class="bar-val">{{ b.count }} 人</span>
        </div>
        <p class="muted" style="font-size:11px;">未介绍用户占比可反映裂变启动率</p>
      </div>
    </div>

    <!-- 管培生考核进度 -->
    <div class="card" v-if="ins">
      <h2>管培生考核进度
        <span class="muted" style="font-size:11px;font-weight:400;">
          滚动周期 {{ p.config.cycleDays }} 天 / 达标 ¥{{ p.config.qualifyPerf }} 或 {{ p.config.qualifyOrders }} 单 / 连续 {{ p.config.clearMonths }} 周期零业绩清退
        </span>
      </h2>
      <div class="mini-badges">
        <span v-for="(v,k) in p.summary" :key="k" class="badge" :style="{ background: statusColor(k), color:'#fff' }">{{ statusText(k) }} {{ v }}</span>
      </div>
      <div class="scroll-box">
        <table class="table">
          <tr><th>管培生</th><th>主理人</th><th>状态</th><th>本周期业绩</th><th>达标进度</th><th>周期</th><th>零业绩周期</th></tr>
          <tr v-for="it in p.items" :key="it.id">
            <td>{{ it.nickname }}<span class="muted"> #{{ it.slotNo }}</span></td>
            <td>{{ it.leaderNickname || '—' }}</td>
            <td><span class="t-badge" :style="{ background: statusColor(it.status) }">{{ statusText(it.status) }}</span></td>
            <td>¥{{ it.monthPerf }} / {{ it.monthOrders }}单</td>
            <td style="min-width:130px;">
              <div class="mini-bar"><div class="mini-fill" :style="{ width: it.progressPct + '%', background: statusColor(it.status) }"></div></div>
              <span class="muted" style="font-size:11px;">{{ it.progressPct }}%</span>
            </td>
            <td>{{ it.started ? (it.cycleStart + '~' + it.cycleEnd + ' 剩' + it.remainDays + '天') : '待首轮考核' }}</td>
            <td>{{ it.zeroPerfMonths }}<span v-if="it.slotStatus === 'frozen'" class="warn"> 冻结</span></td>
          </tr>
          <tr v-if="!p.items.length"><td colspan="7" style="text-align:center;color:#999;">暂无在库管培生</td></tr>
        </table>
      </div>
    </div>

    <!-- 主理人学习圈排行 -->
    <div class="card" v-if="ins">
      <h2>主理人学习圈排行 Top 10 <span class="muted" style="font-size:11px;font-weight:400;">按合格学习圈业绩排序</span></h2>
      <table class="table">
        <tr><th>#</th><th>主理人</th><th>学习圈人数</th><th>合格</th><th>学习圈周期业绩</th><th>合格业绩</th><th>累计待遇</th><th>冻结名额</th></tr>
        <tr v-for="(r,i) in ins.leaderRank" :key="r.leaderId">
          <td>{{ i + 1 }}</td>
          <td>{{ r.nickname }}<span class="muted">{{ r.phone }}</span></td>
          <td>{{ r.traineeCount }}</td>
          <td>{{ r.qualifiedCount }}</td>
          <td>¥{{ r.teamPerf }}</td>
          <td class="price">¥{{ r.qualifiedPerf }}</td>
          <td class="price">¥{{ r.allowanceTotal }}</td>
          <td>{{ r.frozenSlots }}<span v-if="r.frozenSlots" class="warn"> 待补位</span></td>
        </tr>
        <tr v-if="!ins.leaderRank.length"><td colspan="8" style="text-align:center;color:#999;">暂无主理人</td></tr>
      </table>
    </div>

    <div class="card">
      <button class="btn btn-block" @click="runCheck">手动执行每日考核 + 待遇结算</button>
    </div>

    <div class="card">
      <h2>用户 / 密码管理</h2>
      <p class="muted" style="font-size:12px;margin-bottom:8px;">按手机号或昵称搜索学员，可为忘记密码 / 未设置密码的用户（如老年人）设置登录密码。</p>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input class="input" v-model="userKeyword" placeholder="输入手机号或昵称搜索" style="flex:1;" />
        <button class="btn btn-outline" @click="userKeyword = ''">清空</button>
      </div>
      <table class="table">
        <tr><th>ID</th><th>昵称</th><th>身份</th><th>付费</th><th>月业绩</th><th>密码</th><th>操作</th></tr>
        <tr v-for="u in filteredUsers" :key="u.id">
          <td>{{ u.id }}</td><td>{{ u.nickname }}</td><td>{{ u.identity }}</td>
          <td>{{ u.is_paid ? '¥'+u.product_type : '否' }}</td><td>¥{{ u.month_perf }}</td>
          <td>{{ u.has_password ? '已设置' : '未设置' }}</td>
          <td><a @click="resetPassword(u)">{{ u.has_password ? '重置密码' : '设置密码' }}</a></td>
        </tr>
        <tr v-if="!filteredUsers.length"><td colspan="7" style="text-align:center;color:#999;">未找到匹配的学员</td></tr>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../api'
import AdminNav from './AdminNav.vue'
import { useAdminStore } from '../../store'
import { dialog } from '../../utils/dialog'
const router = useRouter()
const adminStore = useAdminStore()
const d = ref(null)
const ins = ref(null)
const days = ref(14)
const users = ref([])
const todoTotal = ref(0)
const userKeyword = ref('')
const filteredUsers = computed(() => {
  const kw = userKeyword.value.trim().toLowerCase()
  if (!kw) return users.value
  return users.value.filter(u => String(u.nickname || '').toLowerCase().includes(kw) || String(u.phone || '').includes(kw))
})

// 折线图参数
const W = 720, H = 250, padL = 46, padR = 16, padT = 16, padB = 30
const pts = ref([])
const labels = ref([])
const grid = ref([])
const barData = ref([])
const totalTrainees = computed(() => (d.value?.traineeStatus || []).reduce((s, x) => s + x.c, 0))

const p = computed(() => ins.value?.traineeProgress || { config: {}, summary: {}, items: [] })

onMounted(load)
async function load() {
  try { d.value = (await api.get('/admin/trends', { params: { days: days.value } })).data } catch (e) {}
  try { ins.value = (await api.get('/admin/insights')).data } catch (e) {}
  try { users.value = (await api.get('/admin/users')).data } catch (e) {}
  try { const r = await api.get('/admin/todo-stats'); todoTotal.value = (r.data && r.data.total) || 0 } catch (e) {}
  buildCharts()
}
function setDays(n) { days.value = n; load() }
// 搜索：防抖调用后端接口（支持全量用户，不限于最近200条）
let searchTimer = null
watch(userKeyword, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    try {
      users.value = (await api.get('/admin/users', { params: { kw: userKeyword.value.trim() } })).data
    } catch (e) { /* 忽略搜索失败 */ }
  }, 300)
})
function buildCharts() {
  if (!d.value) return
  const arr = d.value.byDay || []
  const maxRev = Math.max(...arr.map(v => v.revenue), 1)
  const pw = W - padL - padR, ph = H - padT - padB
  const n = arr.length
  const yOf = v => padT + ph - (v / maxRev) * ph
  pts.value = arr.map((v, i) => ({
    x: Math.round(padL + (n === 1 ? pw / 2 : i * (pw / (n - 1)))),
    y: Math.round(yOf(v.revenue)),
  }))
  labels.value = arr.map((v, i) => (i % 2 === 0 ? v.d.slice(5) : ''))
  grid.value = [0, 1, 2, 3].map(i => {
    const val = Math.round(maxRev * i / 3)
    return { y: Math.round(yOf(val)), label: val }
  })
  const areaPts = [{ x: pts.value[0]?.x ?? padL, y: padT + ph }, ...pts.value, { x: pts.value[n - 1]?.x ?? (padL + pw), y: padT + ph }]
  areaPoints.value = areaPts.map(p => p.x + ',' + p.y).join(' ')
  linePoints.value = pts.value.map(p => p.x + ',' + p.y).join(' ')

  // 双柱状图
  const maxC = Math.max(...arr.map(v => Math.max(v.orders, v.users)), 1)
  const yOfC = v => padT + ph - (v / maxC) * ph
  gridBar.value = [0, 1, 2, 3].map(i => {
    const val = Math.round(maxC * i / 3)
    return { y: Math.round(yOfC(val)), label: val }
  })
  const slotW = pw / n
  barData.value = arr.map((v, i) => {
    const cw = slotW * 0.34, gap = slotW * 0.08
    const cx = padL + i * slotW + slotW / 2
    const x1 = cx - cw - gap / 2, x2 = cx + gap / 2
    const h1 = ph * v.orders / maxC, h2 = ph * v.users / maxC
    return {
      x1: Math.round(x1), y1: Math.round(padT + ph - h1), h1: Math.round(h1),
      x2: Math.round(x2), y2: Math.round(padT + ph - h2), h2: Math.round(h2),
      w: Math.round(cw), cx: Math.round(cx), o: v.orders, u: v.users, lb: v.d.slice(5),
    }
  })
}
const areaPoints = ref('')
const linePoints = ref('')
const gridBar = ref([])

function pct(v) { const m = Math.max(...(d.value?.productSplit || []).map(p => p.revenue), ...(d.value?.comm ? [d.value.comm.direct, d.value.comm.allowance, d.value.comm.help, d.value.comm.helpBonus] : [0]), 1); return Math.max(2, Math.round(v / m * 100)) }
function pct2(c) { const total = totalTrainees.value || 1; return Math.max(2, Math.round(c / total * 100)) }
function barColor(t) { return { '499': '#2e7d32', '1299': '#f57c00', '2999': '#1976d2' }[t] || '#7b1fa2' }
function statusText(s) { return { qualified: '合格', probation: '见习', invalid: '失效', cleared: '已清退', pending: '待考核' }[s] || s }
function statusColor(s) { return { qualified: '#2e7d32', probation: '#f57c00', invalid: '#d32f2f', cleared: '#9e9e9e', pending: '#1976d2' }[s] || '#9e9e9e' }
function traineeCount(s) { return (d.value?.traineeStatus || []).find(x => x.status === s)?.c || 0 }

// 漏斗 / 介绍分布
function funnelPct(c) { const m = Math.max(...(ins.value?.funnel || []).map(f => f.count), 1); return Math.max(2, Math.round(c / m * 100)) }
function funnelColor(i) { return ['#1565c0', '#1976d2', '#388e3c', '#f57c00', '#d32f2f', '#6a1b9a'][i] || '#9e9e9e' }
function pctN(c) { const m = Math.max(...(ins.value?.directDist || []).map(b => b.count), 1); return Math.max(2, Math.round(c / m * 100)) }
function fmtDiff(v) { return (v >= 0 ? '+' : '') + v + '%' }
function diffCls(v) { return v > 0 ? 'up' : (v < 0 ? 'down' : 'muted') }

async function runCheck() {
  try { const r = await api.post('/admin/run-daily-check'); alert(r.msg || '完成'); load() }
  catch (e) { alert(e.message) }
}
async function resetPassword(u) {
  const def = 'wm' + Math.random().toString(36).slice(2, 8) // 随机密码兜底
  const pwd = await dialog.prompt(`为「${u.nickname}（${u.phone}）」${u.has_password ? '重置' : '设置'}新密码（至少6位）：\n\n留空将自动生成随机密码，生成后请复制并告知用户。`, '')
  const final = (pwd || '').trim() || def
  if (final.length < 6) return alert('密码至少6位')
  if (!(await dialog.confirm(`确认将新密码设为 ${final} ？\n\n请记住此密码并告知用户。`))) return
  try {
    const r = await api.post(`/admin/users/${u.id}/reset-password`, { password: final })
    alert((r.msg || '完成') + `\n\n新密码：${final}`)
    try { await navigator.clipboard.writeText(final) } catch (e) { /* 复制失败不影响 */ }
  } catch (e) { alert(e.message) }
}
function logout() {
  adminStore.logout()
  router.push('/')
}
async function changePassword() {
  const oldPwd = await dialog.prompt('请输入原密码：')
  if (!oldPwd) return
  const newPwd = await dialog.prompt('请输入新密码（至少6位）：')
  if (!newPwd || newPwd.length < 6) return alert('新密码至少6位')
  try {
    const r = await api.post('/admin/change-password', { oldPassword: oldPwd, newPassword: newPwd })
    alert(r.msg || '密码已修改')
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
.kpi-card { background: #fff; border-radius: 10px; padding: 14px; border: 1px solid #eee; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
.kpi-label { font-size: 12px; color: #888; }
.kpi-val { font-size: 22px; font-weight: 700; margin: 4px 0; }
.kpi-sub { font-size: 11px; color: #aaa; }
.chart-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px; margin-bottom: 14px; }
.chart-card { min-width: 0; }
.chart-svg { width: 100%; height: auto; }
.grid-line { stroke: #eee; stroke-dasharray: 3 3; }
.axis-text { font-size: 10px; fill: #999; }
.bar-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.bar-label { flex: 0 0 74px; font-size: 12px; color: #555; }
.bar-track { flex: 1; background: #f2f2f2; border-radius: 6px; height: 14px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 6px; transition: width .4s; }
.bar-val { flex: 0 0 96px; text-align: right; font-size: 12px; color: #333; }

/* 时间范围切换 */
.range-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; }
.range-compare { margin-left: auto; font-size: 12px; }
.up { color: #d32f2f; }
.down { color: #2e7d32; }
.todo-banner {
  display: block;
  background: #c62828;
  color: #fff;
  border-radius: 10px;
  padding: 11px 16px;
  margin-bottom: 14px;
  font-size: 13px;
  text-decoration: none;
}
.todo-banner:hover { background: #b71c1c; }

/* 裂变漏斗 */
.funnel-row { display: flex; align-items: center; gap: 8px; margin: 9px 0; }
.funnel-label { flex: 0 0 74px; font-size: 12px; color: #555; }
.funnel-track { flex: 1; background: #f2f2f2; border-radius: 6px; height: 20px; overflow: hidden; }
.funnel-bar { height: 100%; border-radius: 6px; transition: width .5s; opacity: .85; }
.funnel-val { flex: 0 0 110px; text-align: right; font-size: 13px; font-weight: 600; color: #333; }
.funnel-val em { font-style: normal; font-size: 11px; color: #999; font-weight: 400; }

/* 考核进度 */
.mini-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.badge { font-size: 12px; padding: 2px 10px; border-radius: 12px; }
.scroll-box { max-height: 380px; overflow-y: auto; }
.mini-bar { display: inline-block; width: 90px; height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; vertical-align: middle; margin-right: 6px; }
.mini-fill { height: 100%; border-radius: 4px; transition: width .4s; }
.t-badge { color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 10px; }
.warn { color: #d32f2f; font-size: 11px; margin-left: 4px; }
</style>
