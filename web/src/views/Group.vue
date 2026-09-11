<template>
  <div class="page">
    <div class="hero-card">
      <div style="font-size:13px;opacity:.85;">多人成团 · 越拼越省</div>
      <h1 style="margin:2px 0 6px;">拼团购课</h1>
      <div style="font-size:12px;opacity:.85;">拼团仅学习优惠，不产生任何分享奖励、学习圈收益，与分享体系完全隔离</div>
    </div>

    <!-- 开团 -->
    <div class="card">
      <h2>发起拼团</h2>
      <label class="label">选择课程</label>
      <select class="input" v-model="courseId" @change="onCourseChange">
        <option v-for="c in courses.filter(x=>x.is_group)" :key="c.id" :value="c.id">{{ c.title }}（¥{{ fmtMoney(c.price) }}）</option>
      </select>

      <template v-if="groupTiers.length">
        <label class="label">选择拼团档位（人数越多越优惠）</label>
        <div class="tier-row" v-for="t in groupTiers" :key="t.n" :class="{ on: tierCount === t.n, hot: t.n === bestTier }" @click="tierCount = t.n">
          <div style="flex:1;">
            <b>{{ t.n }}人团</b>
            <span v-if="t.n === bestTier" class="tag tag-gold" style="margin-left:6px;">最划算</span>
            <div v-if="t.services || t.gift" class="tier-benefit-line">{{ [t.services, t.gift].filter(Boolean).join('，') }}</div>
          </div>
          <div style="text-align:right;">
            <div class="price" style="font-size:18px;">¥{{ fmtMoney(t.price) }}</div>
            <div class="muted" style="font-size:12px;">立省 ¥{{ fmtMoney((selectedCourse?.price || 0) - t.price) }}</div>
          </div>
        </div>
        <p class="muted" style="font-size:12px;margin-top:4px;">档位价：{{ groupTiers.map(t => t.n + '人 ¥' + fmtMoney(t.price)).join('　') }}</p>
      </template>
      <p v-else class="muted" style="font-size:12px;">当前未设置拼团档位价，按默认 {{ (selectedCourse?.group_min || groupMin) }} 人成团、固定抵扣开团。</p>

      <button class="btn btn-primary btn-block mt" :disabled="creating" @click="createGroup">{{ creating ? '开团中…' : `我要开团（${tierCount || (selectedCourse?.group_min || groupMin)}人团）` }}</button>
    </div>

    <!-- 正在拼团 -->
    <div class="card">
      <h2>正在拼团 <span class="chip chip-line" style="margin-left:6px;">{{ groups.length }} 个</span></h2>
      <div v-for="g in groups" :key="g.id" class="group-card" @click="$router.push('/group/' + g.id)">
        <div class="mk-icon">👥</div>
        <div class="mk-info">
          <p><b>{{ g.course_title }}</b> <span class="tag tag-gold" v-if="g.tier_price">拼团价 ¥{{ fmtMoney(g.tier_price) }}</span></p>
          <div class="progress-bar" style="height:8px;margin:6px 0;">
            <div class="progress-fill brand" :style="{ width: pct(g) + '%' }"></div>
          </div>
          <p class="muted" style="font-size:12px;">已{{ g.member_count }}/{{ g.min_count }}人，还差 {{ Math.max(0, g.min_count - g.member_count) }} 人</p>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="countdown" v-if="remainText(g)"><span class="box">剩</span>{{ remainText(g) }}</div>
          <span class="tag tag-green" style="margin-top:6px;">去参团</span>
        </div>
      </div>
      <div v-if="!groups.length" class="empty"><span class="e-ico">👥</span>暂无进行中的拼团，快开一单吧！</div>
    </div>

    <!-- 开团预付收款码弹窗 -->
    <PayCodeModal
      :visible="payModal.show"
      :receiveInfo="payModal.receiveInfo"
      :orderNo="payModal.orderNo"
      :pay="payModal.pay"
      @close="payModal.show = false"
    />
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

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const courses = ref([])
const groups = ref([])
const groupTiers = ref([])
const groupMin = ref(2)
const courseId = ref('')
const tierCount = ref(null)
const payModal = ref({ show: false, receiveInfo: {}, orderNo: '', pay: 0 })
const creating = ref(false) // 防重复开团
const now = ref(Date.now())
let timer = null

const selectedCourse = computed(() => courses.value.find(c => c.id === Number(courseId.value)))
const globalGroupTiers = ref([])
function setCourseTiers() {
  const c = selectedCourse.value
  const own = c?.group_tiers
  if (Array.isArray(own) && own.length) {
    groupTiers.value = own.map(t => ({ n: t.count || t.n, price: t.price, services: t.services, gift: t.gift }))
  } else {
    groupTiers.value = globalGroupTiers.value
  }
  tierCount.value = groupTiers.value[0]?.n || (c?.group_min || groupMin.value)
}
// 最划算档位：价格最低的一档
const bestTier = computed(() => {
  if (!groupTiers.value.length) return null
  return groupTiers.value.reduce((a, b) => (b.price < a.price ? b : a)).n
})
const pad = (n) => String(n).padStart(2, '0')
function remainText(g) {
  if (!g.expire_at) return ''
  const diff = new Date(g.expire_at).getTime() - now.value
  if (diff <= 0) return '已结束'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor(diff % 3600000 / 60000)
  const s = Math.floor(diff % 60000 / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
const pct = (g) => Math.min(100, Math.round(g.member_count / g.min_count * 100))

onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  try {
    courses.value = (await api.get('/courses')).data
    const fromQuery = route.query.courseId ? Number(route.query.courseId) : null
    if (fromQuery && courses.value.some(c => c.id === fromQuery)) {
      courseId.value = fromQuery
    } else {
      const firstGroup = courses.value.find(x => x.is_group)
      if (!courseId.value && firstGroup) courseId.value = firstGroup.id
    }
  } catch (e) {}
  try {
    const m = (await api.get('/public/marketing')).data
    globalGroupTiers.value = m.groupTiers || []
    groupMin.value = m.groupMin || 2
  } catch (e) {}
  setCourseTiers()
  try { groups.value = (await api.get('/group/list')).data } catch (e) {}
})
onUnmounted(() => clearInterval(timer))

function onCourseChange() {
  setCourseTiers()
}

async function createGroup() {
  if (!store.token) { router.push('/login'); return }
  if (!courseId.value) return toast('请先选择拼团课程', 'error')
  if (creating.value) return
  // 分享推广身份（promoter）用户参与拼团：需确认放弃本单全部分享奖励
  if (store.user && store.user.identity === 'promoter') {
    if (!(await dialog.confirm('您当前是分享推广身份，参与拼团优惠，本订单将放弃全部分享奖励，不会产生推广收益，也不会更新您的分享推广身份，确认继续下单？'))) return
  }
  const needPay = tierCount.value || selectedCourse.value?.group_min || groupMin.value
  if (!(await dialog.confirm(`确认发起 ${needPay} 人团？开团需先支付购课款，管理员确认到账后开团成功；若 ${needPay} 人团未成团，预付款将原路退回。`))) return
  creating.value = true
  try {
    const body = { courseId: courseId.value }
    if (tierCount.value) body.tierCount = tierCount.value
    const r = await api.post('/group/create', body)
    if (r.data.payMode === 'manual') {
      payModal.value = { show: true, receiveInfo: r.data.receiveInfo || {}, orderNo: r.data.order.order_no, pay: r.data.pay }
      return
    }
    if (r.data.payMode === 'wxpay' && r.data.payParams) {
      try {
        await requestWxPay(r.data.payParams, r.data.order.order_no)
        toast('支付成功！正在确认到账...')
        const order = await waitOrderPaid(r.data.order.order_no)
        store.fetchMe()
        const tierTip = r.data.tierPrice ? `，本团价 ¥${fmtMoney(r.data.tierPrice)}` : ''
        toast(order ? `开团成功！${r.data.minCount}人团${tierTip}，可复制链接邀请好友参团` : '支付已提交，到账确认中，稍后自动开团')
        router.push('/group/' + r.data.groupId)
      } catch (e) {
        toast(/取消/.test(e.message) ? '已取消支付，订单保留，可稍后在「我的订单」重新支付' : e.message, 'error')
      }
      return
    }
    const tierTip = r.data.tierPrice ? `，本团价 ¥${fmtMoney(r.data.tierPrice)}` : ''
    toast(`开团成功！${r.data.minCount}人团${tierTip}，可复制链接邀请好友参团`)
    router.push('/group/' + r.data.groupId)
  } catch (e) { toast(e.message, 'error') } finally { creating.value = false }
}
</script>

<style scoped>
.tier-row {
  display: flex; align-items: center; gap: 10px;
  border: 1.5px solid var(--line); border-radius: 12px; padding: 11px 12px; margin-top: 8px; cursor: pointer;
  transition: all .2s;
}
.tier-row.on { border-color: var(--brand); background: var(--brand-soft); box-shadow: 0 2px 10px rgba(163,84,42,.12); }
.tier-row.hot.on { border-color: var(--gold); }
.group-card {
  display: flex; gap: 12px; align-items: center;
  padding: 10px 0; border-bottom: 1px solid var(--line); cursor: pointer;
}
.group-card:last-child { border-bottom: none; }
.tier-benefit-line {
  margin-top: 4px;
  font-size: 11px;
  color: #9b8f80;
  line-height: 1.4;
}
</style>
