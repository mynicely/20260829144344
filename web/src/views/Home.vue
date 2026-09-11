<template>
  <div class="page home-page">
    <!-- ======== 顶部横幅 ======== -->
    <div class="home-hero">
      <div class="hero-bg-text">翰</div>
      <div class="hero-top">
        <div>
          <div class="hero-brand">翰墨书院</div>
          <div class="hero-slogan">在线学书法 · 平价好课 · 天天练字</div>
        </div>
        <div class="hero-seal" v-if="store.user">✍️</div>
      </div>
      <div class="hero-feats">
        <span>专业名师</span><span class="dot">·</span>
        <span>系统课程</span><span class="dot">·</span>
        <span>一对一点评</span>
      </div>
      <button class="hero-btn" @click="openTrial">
        <svg viewBox="0 0 24 24"><path d="M3 4h18v13H3zM7 21h10"/><path d="M12 8v5m-2.5-2.5h5"/></svg>
        免费体验课 · 立即预约
      </button>
    </div>

    <!-- ======== 功能宫格 ======== -->
    <div class="grid-card">
      <div class="grid-item" v-for="g in gridNav" :key="g.to" @click="$router.push(g.to)">
        <div class="grid-icon" :style="{ background: g.bg }">
          <svg viewBox="0 0 24 24"><path :d="g.icon"/></svg>
        </div>
        <span>{{ g.name }}</span>
      </div>
    </div>

    <!-- ======== 体验课预约弹层 ======== -->
    <transition name="page-fade">
      <div class="mask" v-if="showTrial" @click.self="showTrial = false">
        <div class="modal">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <h2 style="margin:0;">免费体验课预约</h2>
            <button class="modal-x" @click="showTrial = false">✕</button>
          </div>
          <label class="label">姓名</label>
          <input class="input" v-model="trial.name" placeholder="学员姓名" />
          <label class="label">邀请码 <b style="color:#d32f2f;">*</b></label>
          <input class="input" v-model="trial.inviteCode" placeholder="填写邀请你的朋友的邀请码" />
          <label class="label">联系电话</label>
          <input class="input" v-model="trial.phone" placeholder="用于客服联系" />
          <label class="label">年龄段</label>
          <select class="input" v-model="trial.ageGroup">
            <option value="child">少儿</option>
            <option value="adult">成人</option>
          </select>
          <label class="label">体验科目</label>
          <div class="opt-grid">
            <button v-for="s in options.subjects" :key="s" class="opt-chip"
              :class="{ active: trial.subject === s }" @click="trial.subject = s">{{ s }}</button>
          </div>
          <label class="label">上课方式</label>
          <div class="opt-grid">
            <button class="opt-chip" :class="{ active: trial.mode === 'online' }" @click="trial.mode = 'online'">📱 线上直播</button>
            <button class="opt-chip" :class="{ active: trial.mode === 'offline' }" @click="trial.mode = 'offline'">🏫 线下到店</button>
          </div>
          <label class="label">期望上课时间</label>
          <select class="input" v-model="trial.preferTime">
            <option value="">请选择时段</option>
            <option v-for="s in options.slots" :key="s" :value="s">{{ s }}</option>
          </select>
          <button class="btn btn-block mt" @click="bookTrial">确认预约</button>
        </div>
      </div>
    </transition>

    <!-- ======== 我的体验课预约 ======== -->
    <div class="card" v-if="myTrials.length">
      <h2>我的体验课预约</h2>
      <div v-for="t in myTrials" :key="t.id" class="trial-item">
        <p><b>{{ t.subject }}</b>（{{ t.mode === 'online' ? '线上' : '线下' }}）<span class="tag">{{ statusText(t.status) }}</span></p>
        <p class="muted">期望：{{ t.prefer_time || '未指定' }}｜预约于 {{ t.created_at }}</p>
        <p v-if="t.reply" class="trial-reply">客服回复：{{ t.reply }}</p>
        <p v-if="t.admin_note && t.admin_note !== t.reply" class="muted">备注：{{ t.admin_note }}</p>
      </div>
    </div>

    <!-- ======== 活动与优惠 ======== -->
    <div v-if="ads.length" class="card">
      <h2>🎯 活动与优惠</h2>
      <div v-for="a in ads" :key="a.id" class="ad-item" @click="goAd(a)">
        <img v-if="a.image" :src="a.image" class="ad-thumb" alt="" @error="a.image = ''" />
        <div v-else class="ad-icon">🎁</div>
        <div class="ad-info">
          <p><b>{{ a.title }}</b></p>
          <p class="muted" v-if="a.link">点击查看 ›</p>
        </div>
      </div>
    </div>

    <!-- ======== 为什么选择我们 ======== -->
    <div class="why-card" @click="$router.push('/about')">
      <div class="why-left">
        <div class="why-title">为什么选择我们</div>
        <div class="why-sub">专业书法名师 · 系统课程体系 · 一对一作业点评 · 线下不定时指导</div>
        <div class="why-more">点击查看详细介绍 ›</div>
      </div>
      <div class="why-seal">书</div>
    </div>

    <!-- ======== 拼团区 ======== -->
    <div class="card">
      <div class="mk-head">
        <h2 style="margin:0;">👥 拼团区</h2>
        <span class="mk-link" @click="$router.push('/group')">全部拼团 ›</span>
      </div>
      <div v-if="activeGroups.length">
        <div class="mk-item" v-for="g in activeGroups" :key="'g'+g.id" @click="joinGroup(g)">
          <div class="mk-icon">👥</div>
          <div class="mk-info">
            <p><b>{{ g.course_title }}</b></p>
            <p class="muted">已{{ g.member_count }}/{{ g.min_count }}人成团</p>
          </div>
          <span class="tag" style="background:#1565c0;">参团</span>
        </div>
      </div>
      <div v-else class="mk-empty">暂无可拼团的商品，敬请期待</div>
      <button class="btn btn-outline btn-block mt" @click="$router.push('/group')">我要开团 ›</button>
    </div>

    <!-- ======== 砍价区 ======== -->
    <div class="card">
      <div class="mk-head">
        <h2 style="margin:0;">🔪 砍价区</h2>
        <span class="mk-link" @click="$router.push('/courses')">全部砍价商品 ›</span>
      </div>
      <div v-if="bargainCourses.length">
        <div class="mk-item" v-for="c in bargainCourses" :key="'b'+c.id" @click="$router.push('/course/' + c.id)">
          <div class="mk-icon">🔪</div>
          <div class="mk-info">
            <p><b>{{ c.title }}</b></p>
            <p class="muted">原价 ¥{{ fmtMoney(c.original_price || c.price) }} <span class="price" style="margin-left:6px;">¥{{ fmtMoney(c.price) }}</span></p>
          </div>
          <span class="tag" style="background:#f57c00;">去砍价</span>
        </div>
      </div>
      <div v-else class="mk-empty">暂无可砍价的商品，敬请期待</div>
      <button class="btn btn-outline btn-block mt" @click="$router.push('/courses')">发起砍价 ›</button>
    </div>

    <!-- ======== 课程分享入口 ======== -->
    <div class="store-banner" @click="$router.push('/courses')">
      <div>
        <div class="store-title">📚 进入课程分享</div>
        <div class="store-sub">书法 · 文房 · 碑帖 · 活动</div>
      </div>
      <div class="store-arrow">›</div>
    </div>

    <!-- ======== 规则公示 · 安心入口 ======== -->
    <div class="rule-entry" @click="$router.push('/rules')">
      <span>📜 平台规则公示</span>
      <span class="re-sub">合规运营 · 权益透明 · 仅两级分享 ›</span>
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
const showTrial = ref(false)
const trial = ref({ name: '', inviteCode: '', phone: '', ageGroup: 'child', subject: '', mode: 'online', preferTime: '' })
const options = ref({ subjects: [], slots: [] })
const myTrials = ref([])
const ads = ref([])
const bargainCourses = ref([])
const activeGroups = ref([])
const statusText = (s) => ({ booked: '已预约', contacted: '已联系', finished: '已完成', closed: '已关闭' }[s] || s)

const gridNav = [
  { name: '课程分享', to: '/courses', bg: 'linear-gradient(135deg,#b96a33,#8a4a1e)', icon: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z' },
  { name: '任务中心', to: '/tasks', bg: 'linear-gradient(135deg,#43a047,#2e7d32)', icon: 'M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z' },
  { name: '在线练习', to: '/practice', bg: 'linear-gradient(135deg,#1e88e5,#1565c0)', icon: 'M12 3l9 5-9 5-9-5 9-5zm0 12l7-4 2 1.1V15l-9 5-9-5v-2.9L5 11l7 4z' },
  { name: '拼团购课', to: '/group', bg: 'linear-gradient(135deg,#5e35b1,#4527a0)', icon: 'M16 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-8 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z' },
  { name: '我的钱包', to: '/wallet', bg: 'linear-gradient(135deg,#f57c00,#e65100)', icon: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm13 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' },
  { name: '邀请好友', to: '/invite', bg: 'linear-gradient(135deg,#d4a017,#b8860b)', icon: 'M6 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm12 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 21v-1c0-3 3-5 6-5h6c3 0 6 2 6 5v1z' },
]

onMounted(async () => {
  try { options.value = (await api.get('/trial/options')).data } catch (e) { }
  try { ads.value = (await api.get('/ads', { params: { position: 'home_bottom' } })).data } catch (e) { }
  loadMarketing()
  if (store.token) {
    try { myTrials.value = (await api.get('/trial/my')).data } catch (e) { }
  }
})

function openTrial() {
  if (!store.token) { router.push('/login'); return }
  showTrial.value = true
}

async function loadMarketing() {
  try {
    const cs = (await api.get('/courses')).data || []
    bargainCourses.value = cs.filter(c => c.is_bargain)
  } catch (e) { }
  try { activeGroups.value = (await api.get('/group/list')).data || [] } catch (e) { }
}

async function joinGroup(g) {
  if (!store.token) { router.push('/login'); return }
  if (g.member_count >= g.min_count) return
  try {
    const r = await api.post('/group/join', { groupId: g.id })
    alert(r.msg)
    loadMarketing()
  } catch (e) { alert(e.message) }
}

function goAd(a) {
  if (a.link) {
    if (a.link.startsWith('http')) { window.open(a.link, '_blank') }
    else { router.push(a.link) }
  }
}

async function bookTrial() {
  if (!store.token) { router.push('/login'); return }
  if (!trial.value.subject) { alert('请选择体验科目'); return }
  if (!trial.value.inviteCode) { alert('请填写邀请码（向邀请你的朋友索取，没有邀请码请联系管理员）'); return }
  const ph = String(trial.value.phone).trim()
  if (!ph) { alert('请填写联系电话，便于客服与您确认体验课'); return }
  if (!/^1[3-9]\d{9}$/.test(ph)) { alert('联系电话格式不正确，请输入 11 位大陆手机号'); return }
  try {
    const r = await api.post('/trial/book', {
      name: trial.value.name,
      inviteCode: trial.value.inviteCode,
      phone: trial.value.phone,
      ageGroup: trial.value.ageGroup,
      subject: trial.value.subject,
      mode: trial.value.mode,
      preferTime: trial.value.preferTime,
    })
    alert(r.msg); showTrial.value = false
    myTrials.value = (await api.get('/trial/my')).data
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.home-page { padding-top: 14px; }

/* ---------- 顶部横幅 ---------- */
.home-hero {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 24px 22px 20px;
  color: #fff;
  background: linear-gradient(135deg, #8b4513 0%, #a0522d 55%, #6f3a15 100%);
  box-shadow: 0 12px 30px rgba(138, 74, 30, .30);
  margin-bottom: 14px;
}
.hero-bg-text {
  position: absolute; right: -14px; bottom: -40px;
  font-size: 170px; font-weight: 900;
  color: rgba(255, 255, 255, .07);
  line-height: 1;
  pointer-events: none;
  user-select: none;
}
.hero-top { display: flex; justify-content: space-between; align-items: flex-start; position: relative; }
.hero-brand { font-size: 26px; font-weight: 800; letter-spacing: 4px; }
.hero-slogan { color: rgba(255, 255, 255, .85); font-size: 13px; margin-top: 4px; letter-spacing: 1px; }
.hero-seal {
  width: 44px; height: 44px;
  border: 1.5px solid rgba(255, 255, 255, .65);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
  background: rgba(255, 255, 255, .12);
}
.hero-feats { margin-top: 16px; font-size: 12px; color: rgba(255, 255, 255, .8); display: flex; align-items: center; gap: 6px; }
.hero-feats .dot { opacity: .5; }
.hero-btn {
  margin-top: 14px;
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: 15px; font-weight: 600;
  color: #8b4513;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .18);
  cursor: pointer;
  transition: transform .15s, box-shadow .2s;
}
.hero-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(0, 0, 0, .24); }
.hero-btn:active { transform: scale(.98); }
.hero-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

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

/* ---------- 弹窗 ---------- */
.modal-x { border: none; background: none; font-size: 18px; color: #aaa; cursor: pointer; padding: 4px; }

/* ---------- 活动/列表头 ---------- */
.mk-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.mk-link { font-size: 13px; color: var(--brand); cursor: pointer; }

/* ---------- 客服回复 ---------- */
.trial-reply { color: #2e7d32; margin-top: 4px; font-size: 13px; }

/* ---------- 为什么选择我们 ---------- */
.why-card {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #f3e6d4, #f9f0e2);
  border: 1px solid #ead9bf;
  border-radius: 18px;
  padding: 18px 18px 18px 20px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: transform .15s;
}
.why-card:active { transform: scale(.99); }
.why-title { font-size: 17px; font-weight: 700; color: var(--brand-deep); }
.why-sub { font-size: 12.5px; color: #8a7a63; margin-top: 5px; line-height: 1.7; }
.why-more { font-size: 13px; color: #8b4513; margin-top: 8px; }
.why-seal {
  flex-shrink: 0;
  width: 62px; height: 62px;
  border-radius: 50%;
  border: 2px solid rgba(138, 74, 30, .35);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 800; color: var(--brand);
  background: rgba(255, 255, 255, .6);
  margin-left: 12px;
}

/* ---------- 课程分享入口横幅 ---------- */
.store-banner {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--grad);
  color: #fff;
  border-radius: 18px;
  padding: 18px 20px;
  box-shadow: 0 10px 26px rgba(138, 74, 30, .26);
  cursor: pointer;
  transition: transform .15s;
}
.store-banner:active { transform: scale(.99); }
.store-title { font-size: 17px; font-weight: 700; letter-spacing: 1px; }
.store-sub { font-size: 12.5px; color: rgba(255, 255, 255, .82); margin-top: 5px; }
.store-arrow { font-size: 28px; opacity: .8; }

/* ---------- 规则公示 · 安心入口 ---------- */
.rule-entry {
  display: flex; justify-content: space-between; align-items: center;
  background: #f8f4ea;
  border: 1px solid #eadfca;
  border-radius: 14px;
  padding: 13px 16px;
  margin-top: 12px;
  font-size: 13.5px; font-weight: 600; color: var(--brand-deep);
  cursor: pointer;
  transition: transform .15s;
}
.rule-entry:active { transform: scale(.99); }
.re-sub { font-size: 12px; font-weight: 400; color: #a08c6d; }
</style>
