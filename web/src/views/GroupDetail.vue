<template>
  <div class="page">
    <div class="card" style="padding:10px 12px;">
      <button class="btn btn-ghost btn-sm" @click="$router.back()">← 返回</button>
    </div>

    <div v-if="group">
      <!-- 拼团主卡 -->
      <div class="hero-card">
        <div style="font-size:13px;opacity:.85;">拼团购课</div>
        <h1 style="margin:2px 0 4px;">{{ group.course_title }}</h1>
        <div style="font-size:12px;opacity:.85;margin-bottom:10px;">{{ group.subtitle }}</div>
        <div style="display:flex;align-items:flex-end;gap:8px;">
          <div style="font-size:34px;font-weight:800;">¥{{ fmtMoney(group.tier_price || (group.price - (group.group_discount || 0))) }}</div>
          <div style="text-decoration:line-through;opacity:.7;font-size:14px;margin-bottom:6px;">¥{{ fmtMoney(group.original_price || group.price) }}</div>
        </div>
        <div v-if="group.tierSnapshot && (group.tierSnapshot.services || group.tierSnapshot.gift)" class="tier-snapshot">
          <b>{{ group.min_count }}人团权益：</b>{{ [group.tierSnapshot.services, group.tierSnapshot.gift].filter(Boolean).join('，') }}
        </div>
        <div v-if="group.status === 'opening'" style="display:flex;align-items:center;gap:8px;font-size:12px;opacity:.9;margin-top:6px;">
          <span>距结束</span>
          <div class="countdown" style="color:#fff;"><span class="box">{{ remain }}</span></div>
        </div>
      </div>

      <!-- 拼团进度 -->
      <div class="card" style="text-align:center;">
        <svg width="120" height="120" viewBox="0 0 120 120" style="margin:4px auto 8px;display:block;">
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e3b23c" />
              <stop offset="100%" stop-color="#8a4a1e" />
            </linearGradient>
          </defs>
          <circle class="ring-bg" cx="60" cy="60" r="50" stroke-width="10" fill="none" />
          <circle class="ring-val" cx="60" cy="60" r="50" stroke-width="10" fill="none"
            :stroke-dasharray="2 * Math.PI * 50"
            :stroke-dashoffset="2 * Math.PI * 50 * (1 - progress / 100)" />
          <text x="60" y="56" text-anchor="middle" font-size="22" font-weight="800" fill="#2b2118">{{ group.member_count }}/{{ group.min_count }}</text>
          <text x="60" y="76" text-anchor="middle" font-size="12" fill="#9b8f80">人已参团</text>
        </svg>
        <p style="font-weight:600;">还差 <span class="price">{{ Math.max(0, group.min_count - group.member_count) }}</span> 人成团</p>
        <div class="progress-bar" style="margin-top:8px;">
          <div class="progress-fill brand" :style="{ width: progress + '%' }"></div>
        </div>
        <p class="muted mt">开团人：{{ group.leader_nickname || '用户' + group.leader_user }}｜团号：{{ group.group_no }}</p>
        <p class="muted" v-if="group.status !== 'opening'">{{ group.status === 'success' ? '✅ 已成团，可享拼团优惠购课' : (group.status === 'cancelled' ? '该拼团已被团长取消' : '该拼团已结束') }}</p>

        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-gold" style="flex:1;" v-if="group.status === 'opening' && !joined" @click="join">立即参团</button>
          <button class="btn btn-outline" style="flex:1;" v-if="group.status === 'opening'" @click="openShare">🔗 分享邀请好友来参团</button>
          <button class="btn btn-danger" style="flex:1;" v-if="isLeader && group.status === 'opening' && group.member_count === 1" @click="cancelGroup">取消拼团</button>
        </div>
        <button class="btn btn-green btn-block mt" :disabled="buying" v-if="group.status === 'success' && joined" @click="buyGroup">
          {{ buying ? '提交中…' : `🎉 已成团，以拼团价 ¥${fmtMoney(group.tier_price || (group.price - (group.group_discount || 0)))} 购课` }}
        </button>
        <p class="muted mt" style="text-align:center;" v-if="joined">你已加入该团 ✓</p>
      </div>

      <!-- 成员 -->
      <div class="card">
        <h2>参团成员（{{ group.member_count }}）</h2>
        <div v-for="m in group.members" :key="m.user_id" class="member-row">
          <div class="member-avatar">{{ (m.nickname || '友').slice(0, 1) }}</div>
          <div style="flex:1;">
            <b>{{ m.nickname || '用户' + m.user_id }}</b>
            <span v-if="m.user_id === group.leader_user" class="tag tag-gold" style="margin-left:6px;">团长</span>
          </div>
          <span class="muted" style="font-size:12px;">{{ m.joined_at }}</span>
        </div>
        <div v-if="!group.members || !group.members.length" class="empty"><span class="e-ico">👤</span>暂无成员</div>
      </div>
    </div>

    <!-- 线下收款码弹窗 -->
    <PayCodeModal
      :visible="payModal.show"
      :receiveInfo="payModal.receiveInfo"
      :orderNo="payModal.orderNo"
      :pay="payModal.pay"
      @close="payModal.show = false"
    />

    <!-- 拼团分享弹层（携带 groupId，好友点开直接参团） -->
    <SharePanel
      v-if="shareOpen"
      title="分享邀请好友来参团"
      :link="shareLink"
      :poster-title="group.course_title"
      :poster-sub="group.subtitle || '拼团购课 · 邀好友同享优惠'"
      :poster-price="'参团价 ¥' + fmtMoney(group.tier_price || (group.price - (group.group_discount || 0)))"
      poster-tip="长按识别二维码 · 立即参团"
      action-text="好友参团，同享拼团优惠"
      @close="shareOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { toast } from '../utils/toast'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'
import PayCodeModal from '../components/PayCodeModal.vue'
import SharePanel from '../components/SharePanel.vue'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const group = ref(null)
const joined = ref(false)
const payModal = ref({ show: false, receiveInfo: {}, orderNo: '', pay: 0 })
const buying = ref(false) // 防重复提交
const joining = ref(false)
const now = ref(Date.now())
let timer = null

const progress = computed(() => {
  if (!group.value || group.value.min_count <= 0) return 0
  return Math.min(100, Math.round(group.value.member_count / group.value.min_count * 100))
})
const isLeader = computed(() => group.value && store.user && group.value.leader_user === store.user.id)
// 拼团分享（与邀请码分享相互独立）：链接携带 groupId，好友点开直接参团
const shareOpen = ref(false)
const shareLink = computed(() => group.value ? location.origin + '/group/' + group.value.id : '')
function openShare() { shareOpen.value = true }
const remain = computed(() => {
  if (!group.value || !group.value.expire_at) return '00:00:00'
  const diff = new Date(group.value.expire_at).getTime() - now.value
  if (diff <= 0) return '00:00:00'
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(diff / 3600000))}:${pad(Math.floor(diff % 3600000 / 60000))}:${pad(Math.floor(diff % 60000 / 1000))}`
})

onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  await store.fetchMe()
  load()
})
onUnmounted(() => clearInterval(timer))

async function load() {
  try {
    const d = (await api.get('/group/' + route.params.id)).data
    group.value = d
    if (store.user && d.members) {
      joined.value = d.members.some(m => m.user_id === store.user.id)
    }
  } catch (e) { toast(e.message, 'error'); router.back() }
}
async function join() {
  if (!store.token) { router.push('/login?redirect=' + route.fullPath); return }
  if (joining.value) return
  joining.value = true
  try {
    const r = await api.post('/group/join', { groupId: group.value.id })
    toast(r.msg)
    if (r.success) { setTimeout(() => toast('🎉 拼团成功！可享拼团优惠价购课'), 600) }
    load()
  } catch (e) { toast(e.message, 'error'); load() } finally { joining.value = false }
}
async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast('拼团链接已复制，快邀请好友参团！') }
  catch (e) { toast('请手动复制地址栏链接分享', 'warn') }
}
async function cancelGroup() {
  const tip = group.value.member_count === 1 ? '，预付购课款将原路退回' : ''
  if (!(await dialog.confirm('确定取消该拼团？' + tip))) return
  try {
    const r = await api.post('/group/' + group.value.id + '/cancel')
    toast(r.msg); load()
  } catch (e) { toast(e.message, 'error') }
}
async function buyGroup() {
  if (!store.token) { router.push('/login?redirect=' + route.fullPath); return }
  if (buying.value) return
  // 分享推广身份（promoter）用户以拼团价购课：需确认放弃本单全部分享奖励
  if (store.user && store.user.identity === 'promoter') {
    if (!(await dialog.confirm('您当前是分享推广身份，以拼团优惠价购课，本订单将放弃全部分享奖励，不会产生推广收益，也不会更新您的分享推广身份，确认继续下单？'))) return
  }
  buying.value = true
  try {
    const r = await api.post('/order', { productType: group.value.level, groupId: group.value.id })
    if (r.ok) {
      if (r.data.payMode === 'manual') {
        payModal.value = { show: true, receiveInfo: r.data.receiveInfo || {}, orderNo: r.data.order.order_no, pay: r.data.pay }
        return
      }
      toast('🎉 拼团价购课成功！实付 ¥' + fmtMoney(r.data.pay)); router.push('/orders')
    }
    else toast(r.msg, 'error')
  } catch (e) { toast(e.message, 'error') } finally { buying.value = false }
}
</script>

<style scoped>
.member-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--line);
}
.member-row:last-child { border-bottom: none; }
.member-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--grad); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 16px;
  flex-shrink: 0;
}
.tier-snapshot {
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(255,255,255,.18);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}
</style>
