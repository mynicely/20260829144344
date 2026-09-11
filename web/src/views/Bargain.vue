<template>
  <div class="page">
    <div class="card" style="padding:10px 12px;">
      <button class="btn btn-ghost btn-sm" @click="$router.back()">← 返回</button>
    </div>

    <div v-if="bargain">
      <!-- 砍价主卡 -->
      <div class="hero-card">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;opacity:.85;">
          <span>🔪 砍价购课</span>
          <span v-if="bargain.status === 'active'" class="countdown" style="color:#fff;margin-left:auto;">
            <span style="font-weight:500;">距结束</span>
            <span class="box" style="background:rgba(255,255,255,.18);color:#ffd54f;">{{ remain }}</span>
          </span>
        </div>
        <h1 style="margin:6px 0 2px;">{{ bargain.course_title }}</h1>
        <div style="font-size:12px;opacity:.85;">{{ bargain.subtitle }}</div>
        <div style="display:flex;align-items:flex-end;gap:10px;margin-top:14px;">
          <div style="font-size:44px;font-weight:800;line-height:1;">¥{{ fmtMoney(bargain.current_price) }}</div>
          <div style="flex:1;">
            <div style="text-decoration:line-through;opacity:.7;font-size:13px;">原价 ¥{{ fmtMoney(bargain.original_price) }}</div>
            <div style="font-size:12px;opacity:.85;">已砍至底价 ¥{{ fmtMoney(bargain.floor_price) }}</div>
          </div>
          <div style="text-align:center;background:rgba(255,255,255,.14);border-radius:12px;padding:8px 10px;">
            <div style="font-size:22px;font-weight:800;">{{ bargain.helps }}/{{ bargain.max_helps }}</div>
            <div style="font-size:11px;opacity:.85;">人帮砍</div>
          </div>
        </div>
        <div class="progress-bar" style="height:10px;margin-top:14px;background:rgba(255,255,255,.18);">
          <div class="progress-fill" style="background:linear-gradient(90deg,#ffd54f,#ff8f00);" :style="{ width: progress + '%' }"></div>
        </div>
      </div>

      <!-- 砍价规则 -->
      <div v-if="bargain.tier_mode === 'tiers'" class="card">
        <h2>砍价档位</h2>
        <div class="tier-box">
          <div v-for="t in tiers" :key="t.n" class="tier-chip" :class="{ on: bargain.helps >= t.n }">
            {{ t.n }}人 ➜ ¥{{ fmtMoney(t.price) }}
          </div>
          <div v-for="t in tiers.filter(t=>t.services||t.gift)" :key="'b-'+t.n" class="tier-benefit">
            <b>{{ t.n }}人帮砍权益：</b>{{ [t.services, t.gift].filter(Boolean).join('，') }}
          </div>
          <p class="muted" v-if="nextTier && bargain.status === 'active'" style="font-size:12px;margin-top:8px;">
            💡 再邀请 <b style="color:var(--red);">{{ nextTier.n - bargain.helps }}</b> 人帮砍，可降至 <b class="price">¥{{ fmtMoney(nextTier.price) }}</b>
          </p>
          <p class="muted" v-else-if="bargain.status === 'active'" style="font-size:12px;margin-top:8px;">
            💡 已达到当前档位，可立即按 <b class="price">¥{{ fmtMoney(bargain.current_price) }}</b> 购买，继续邀请可降至更低档位价
          </p>
        </div>
      </div>
      <div v-else-if="bargain.tier_mode === 'step'" class="card">
        <h2>砍价规则</h2>
        <div class="tier-box">
          <p class="muted" style="font-size:13px;">🔪 每增加 1 人帮砍，价格再减 <b class="price">¥{{ fmtMoney(step) }}</b>（当前已减 ¥{{ fmtMoney(bargain.original_price - bargain.current_price) }}）</p>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="card">
        <button class="btn btn-gold btn-block" style="margin-bottom:8px;" v-if="bargain.status === 'active'" @click="openShare">🎁 分享给好友帮我砍价</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-gold" style="flex:1;" :disabled="helping" v-if="canHelp && bargain.status === 'active'" @click="help">{{ helping ? '砍价中…' : '🔪 帮我砍一刀' }}</button>
          <button class="btn btn-green" style="flex:1;" :disabled="buying" v-if="canBuy" @click="buyAtPrice">{{ buying ? '提交中…' : `立即购买 ¥${fmtMoney(bargain.current_price)}` }}</button>
          <button class="btn btn-outline" style="flex:1;" v-if="!isMine" @click="copyLink">📋 复制链接邀请</button>
          <button class="btn btn-danger" style="flex:1;" v-if="isMine && (bargain.status === 'active' || bargain.status === 'pending')" @click="cancelBargain">取消砍价</button>
        </div>
        <p class="muted mt" v-if="bargain.status === 'active' && isMine" style="text-align:center;">把链接分享给好友，请他们帮你砍价！</p>
        <p class="muted mt" v-if="bargain.status === 'cancelled'" style="text-align:center;color:var(--red);">该砍价已取消，预付购课款已原路退回</p>
        <p class="muted mt" v-if="bargain.status === 'success'" style="text-align:center;color:var(--green);">✅ 已砍到底价，可立即购买</p>
        <p class="muted mt" v-if="bargain.status === 'active' && isMine && bargain.tier_mode === 'random'" style="text-align:center;font-size:12px;">砍到底价后可购买</p>
      </div>

      <!-- 帮砍记录 -->
      <div class="card">
        <h2>帮砍记录（{{ bargain.helps }}）</h2>
        <div v-for="h in bargain.helpList" :key="h.id" class="help-row">
          <div class="member-avatar">{{ (h.nickname || '友').slice(0, 1) }}</div>
          <div style="flex:1;"><b>{{ h.nickname || '好友' }}</b> <span class="muted" style="font-size:12px;margin-left:6px;">帮砍</span></div>
          <span class="price">-¥{{ fmtMoney(h.cut_amount) }}</span>
        </div>
        <div v-if="!bargain.helpList || !bargain.helpList.length" class="empty"><span class="e-ico">🔪</span>还没有人帮砍，快去邀请吧！</div>
      </div>

      <p class="muted" style="text-align:center;font-size:12px;margin-top:-4px;">发起人：{{ bargain.nickname }}｜发起时间：{{ bargain.created_at }}</p>

      <!-- 线下收款码弹窗 -->
      <PayCodeModal
        :visible="payModal.show"
        :receiveInfo="payModal.receiveInfo"
        :orderNo="payModal.orderNo"
        :pay="payModal.pay"
        @close="payModal.show = false"
      />

      <!-- 砍价分享弹层（携带 bargainId，好友点开直接助力砍价） -->
      <SharePanel
        v-if="shareOpen"
        title="分享给好友帮我砍价"
        :link="shareLink"
        :poster-title="bargain.course_title"
        :poster-sub="bargain.subtitle || '邀请好友帮砍，越砍越便宜'"
        :poster-price="'已砍至 ¥' + fmtMoney(bargain.current_price)"
        poster-tip="长按识别二维码 · 帮我砍一刀"
        action-text="好友帮砍，价格更低"
        @close="shareOpen = false"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import { requestWxPay, waitOrderPaid } from '../pay'
import { useUserStore } from '../store'
import { toast } from '../utils/toast'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'
import PayCodeModal from '../components/PayCodeModal.vue'
import SharePanel from '../components/SharePanel.vue'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const bargain = ref(null)
const payModal = ref({ show: false, receiveInfo: {}, orderNo: '', pay: 0 })
const helping = ref(false) // 防重复帮砍
const buying = ref(false)  // 防重复购买
// 砍价分享（与邀请码分享相互独立）：链接携带 bargainId，好友点开直接助力砍价
const shareOpen = ref(false)
const shareLink = computed(() => bargain.value ? location.origin + '/bargain/' + bargain.value.id : '')
function openShare() { shareOpen.value = true }
const now = ref(Date.now())
let timer = null

const progress = computed(() => {
  if (!bargain.value) return 0
  const total = bargain.value.original_price - bargain.value.floor_price
  const done = bargain.value.original_price - bargain.value.current_price
  return total <= 0 ? 100 : Math.min(100, Math.round(done / total * 100))
})
const isMine = computed(() => bargain.value && store.user && bargain.value.initiator_id === store.user.id)
const canHelp = computed(() => !isMine.value && bargain.value.status === 'active')
const tiers = computed(() => {
  try {
    const cfg = JSON.parse(bargain.value.tier_config || '{}')
    return (cfg.tiers || []).map(x => ({ n: x.n || x.helps, price: x.price, services: x.services, gift: x.gift }))
  } catch (e) { return [] }
})
const step = computed(() => {
  try { return JSON.parse(bargain.value.tier_config || '{}').step || 0 } catch (e) { return 0 }
})
const nextTier = computed(() => {
  const b = bargain.value
  if (!b || b.tier_mode !== 'tiers') return null
  return tiers.value.find(t => t.n > b.helps) || null
})
const canBuy = computed(() => {
  const b = bargain.value
  if (!b) return false
  if (b.status === 'success') return true
  return b.status === 'active' && b.tier_mode !== 'random' && b.current_price < b.original_price
})
const remain = computed(() => {
  if (!bargain.value || !bargain.value.expire_at) return '00:00:00'
  const diff = new Date(bargain.value.expire_at).getTime() - now.value
  if (diff <= 0) return '00:00:00'
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(diff / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
})

onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  await store.fetchMe()
  load()
})
onUnmounted(() => clearInterval(timer))

async function load() {
  try {
    const d = (await api.get('/bargain/' + route.params.id)).data
    bargain.value = d
  } catch (e) { toast(e.message, 'error'); router.back() }
}
async function help() {
  if (!store.token) { router.push('/login?redirect=' + route.fullPath); return }
  if (helping.value) return
  helping.value = true
  try {
    const r = await api.post('/bargain/' + route.params.id + '/help')
    toast(r.msg); load()
  } catch (e) { toast(e.message, 'error'); load() } finally { helping.value = false }
}
async function buyAtPrice() {
  if (!store.token) { router.push('/login'); return }
  if (buying.value) return
  // 分享推广身份（promoter）用户参与砍价成交：需确认放弃本单全部分享奖励
  if (store.user && store.user.identity === 'promoter') {
    if (!(await dialog.confirm('您当前是分享推广身份，参与砍价优惠，本订单将放弃全部分享奖励，不会产生推广收益，也不会更新您的分享推广身份，确认继续下单？'))) return
  }
  if (!(await dialog.confirm(`确认以 ¥${fmtMoney(bargain.value.current_price)} 购买「${bargain.value.course_title}」？`))) return
  buying.value = true
  try {
    const r = await api.post('/bargain/' + bargain.value.id + '/buy')
    if (r.data.payMode === 'manual') {
      payModal.value = { show: true, receiveInfo: r.data.receiveInfo || {}, orderNo: r.data.order.order_no, pay: r.data.pay }
      return
    }
    if (r.data.payParams) {
      try {
        await requestWxPay(r.data.payParams, r.data.order.order_no)
        toast('支付成功！正在确认到账...')
        const order = await waitOrderPaid(r.data.order.order_no)
        store.fetchMe()
        toast(order ? '购买成功！成交价 ¥' + fmtMoney(r.data.pay) : '支付已提交，到账确认中，请稍后在「我的课程」查看')
        router.push('/mine')
      } catch (e) {
        toast(/取消/.test(e.message) ? '已取消支付，订单保留，可稍后重新购买' : e.message, 'error')
      }
      return
    }
    toast(r.msg); router.push('/mine')
  } catch (e) { toast(e.message, 'error') } finally { buying.value = false }
}
async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast('链接已复制，快去分享！') }
  catch (e) { toast('请手动复制地址栏链接分享', 'warn') }
}
async function cancelBargain() {
  if (!(await dialog.confirm('确定取消该砍价？预付购课款将原路退回。'))) return
  try {
    const r = await api.post('/bargain/' + bargain.value.id + '/cancel')
    toast(r.msg); load()
  } catch (e) { toast(e.message, 'error') }
}
</script>

<style scoped>
.tier-box { border: 1px dashed #e0c9a8; background: #fdf9f0; border-radius: 12px; padding: 10px 12px; }
.tier-benefit {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #6b5e4f;
}
.tier-chip {
  display: inline-block; margin: 2px 4px 2px 0; padding: 4px 10px; font-size: 12px;
  border: 1px solid var(--line); border-radius: 14px; color: #9b8f80;
  transition: all .2s;
}
.tier-chip.on { border-color: var(--brand); color: var(--brand); background: #fff; font-weight: 700; }
.help-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--line);
}
.help-row:last-child { border-bottom: none; }
.member-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, #f57c00, #e65100); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; flex-shrink: 0;
}
</style>
