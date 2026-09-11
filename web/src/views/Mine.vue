<template>
  <div class="page mine-page">
    <!-- ======== 用户信息头卡 ======== -->
    <div class="mine-hero">
      <div class="hero-bg-text">墨</div>
      <div class="avatar" v-if="me">{{ (me.nickname || '墨') [0] }}</div>
      <div class="avatar" v-else>?</div>
      <div class="hero-info">
        <div class="hero-name">
          {{ me?.nickname || '未登录' }}
          <span class="identity-tag" :class="'id-' + (me?.identity || 'guest')">{{ identityText }}</span>
        </div>
        <div class="hero-phone" v-if="me">手机号：{{ me.phone }} ｜ 邀请码 <b>{{ me.id }}</b></div>
        <div class="hero-phone" v-else>登录后体验完整功能</div>
        <div class="hero-note" v-if="me?.identity === 'learner'">🧘 纯学习用户 · 专注学习，无任何推广要求</div>
        <div class="hero-stats" :style="me?.identity === 'learner' ? 'justify-content:flex-start' : ''">
          <template v-if="me?.identity === 'learner'">
            <div class="hs"><b class="coupon"><CountUp :value="me?.couponBalance || 0" :decimals="2" prefix="¥" /></b><span>抵用券</span></div>
            <div class="hs"><b><CountUp :value="me?.totalEarned || 0" :decimals="2" prefix="¥" /></b><span>学习激励</span></div>
          </template>
          <template v-else>
            <div class="hs"><b><CountUp :value="me?.directCount || 0" /></b><span>邀请</span></div>
            <div class="hs"><b><CountUp :value="me?.traineeCount || 0" /></b><span>分享伙伴</span></div>
            <div class="hs"><b class="coupon"><CountUp :value="me?.couponBalance || 0" :decimals="2" prefix="¥" /></b><span>抵用券</span></div>
          </template>
        </div>
      </div>
      <button v-if="!me" class="hero-login" @click="$router.push('/login')">登录 / 注册</button>
    </div>

    <!-- ======== 功能宫格 ======== -->
    <div class="grid-card">
      <div class="grid-item" v-for="g in gridNav" :key="g.name" @click="$router.push(g.to)">
        <div class="grid-icon" :style="{ background: g.bg }">
          <svg viewBox="0 0 24 24"><path :d="g.icon"/></svg>
        </div>
        <span>{{ g.name }}</span>
      </div>
    </div>

    <!-- ======== 我的动态（发表入口，审核制） ======== -->
    <div class="card" v-if="me" style="display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#fffdf8,#fbf3e3);border-color:#e8d9bd;">
      <div>
        <p style="font-weight:700;font-size:15px;margin:0 0 3px;">✍️ 我的动态</p>
        <p class="muted" style="font-size:12px;margin:0;">发表作品、心得、求助，审核通过后在「翰墨互动」展示</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="$router.push('/community/my-posts')">发布 ›</button>
    </div>

    <!-- ======== 付费学员升级入口 ======== -->
    <div class="card" v-if="me && me.identity === 'learner'">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <p style="font-weight:600;">{{ me.is_paid ? '升级为分享伙伴' : '成为付费学员' }}</p>
          <p class="muted" style="font-size:12px;">
            {{ me.is_paid ? '开启分享之旅，邀请好友一起学习' : '购买课程后可参与学习与分享' }}
          </p>
        </div>
        <button v-if="me.is_paid" class="btn btn-primary btn-sm" @click="upgrade">升级 ›</button>
        <button v-else class="btn btn-primary btn-sm" @click="$router.push('/courses')">去购课 ›</button>
      </div>
    </div>

    <!-- ======== 系统提醒 ======== -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;">🔔 系统提醒</h2>
        <router-link to="/notifications" class="mk-link">全部通知 ›</router-link>
      </div>
      <div v-for="n in notices.slice(0, 3)" :key="n.id" class="mt notice-item">
        <p class="notice-content" :class="{ warn: n.type==='fill_remind' || n.type==='frozen_income' }">{{ n.content }}</p>
        <p class="muted">{{ n.created_at }}</p>
      </div>
      <p v-if="!notices.length" class="muted mt">暂无提醒</p>
    </div>

    <!-- ======== 我的砍价 ======== -->
    <div class="card">
      <div class="mk-head">
        <h2 style="margin:0;">🔪 我的砍价</h2>
        <span class="mk-link" @click="$router.push('/courses')">去发起 ›</span>
      </div>
      <div v-for="b in myBargains" :key="b.id" class="mk-item" @click="$router.push('/bargain/' + b.id)">
        <div class="mk-icon">🔪</div>
        <div class="mk-info" style="flex:1;min-width:0;">
          <p><b>{{ b.course_title || '课程' }}</b> <span class="tag" style="background:#f57c00;">¥{{ fmtMoney(b.current_price) }}</span></p>
          <p class="muted">{{ bargainStatusMap[b.status] || b.status }}｜{{ b.helps }}/{{ b.max_helps }}人帮砍</p>
          <div class="progress-track" style="height:8px;margin:6px 0 4px;">
            <div class="progress-fill" :style="{ width: bargainProgress(b) + '%' }"></div>
          </div>
          <p class="muted" style="font-size:12px;">已砍 {{ bargainProgress(b) }}%<span v-if="b.status === 'active' || b.status === 'pending'">｜剩余 {{ bargainRemain(b) }}</span></p>
        </div>
      </div>
      <p v-if="!myBargains.length" class="mk-empty">暂无砍价记录，去课程页发起砍价吧</p>
    </div>

    <!-- ======== 我的拼团 ======== -->
    <div class="card">
      <div class="mk-head">
        <h2 style="margin:0;">👥 我的拼团</h2>
        <span class="mk-link" @click="$router.push('/group')">去开团 ›</span>
      </div>
      <div class="filter-tabs">
        <span v-for="t in groupTabs" :key="t.value" :class="['filter-tab', groupFilter === t.value && 'active']" @click="groupFilter = t.value">{{ t.label }}</span>
      </div>
      <div v-for="g in filteredGroups" :key="g.id" class="mk-item" @click="$router.push('/group/' + g.id)">
        <div class="mk-icon">👥</div>
        <div class="mk-info" style="flex:1;min-width:0;">
          <p><b>{{ g.course_title || '课程' }}</b> <span class="tag" style="background:#1565c0;">{{ g.member_count }}/{{ g.min_count }}人</span></p>
          <p class="muted">{{ groupStatusMap[g.status] || g.status }}｜还差 {{ Math.max(0, (g.min_count || 0) - (g.member_count || 0)) }} 人</p>
          <div class="progress-track" style="height:8px;margin:6px 0 4px;">
            <div class="progress-fill" :style="{ width: groupProgress(g) + '%' }"></div>
          </div>
          <p class="muted" style="font-size:12px;">进度 {{ groupProgress(g) }}%<span v-if="g.status === 'opening' || g.status === 'pending'">｜剩余 {{ groupRemain(g) }}</span></p>
        </div>
        <button v-if="(g.status === 'opening' || g.status === 'pending') && g.leader_user === me?.id" class="btn btn-sm btn-danger" @click.stop="cancelGroup(g)">取消</button>
      </div>
      <p v-if="!filteredGroups.length" class="mk-empty">暂无{{ groupTabs.find(t=>t.value===groupFilter).label }}拼团记录</p>
    </div>

    <!-- ======== 分享与学习圈 ======== -->
    <div class="card" v-if="me && me.identity !== 'learner'">
      <h2>分享与学习圈</h2>
      <div class="share-rows">
        <div class="share-row" @click="$router.push('/invite')">
          <span class="sr-icon" style="background:#fdeed7;">🔗</span>
          <div class="sr-info"><b>邀请好友</b><span>分享邀请码，好友注册得权益</span></div>
          <span class="sr-arrow">›</span>
        </div>
        <div class="share-row" @click="$router.push('/team')">
          <span class="sr-icon" style="background:#e8e3f0;">👥</span>
          <div class="sr-info"><b>我的学习圈</b><span>管理分享伙伴与补位名额</span></div>
          <span class="sr-arrow">›</span>
        </div>
      </div>
    </div>

    <!-- ======== 纯学习安心说明 ======== -->
    <div class="card" v-if="me && me.identity === 'learner'">
      <h2>安心学习</h2>
      <p class="muted" style="line-height:1.9;font-size:13px;">
        您当前为纯学习用户，专注课程学习与打卡任务，无任何推广要求。<br/>
        学习抵用券通过每日打卡与学习任务获取，仅用于课程抵扣，明细随时可查。
      </p>
      <button class="btn btn-outline btn-sm" @click="$router.push('/tasks')">去完成学习任务 ›</button>
    </div>

    <!-- ======== 分享奖励明细 ======== -->
    <div class="card" v-if="me?.identity !== 'learner'">
      <h2>分享奖励明细</h2>
      <table class="table">
        <tr><th>订单</th><th>产品</th><th>金额</th><th>状态</th></tr>
        <tr v-for="c in commissions" :key="c.id">
          <td>#{{ c.id }}</td><td>{{ c.product_type }}</td>
          <td class="price">+¥{{ fmtMoney(c.amount) }}</td><td>{{ c.status === 'paid' ? '已到账' : '待审核' }}</td>
        </tr>
        <tr v-if="!commissions.length"><td colspan="4" class="muted">暂无分享奖励</td></tr>
      </table>
    </div>

    <!-- ======== 培育奖进度 ======== -->
    <div class="card" v-if="me?.identity !== 'learner'">
      <h2>培育奖进度</h2>
      <p class="muted" style="font-size:12px;">帮助前2名直接邀请的学员成长为合格分享伙伴，全额解锁200元帮扶激励</p>
      <div v-for="hr in helpRewards" :key="hr.id" class="help-item">
        <span class="hs-slot">孵化第 {{ hr.slot_no }} 名</span>
        <span class="tag" :class="hrTag(hr.status)">{{ statusMap[hr.status] }}</span>
      </div>
      <p v-if="!helpRewards.length" class="muted">暂无明显帮扶任务</p>
    </div>

    <!-- ======== 主理人待遇（管培生奖励收入的10%，非销售额的10%） ======== -->
    <div class="card" v-if="me?.identity !== 'learner'">
      <h2>主理人待遇（其奖励收入的10%）</h2>
      <p class="muted" style="font-size:12px;">待遇基数 = 该管培生当月实得奖励收入（介绍奖、培育奖等工资性收入），并非其销售额的10%。</p>
      <table class="table">
        <tr><th>月份</th><th>基数(奖励收入)</th><th>待遇</th><th>状态</th></tr>
        <tr v-for="a in allowances" :key="a.id">
          <td>{{ a.month }}</td><td>¥{{ fmtMoney(a.valid_perf) }}</td>
          <td class="price">+¥{{ fmtMoney(a.amount) }}</td><td>{{ a.status }}</td>
        </tr>
        <tr v-if="!allowances.length"><td colspan="4" class="muted">暂无待遇</td></tr>
      </table>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'
import CountUp from '../components/CountUp.vue'

const store = useUserStore()
const router = useRouter()
const me = ref(null)
const commissions = ref([])
const helpRewards = ref([])
const allowances = ref([])
const notices = ref([])
const myBargains = ref([])
const myGroups = ref([])
const groupFilter = ref('active')
const slotProgress = ref(null)
const statusMap = { locked: '未解锁', full: '已解锁待发放', paid: '已发放' }
const bargainStatusMap = { pending: '待付款', active: '砍价中', success: '已砍到可购买', expired: '已过期', cancelled: '已取消' }
const groupStatusMap = { pending: '待付款', opening: '拼团中', success: '已成团', failed: '已失败', cancelled: '已取消' }
const groupTabs = [
  { label: '拼团中', value: 'active' },
  { label: '已成团', value: 'success' },
  { label: '已取消', value: 'cancelled' },
  { label: '全部', value: 'all' }
]
const filteredGroups = computed(() => {
  if (groupFilter.value === 'all') return myGroups.value
  if (groupFilter.value === 'active') return myGroups.value.filter(g => g.status === 'opening' || g.status === 'pending')
  if (groupFilter.value === 'success') return myGroups.value.filter(g => g.status === 'success')
  return myGroups.value.filter(g => g.status === 'cancelled' || g.status === 'failed')
})
const now = ref(Date.now())
let timer = null
const pad = (n) => String(n).padStart(2, '0')
function formatRemain(diff) {
  if (diff <= 0) return '已结束'
  const h = Math.floor(diff / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
function bargainRemain(b) {
  if (!b.expire_at) return ''
  return formatRemain(new Date(b.expire_at).getTime() - now.value)
}
function bargainProgress(b) {
  const total = b.original_price - b.floor_price
  const done = b.original_price - b.current_price
  return total <= 0 ? 100 : Math.min(100, Math.round(done / total * 100))
}
function groupRemain(g) {
  if (!g.expire_at) return ''
  return formatRemain(new Date(g.expire_at).getTime() - now.value)
}
function groupProgress(g) {
  return Math.min(100, Math.round((g.member_count || 0) / (g.min_count || 1) * 100))
}

const identityText = computed(() => {
  const map = { learner: '纯学习', promoter: '分享伙伴' }
  return map[me.value?.identity] || '访客'
})

const gridNav = [
  { name: '我的课程', to: '/my-courses', bg: 'linear-gradient(135deg,#1e88e5,#1565c0)', icon: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm2 3v2h12V7H6zm0 4v2h12v-2H6zm0 4v2h8v-2H6z' },
  { name: '在线练习', to: '/practice', bg: 'linear-gradient(135deg,#43a047,#2e7d32)', icon: 'M12 3l9 5-9 5-9-5 9-5zm0 12l7-4 2 1.1V15l-9 5-9-5v-2.9L5 11l7 4z' },
  { name: '错题本', to: '/practice/wrong', bg: 'linear-gradient(135deg,#f57c00,#e65100)', icon: 'M12 3L1 5v11.5L12 21l11-4.5V5L12 3zm0 3.5a3 3 0 0 1 3 3c0 1.7-2 3.5-3 4.5-1-1-3-2.8-3-4.5a3 3 0 0 1 3-3z' },
  { name: '我的钱包', to: '/wallet', bg: 'linear-gradient(135deg,#d4a017,#b8860b)', icon: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm13 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' },
  { name: '抵用券', to: '/coupon-flows', bg: 'linear-gradient(135deg,#8e24aa,#6a1b9a)', icon: 'M4 4h16v5a2 2 0 0 0 0 6v5H4v-5a2 2 0 0 0 0-6V4zm4 5h8v2H8V9zm0 4h8v2H8v-2z' },
  { name: '邀请好友', to: '/invite', bg: 'linear-gradient(135deg,#b96a33,#8a4a1e)', icon: 'M6 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm12 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 21v-1c0-3 3-5 6-5h6c3 0 6 2 6 5v1z' },
]

onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  me.value = await store.fetchMe()
  if (!store.token) return
  try {
    commissions.value = (await api.get('/user/commissions')).data
    helpRewards.value = (await api.get('/user/help-rewards')).data
    allowances.value = (await api.get('/user/allowances')).data
    notices.value = (await api.get('/user/notices', { params: { read: 1 } })).data
    myBargains.value = (await api.get('/bargain/my')).data
    myGroups.value = (await api.get('/group/my')).data
    const tr = await api.get('/user/trainees')
    slotProgress.value = tr.data.slotProgress
  } catch (e) {}
})
onUnmounted(() => { if (timer) clearInterval(timer) })

const slotPct = computed(() => slotProgress.value && slotProgress.value.slotLimit > 0
  ? Math.min(100, Math.round(slotProgress.value.kept / slotProgress.value.slotLimit * 100))
  : 0)

function hrTag(s) {
  return { locked: 'tag-gray', full: 'tag-gold', paid: 'tag-green' }[s] || ''
}
async function cancelGroup(g) {
  if (!confirm('确定取消该拼团？取消后预付购课款将原路退回。')) return
  try {
    const r = await api.post(`/group/${g.id}/cancel`)
    alert(r.msg)
    myGroups.value = (await api.get('/group/my')).data
  } catch (e) {
    alert(e.message)
  }
}

async function upgrade() {
  try {
    const r = await api.post('/user/upgrade')
    alert(r.msg); me.value = await store.fetchMe()
  } catch (e) {
    if (e.needRebind) {
      // 邀请人是普通消费者：需转绑分享伙伴邀请人
      const newId = await dialog.prompt('您的邀请人是普通消费者，无法参与分享奖励。\n① 请邀请人升级为分享伙伴\n② 填写一位分享伙伴的ID作为新邀请人：')
      if (!newId) return
      try {
        const r2 = await api.post('/user/upgrade', { newReferrerId: Number(newId) })
        alert(r2.msg); me.value = await store.fetchMe()
      } catch (e2) { alert(e2.message) }
    } else if (e.message.includes('先购买')) {
      alert('需先购买课程成为付费学员后，方可升级为分享伙伴'); router.push('/courses')
    } else {
      alert(e.message)
    }
  }
}
</script>

<style scoped>
.mine-page { padding-top: 14px; }

/* ---------- 用户头卡 ---------- */
.mine-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  gap: 14px;
  align-items: center;
  background: var(--grad);
  color: #fff;
  border-radius: 20px;
  padding: 22px 20px;
  margin-bottom: 14px;
  box-shadow: 0 12px 30px rgba(138, 74, 30, .30);
}
.hero-bg-text {
  position: absolute; right: -10px; top: -30px;
  font-size: 150px; font-weight: 900;
  color: rgba(255, 255, 255, .07);
  line-height: 1;
  pointer-events: none; user-select: none;
}
.avatar {
  flex-shrink: 0;
  width: 62px; height: 62px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .9);
  color: var(--brand);
  font-size: 28px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid rgba(255, 255, 255, .5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .2);
}
.hero-info { flex: 1; min-width: 0; }
.hero-name { font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.identity-tag {
  font-size: 11px; font-weight: 600;
  padding: 2px 9px; border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  border: 1px solid rgba(255, 255, 255, .4);
}
.identity-tag.id-learner { background: rgba(46, 125, 50, .55); border-color: transparent; }
.identity-tag.id-promoter { background: rgba(212, 160, 23, .7); border-color: transparent; }
.hero-phone { font-size: 12px; color: rgba(255, 255, 255, .82); margin-top: 5px; }
.hero-phone b { color: #ffd54f; }
.hero-stats { display: flex; gap: 18px; margin-top: 12px; }
.hs { display: flex; flex-direction: column; align-items: center; }
.hs b { font-size: 18px; font-weight: 800; }
.hs b.coupon { color: #ffd54f; }
.hs span { font-size: 11px; color: rgba(255, 255, 255, .75); }
.hero-login {
  flex-shrink: 0;
  border: none; border-radius: 22px;
  padding: 10px 18px;
  background: #fff; color: var(--brand);
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .18);
}

/* ---------- 功能宫格 ---------- */
.grid-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 16px 12px;
  margin-bottom: 14px;
  box-shadow: var(--shadow-sm);
}
.grid-item { display: flex; flex-direction: column; align-items: center; gap: 7px; cursor: pointer; padding: 6px 2px; border-radius: 12px; transition: background .2s, transform .15s; }
.grid-item:active { transform: scale(.95); background: #faf5ec; }
.grid-item span { font-size: 12.5px; color: #6b5d4e; }
.grid-icon {
  width: 46px; height: 46px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(74, 51, 28, .18);
}
.grid-icon svg { width: 24px; height: 24px; fill: #fff; }

.mk-link { font-size: 13px; color: var(--brand); cursor: pointer; }
.filter-tabs { display: flex; gap: 8px; margin: 10px 0 6px; flex-wrap: wrap; }
.filter-tab { font-size: 12px; padding: 5px 12px; border-radius: 14px; background: #f3e9db; color: #6b5d4e; cursor: pointer; transition: all .2s; }
.filter-tab.active { background: var(--brand); color: #fff; }
.notice-item { border-bottom: 1px solid var(--line); padding-bottom: 8px; }
.notice-item:last-of-type { border-bottom: none; }
.notice-content { color: #f57c00; font-size: 13.5px; }
.notice-content.warn { color: #d32f2f; font-weight: 600; }

.help-item { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
.hs-slot { font-size: 14px; }

/* ---------- 学习圈解锁进度 ---------- */
.accent { color: var(--brand, #b96a33); font-weight: 700; }
.progress-track {
  position: relative;
  height: 22px;
  background: #f3e9db;
  border-radius: 12px;
  overflow: hidden;
  margin: 10px 0 4px;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #b96a33, #e0a14f);
  border-radius: 12px;
  transition: width .4s ease;
}
.progress-text {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #4a331c;
}

.share-rows { display: flex; flex-direction: column; gap: 2px; }
.share-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 4px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.share-row:last-child { border-bottom: none; }
.sr-icon {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.sr-info { flex: 1; }
.sr-info b { font-size: 14.5px; display: block; }
.sr-info span { font-size: 12px; color: var(--muted); }
.sr-arrow { font-size: 20px; color: #c9bdaa; }
</style>
