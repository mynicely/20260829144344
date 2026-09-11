<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>

    <div v-if="course">
      <div class="card">
        <!-- 封面轮播（支持多图，无图回退渐变占位） -->
        <div v-if="covers.length" class="cd-swiper">
          <div class="cd-track" :style="{ transform: 'translateX(-' + cur * 100 + '%)' }">
            <div v-for="(img, i) in covers" :key="i" class="cd-slide">
              <img :src="img" :alt="course.title" @error="onImgError(i)" />
            </div>
          </div>
          <button v-if="covers.length > 1" class="cd-arrow cd-arrow-l" @click.stop="go(-1)" aria-label="上一张">‹</button>
          <button v-if="covers.length > 1" class="cd-arrow cd-arrow-r" @click.stop="go(1)" aria-label="下一张">›</button>
          <div v-if="covers.length > 1" class="cd-dots">
            <span v-for="(img, i) in covers" :key="i" class="cd-dot" :class="{ on: i === cur }" @click="cur = i"></span>
          </div>
        </div>
        <div v-else class="detail-hero">
          <span class="dh-char">{{ course.type === 'goods' ? '🛍️' : course.type === 'activity' ? '🏕️' : '📚' }}</span>
        </div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="flex:1;">{{ course.title }}</span>
          <button class="btn btn-sm btn-outline" @click="openShare">📤 分享</button>
        </h1>
        <p class="muted">{{ course.subtitle }}</p>
        <p style="margin:10px 0;">
          <span class="price" style="font-size:26px;">¥{{ fmtMoney(course.price) }}</span>
          <span class="muted" style="text-decoration:line-through;margin-left:8px;">¥{{ fmtMoney(course.original_price) }}</span>
        </p>
        <p>
          <span class="tag">{{ course.type === 'course' ? '课程' : course.type === 'goods' ? '实物' : '活动' }}</span>
          <span class="tag" v-if="course.validity === 'lifetime'" style="background:#2e7d32;">终身有效</span>
          <span class="tag" v-if="course.is_group">可拼团 {{ course.group_min }}人</span>
          <span class="tag" v-if="course.is_bargain" style="background:#f57c00;">可砍价</span>
          <span class="tag" v-if="course.type === 'goods'" style="background:#666;">已售 {{ course.sales }}</span>
        </p>
        <p class="muted" v-if="course.is_group && groupTiers.length" style="font-size:12px;line-height:1.8;">
          👥 拼团档位价：{{ groupTiers.map(t => t.n + '人 ¥' + fmtMoney(t.price)).join('　') }}
        </p>
        <div v-if="course.is_group && groupTiers.some(t=>t.services||t.gift)" class="tier-benefit">
          <div v-for="t in groupTiers.filter(t=>t.services||t.gift)" :key="t.n">
            <b>{{ t.n }}人团权益：</b>{{ [t.services, t.gift].filter(Boolean).join('，') }}
          </div>
        </div>
        <p class="muted" v-if="course.is_bargain && bargainTiers.length" style="font-size:12px;line-height:1.8;">
          🔪 砍价档位：邀请 {{ bargainTiers.map(t => t.n + '人帮砍可至 ¥' + fmtMoney(t.price)).join('、') }}
        </p>
        <div v-if="course.is_bargain && bargainTiers.some(t=>t.services||t.gift)" class="tier-benefit">
          <div v-for="t in bargainTiers.filter(t=>t.services||t.gift)" :key="t.n">
            <b>{{ t.n }}人帮砍权益：</b>{{ [t.services, t.gift].filter(Boolean).join('，') }}
          </div>
        </div>
        <p class="muted" v-if="course.is_bargain && bargainStep > 0 && !bargainTiers.length" style="font-size:12px;">
          🔪 砍价规则：每增加1人帮砍减 ¥{{ fmtMoney(bargainStep) }}
        </p>
        <p class="muted" v-if="course.type === 'goods' && course.stock >= 0">库存：{{ course.stock }}</p>
      </div>

      <!-- 讲师介绍 -->
      <div class="card" v-if="course.teacher">
        <h2>👨‍🏫 讲师介绍</h2>
        <div class="rich-content" style="line-height:1.9;" v-html="course.teacher"></div>
      </div>

      <!-- 课程大纲（章节式学习目录） -->
      <div class="card" v-if="chapters.length">
        <h2>📋 课程大纲（{{ chapters.length }}章）</h2>
        <div v-for="(ch, i) in chapters" :key="ch.id" style="display:flex;justify-content:space-between;border-bottom:1px dashed #eee;padding:8px 0;gap:10px;">
          <span style="flex:1;">{{ i + 1 }}. {{ ch.title }}</span>
          <span class="muted" v-if="ch.duration">{{ ch.duration }}</span>
        </div>
        <p class="muted mt" style="text-align:center;color:#2e7d32;">报名后按章节逐课学习，学完即练，进步看得见</p>
      </div>

      <!-- 常见问题 -->
      <div class="card" v-if="faq.length">
        <h2>❓ 常见问题</h2>
        <div v-for="(f, i) in faq" :key="i" style="border-bottom:1px solid #eee;padding:8px 0;">
          <p style="font-weight:600;cursor:pointer;margin:0;" @click="toggleFaq(i)">{{ f.q }} <span class="muted" style="float:right;">{{ openFaq === i ? '▲' : '▼' }}</span></p>
          <p v-if="openFaq === i" class="muted" style="line-height:1.8;margin-top:6px;">{{ f.a }}</p>
        </div>
      </div>

      <div class="card">
        <h2>商品详情</h2>
        <div class="rich-content" style="line-height:1.9;" v-html="course.content || '<p>暂无详情</p>'"></div>
      </div>

      <div class="card">
        <h2>学员评价（{{ review.count }}）</h2>
        <p v-if="review.count" style="margin:6px 0;">
          <span class="price" style="font-size:24px;">{{ review.avg }}</span><span class="muted"> 分 / 5 分</span>
        </p>
        <div v-for="rv in review.list" :key="rv.id" class="trial-item">
          <p><b>{{ rv.nickname || '学员' }}</b>
            <span style="color:#f57c00;margin-left:6px;">{{ '★'.repeat(rv.rating) }}{{ '☆'.repeat(5 - rv.rating) }}</span>
          </p>
          <p v-if="rv.content" class="rich-content" v-html="rv.content"></p>
          <p v-else>（学员未填写文字评价）</p>
          <p class="muted">{{ rv.created_at }}</p>
        </div>
        <p v-if="!review.count" class="muted">暂无评价，成为第一个评价的学员吧</p>
        <template v-if="store.token">
          <button v-if="review.canReview && !review.mine" class="btn btn-block mt" @click="openReviewModal">✍️ 写评价</button>
          <p v-if="review.mine" class="muted mt">✅ 您已评价（{{ review.mine.rating }}星）<span v-if="review.mine.content" class="rich-content" v-html="'：' + review.mine.content"></span></p>
        </template>
      </div>

      <div class="card">
        <h2>🔒 购买须知</h2>
        <p class="muted" style="line-height:1.9;font-size:13px;">
          1. 课程费用为教学服务费，报名后长期有效，按章节逐课学习；<br/>
          2. 分享权益为平台赠与的学习激励，非加盟费、非投资理财，自愿参与；<br/>
          3. 学习抵用券仅用于课程抵扣，不可提现，明细可在「抵用券」页随时查看。
        </p>
      </div>

      <div class="buy-bar">
        <button v-if="course.is_bargain" class="btn btn-buy-sub" style="background:#f57c00;margin-right:8px;" @click="startBargain">🔪 发起砍价</button>
        <button v-if="course.is_group" class="btn btn-buy-sub" style="margin-right:8px;" @click="$router.push('/group?courseId=' + course.id)">👥 去拼团</button>
        <button class="btn btn-buy-main" style="flex:1;" @click="openBuy">立即报名 ¥{{ course.price }}</button>
      </div>
    </div>

    <!-- 写评价弹层 -->
    <div class="modal-mask" v-if="showReviewModal">
      <div class="modal">
        <h2 style="margin-bottom:6px;">评价课程</h2>
        <p class="muted">{{ course?.title }}</p>
        <div class="stars" style="margin:10px 0;">
          <span v-for="s in 5" :key="s" class="star" :class="{ on: s <= rating }" @click="rating = s">{{ s <= rating ? '★' : '☆' }}</span>
        </div>
        <label class="label">评价内容</label>
        <WysiwygEditor v-model="reviewText" :min-height="'110px'" placeholder="说说你的学习体验吧（选填），支持加粗、图片等富文本" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-block" @click="submitReview">提交评价</button>
          <button class="btn btn-outline btn-block" @click="showReviewModal = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 购买身份选择弹窗（≥499课程） -->
    <div class="modal-mask" v-if="showIdentityModal">
      <div class="modal">
        <h2 style="margin-bottom:8px;">{{ needRebind ? '⚠️ 需转绑定推荐人' : '选择参与方式' }}</h2>
        <p class="muted" style="line-height:1.8;">
          <template v-if="needRebind">
            您的邀请人是<b>普通消费者</b>，无法参与分享奖励。请选择：
            <br/>① 请邀请人升级为分享伙伴
            <br/>② 填写一位分享伙伴的ID作为新邀请人（与原邀请人解绑）
          </template>
          <template v-else>
            {{ course.title }}（¥{{ course.price }}）购买前请二选一：
          </template>
        </p>

        <template v-if="!needRebind">
          <div class="opt-grid" style="margin-top:8px;">
            <button class="opt-chip" :class="{ active: buyJoin === 'share' }" @click="buyJoin = 'share'">💎 参与分享有奖</button>
            <button class="opt-chip" :class="{ active: buyJoin === 'none' }" @click="buyJoin = 'none'">🙋 放弃本单分享奖励</button>
          </div>
          <p class="muted" style="font-size:13px;margin-top:8px;">
            <b>参与分享有奖</b>：本单可获得分享奖励，可开通分享推广身份（邀请人须为分享伙伴）
            <br/><b>放弃本单分享奖励</b>：仅购买课程学习，本单不产生任何分享奖励
          </p>
        </template>

        <div v-if="needRebind || buyJoin === 'share'" style="margin-top:10px;">
          <label class="label">新邀请人ID（分享伙伴）</label>
          <input class="input" v-model.number="newReferrerId" placeholder="填写分享伙伴ID（选填，留空表示仅请邀请人升级）" />
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-block" :disabled="buying" @click="confirmBuy">{{ buying ? '提交中…' : `确认购买 ¥${fmtMoney(course.price)}` }}</button>
          <button class="btn btn-outline btn-block" :disabled="buying" @click="closeModal">取消</button>
        </div>
      </div>
    </div>

    <!-- 参与分享二次确认弹窗（PRD：选择后须再次确认，防误触） -->
    <div class="modal-mask" v-if="showConfirmModal">
      <div class="modal">
        <h2 style="margin-bottom:8px;">确认参与「分享有奖」</h2>
        <p class="muted" style="line-height:1.9;">
          您已选择 <b>💎 分享有奖（成为分享伙伴）</b>，请确认以下权益与规则：
          <br/>· 购买 {{ course.title }}（¥{{ fmtMoney(course.price) }}）并成为分享伙伴
          <br/>· 分享课程给好友，好友成功购课后您可获得分享奖励
          <br/>· 好友通过您的邀请码/链接注册，将建立邀请绑定关系
          <br/>· 无奖励资格时推荐人为普通消费者的绑定会自动转给分享伙伴
        </p>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-block" @click="confirmShareJoin">确认参与</button>
          <button class="btn btn-outline btn-block" @click="showConfirmModal = false">返回重选</button>
        </div>
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

    <!-- 商品分享弹层（与邀请码分享相互独立） -->
    <SharePanel
      v-if="shareOpen"
      title="分享课程"
      :link="shareLink"
      :poster-title="course.title"
      :poster-sub="course.subtitle || '在线学书法 · 平价好课 · 天天练字'"
      :poster-price="'¥' + fmtMoney(course.price)"
      poster-tip="长按识别二维码 · 查看课程"
      action-text="好课推荐，和好友一起进步"
      :cover="covers[0] || ''"
      @close="shareOpen = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import { requestWxPay, waitOrderPaid } from '../pay'
import { useUserStore } from '../store'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'
import PayCodeModal from '../components/PayCodeModal.vue'
import WysiwygEditor from '../components/WysiwygEditor.vue'
import SharePanel from '../components/SharePanel.vue'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const course = ref(null)
const showIdentityModal = ref(false)
const showConfirmModal = ref(false) // 选择分享有奖后的二次确认弹窗
const needRebind = ref(false)
const buyJoin = ref('none')
const newReferrerId = ref('')
const review = ref({ count: 0, avg: 0, list: [], canReview: false, mine: null })
const showReviewModal = ref(false)
const rating = ref(5)
const reviewText = ref('')
const payModal = ref({ show: false, receiveInfo: {}, orderNo: '', pay: 0 })
const buying = ref(false) // 防重复下单
const groupTiers = ref([])
const bargainTiers = ref([])
const bargainStep = ref(0)
const chapters = ref([])
const faq = ref([])
const openFaq = ref(-1)
function toggleFaq(i) { openFaq.value = openFaq.value === i ? -1 : i }

// 课程分享（与邀请码分享相互独立）：链接携带课程 id，参数由后端按 /course/:id 解析
const shareOpen = ref(false)
const shareLink = computed(() => course.value ? location.origin + '/course/' + course.value.id : '')
function openShare() { shareOpen.value = true }

// ---------- 封面轮播 ----------
const covers = ref([])
const cur = ref(0)
let swTimer = null
function parseCovers(cover) {
  if (!cover) return []
  try {
    const arr = JSON.parse(cover)
    if (Array.isArray(arr)) return arr.filter(Boolean)
  } catch (e) { /* 非 JSON，按逗号拆分 */ }
  return String(cover).split(',').map(s => s.trim()).filter(Boolean)
}
function onImgError(i) {
  covers.value.splice(i, 1)
  if (cur.value >= covers.value.length) cur.value = 0
}
function go(d) {
  const n = covers.value.length
  cur.value = (cur.value + d + n) % n
}
function startAuto() {
  if (swTimer) clearInterval(swTimer)
  if (covers.value.length > 1) {
    swTimer = setInterval(() => go(1), 6000)
  }
}
onBeforeUnmount(() => { if (swTimer) clearInterval(swTimer) })

onMounted(async () => {
  try {
    course.value = (await api.get('/courses/' + route.params.id)).data;
    faq.value = Array.isArray(course.value.faq) ? course.value.faq : []
    covers.value = parseCovers(course.value.cover)
    // 优先使用课程自己的营销配置
    const gt = course.value.group_tiers || []
    if (gt.length) groupTiers.value = gt.map(t => ({ n: t.count || t.n, price: t.price, services: t.services, gift: t.gift }))
    const bc = course.value.bargain_config || {}
    if (bc.mode === 'tiers' && bc.tiers) {
      bargainTiers.value = bc.tiers.map(t => ({ n: t.helps || t.n, price: t.price, services: t.services, gift: t.gift }))
    } else if (bc.mode === 'step') {
      bargainStep.value = bc.step || 0
    }
    startAuto()
    // 课程列表页「立即报名」跳转进来（?buy=1）：自动唤起下单弹窗，业务逻辑复用 openBuy
    if (route.query.buy === '1') openBuy()
  } catch (e) { alert(e.message); router.back() }
  try { const ch = (await api.get('/course/' + route.params.id + '/chapters')).data; chapters.value = ch.chapters || [] } catch (e) {}
  try { review.value = (await api.get('/course/' + route.params.id + '/reviews')).data } catch (e) {}
  try {
    const m = (await api.get('/public/marketing')).data
    if (!groupTiers.value.length) groupTiers.value = m.groupTiers || []
    if (!bargainTiers.value.length && !bargainStep.value) {
      bargainTiers.value = m.bargainTiers || []
      bargainStep.value = m.bargainStepReduce || 0
    }
  } catch (e) {}
})

function openReviewModal() { rating.value = 5; reviewText.value = ''; showReviewModal.value = true }

async function submitReview() {
  try {
    const r = await api.post('/course/' + course.value.id + '/review', { rating: rating.value, content: reviewText.value })
    alert(r.msg)
    showReviewModal.value = false
    review.value = (await api.get('/course/' + route.params.id + '/reviews')).data
  } catch (e) { alert(e.message) }
}

// 是否分享课程(≥499且为课程类型)：触发身份选择
function isFissionCourse() {
  return course.value && course.value.type === 'course' && Number(course.value.price) >= 499
}

async function openBuy() {
  if (!store.token) { router.push('/login'); return }
  if (isFissionCourse()) {
    showIdentityModal.value = true
    needRebind.value = false
    // 默认"暂不参与"（普通消费者），降低下单门槛；"分享有奖"作为小字选项
    buyJoin.value = 'none'
    newReferrerId.value = ''
  } else {
    await doBuy({})
  }
}

function closeModal() {
  showIdentityModal.value = false
  needRebind.value = false
}

async function confirmBuy() {
  // 步骤1：选择参与方式后，先弹二次确认（PRD：防误触），确认后再下单
  if (buyJoin.value === 'share') {
    showConfirmModal.value = true
    return
  }
  // 放弃本单分享奖励（普通消费者）：直接下单
  await doBuy({ joinFission: false, forgoShareReward: 1, newReferrerId: null })
  showIdentityModal.value = false
  needRebind.value = false
}

// 步骤2：二次确认弹窗的「确认参与」（含 needRebind 转绑场景）
async function confirmShareJoin() {
  showConfirmModal.value = false
  await doBuy({
    joinFission: true,
    forgoShareReward: 0,
    newReferrerId: newReferrerId.value || null,
  })
  showIdentityModal.value = false
  needRebind.value = false
}

async function doBuy(payload) {
  if (buying.value) return
  buying.value = true
  try {
    const r = await api.post('/order', { productType: course.value.level, couponUsed: 0, courseId: course.value.id, ...payload })
    // 线下确认收款模式：弹出收款码，等待管理员确认到账后开通
    if (r.data.payMode === 'manual') {
      payModal.value = { show: true, receiveInfo: r.data.receiveInfo || {}, orderNo: r.data.order.order_no, pay: r.data.pay }
      return
    }
    // 真实微信支付模式：后端返回 payParams，前端调起支付
    if (r.data.payParams) {
      await doWxPay(r.data.payParams, r.data.order.order_no)
      return
    }
    // 模拟支付模式：下单即成功
    let msg = '购买成功！'
    const fs = r.data.fissionStatus
    if (fs) msg += '\n' + fs.msg
    if (r.data.directCommission && r.data.directCommission.amount) msg += '\n推荐人获得分享奖励 ¥' + r.data.directCommission.amount
    store.fetchMe()
    if (await dialog.confirm(msg + '\n\n点击「确定」进入学习中心，点击「取消」留在本页')) router.push('/my-courses')
  } catch (e) {
    // 触发转绑定提示（须走分享有奖流程才能转绑）
    if (e.needRebind) {
      needRebind.value = true
      buyJoin.value = 'share'
      showIdentityModal.value = true
      return
    }
    alert(e.message)
  } finally {
    buying.value = false
  }
}

// 真实微信支付：调起支付 → 轮询订单状态 → 引导跳转
async function doWxPay(payParams, orderNo) {
  try {
    await requestWxPay(payParams, orderNo)
    alert('支付成功！正在确认到账...')
    const order = await waitOrderPaid(orderNo)
    store.fetchMe()
    if (order) {
      const msg = '购买成功！\n\n点击「确定」进入学习中心，点击「取消」留在本页'
      if (await dialog.confirm(msg)) router.push('/my-courses')
    } else {
      alert('支付已提交，到账确认中，请稍后在「我的课程」查看')
      router.push('/mine')
    }
  } catch (e) {
    if (/取消/.test(e.message)) {
      alert('已取消支付，订单保留，可稍后重新购买')
    } else {
      alert(e.message)
    }
  }
}
async function startBargain() {
  if (!store.token) { router.push('/login'); return }
  // 分享推广身份（promoter）用户发起砍价：需确认放弃本单全部分享奖励
  if (store.user && store.user.identity === 'promoter') {
    if (!(await dialog.confirm('您当前是分享推广身份，参与砍价优惠，本订单将放弃全部分享奖励，不会产生推广收益，也不会更新您的分享推广身份，确认继续下单？'))) return
  }
  try {
    const r = await api.post('/bargain/start', { courseId: course.value.id })
    alert(r.msg); router.push('/bargain/' + r.data.id)
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
/* ---------- 封面轮播 ---------- */
.cd-swiper {
  position: relative;
  height: 220px;
  border-radius: 14px;
  overflow: hidden;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #f3e6d4, #f9f0e2);
}
.cd-track {
  display: flex;
  height: 100%;
  transition: transform .45s cubic-bezier(.25, .8, .3, 1);
}
.cd-slide { flex-shrink: 0; width: 100%; height: 100%; }
.cd-slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-arrow {
  position: absolute; top: 50%;
  transform: translateY(-50%);
  width: 34px; height: 34px;
  border: none; border-radius: 50%;
  background: rgba(43, 33, 24, .42);
  color: #fff; font-size: 22px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  padding-bottom: 3px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  cursor: pointer;
  transition: background .2s, transform .2s;
}
.cd-arrow:active { transform: translateY(-50%) scale(.9); }
.cd-arrow-l { left: 10px; }
.cd-arrow-r { right: 10px; }
.cd-dots {
  position: absolute; left: 0; right: 0; bottom: 8px;
  display: flex; justify-content: center; gap: 6px;
}
.cd-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .55);
  cursor: pointer;
  transition: all .25s;
}
.cd-dot.on { width: 18px; border-radius: 4px; background: #fff; }
.dh-char { font-size: 60px; }
.tier-benefit {
  margin-top: 6px;
  padding: 8px 10px;
  background: #fdf9f0;
  border: 1px dashed #e0c9a8;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.7;
  color: #6b5e4f;
}
.tier-benefit div { margin-bottom: 2px; }

/* ---------- 底部操作栏按钮 ---------- */
.btn-buy-main {
  background: var(--color-cinnabar);
  min-height: 44px;
  box-shadow: 0 4px 12px rgba(200, 36, 35, .28);
}
.btn-buy-main:hover { box-shadow: 0 6px 16px rgba(200, 36, 35, .38); }
.btn-buy-sub {
  min-height: 44px;
  box-shadow: none;
}
</style>
