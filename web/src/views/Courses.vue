<template>
  <div class="page">
    <div class="courses-hero">
      <div>
        <h1 style="margin:0;">爱心分享</h1>
        <p style="font-size:13px;opacity:.85;margin-top:4px;">精选好课 · 名师教学 · 天天进步</p>
      </div>
      <div class="hero-brush">🖌️</div>
    </div>

    <div class="cat-tabs">
      <button class="cat-tab" :class="{ active: curCat === 'all' }" @click="setCat('all')">全部</button>
      <button class="cat-tab" v-for="c in categories" :key="c.id" :class="{ active: curCat === c.id }" @click="setCat(c.id)">
        {{ c.icon }} {{ c.name }}
      </button>
    </div>

    <div class="courses-list">
      <div class="course-card" v-for="c in courses" :key="c.id" @click="$router.push('/course/' + c.id)">
        <div class="card-cover">
          <img v-if="coverOf(c)" :src="coverOf(c)" alt="" @error="c.cover = ''" />
          <div v-else class="cover-fallback" :class="'t' + (c.id % 5)">
            <span>{{ typeIco(c) }}</span>
          </div>
        </div>
        <div class="card-body">
          <div class="card-title-row">
            <span class="card-title">{{ c.title }}</span>
            <span class="tag tag-group" v-if="c.is_group">拼团</span>
            <span class="tag tag-bargain" v-if="c.is_bargain">可砍价</span>
            <button class="card-share" @click.stop="openShare(c)">📤 分享</button>
          </div>
          <div class="card-sub" v-if="c.subtitle">{{ c.subtitle }}</div>
          <div class="card-price-row">
            <span class="price">¥{{ fmtMoney(c.price) }}</span>
            <span class="origin" v-if="c.original_price">¥{{ fmtMoney(c.original_price) }}</span>
            <span class="type-tag" :class="'tp-' + c.type">{{ typeText(c.type) }}</span>
          </div>
          <div class="card-sales" v-if="c.sales">已售 {{ c.sales }}</div>
          <div class="card-btns">
            <button class="btn-buy" @click.stop="jumpBuy(c)">立即报名</button>
            <button v-if="c.is_group" class="btn-sub" @click.stop="goGroup(c)">发起拼团</button>
            <button v-if="c.is_bargain" class="btn-sub btn-sub-bargain" @click.stop="startBargain(c)">发起砍价</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="!courses.length" class="empty" style="padding:50px 16px;">
      <span class="e-ico">📭</span>该分类暂无商品
    </p>

    <!-- 商品分享弹层（与邀请码分享相互独立） -->
    <SharePanel
      v-if="shareCourse"
      title="分享课程"
      :link="shareLink(shareCourse)"
      :poster-title="shareCourse.title"
      :poster-sub="shareCourse.subtitle || '在线学书法 · 平价好课 · 天天练字'"
      :poster-price="'¥' + fmtMoney(shareCourse.price)"
      poster-tip="长按识别二维码 · 查看课程"
      action-text="好课推荐，和好友一起进步"
      :cover="coverOf(shareCourse)"
      @close="shareCourse = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'
import SharePanel from '../components/SharePanel.vue'
const courses = ref([])
const categories = ref([])
const shareCourse = ref(null)
const curCat = ref('all')
const store = useUserStore()
const router = useRouter()

const typeText = (t) => ({ course: '课程', goods: '实物', activity: '活动' }[t] || '课程')
const typeIco = (c) => (c.cover ? '🖼️' : (c.type === 'goods' ? '🛍️' : c.type === 'activity' ? '🏕️' : '📚'))
function coverOf(c) {
  if (c.cover) return c.cover
  try { const arr = JSON.parse(c.images || '[]'); return arr[0] || '' } catch (e) { return '' }
}

// 课程分享：链接携带课程 id，与邀请码分享相互独立；参数由后端按 /course/:id 解析
function shareLink(c) { return location.origin + '/course/' + c.id }
function openShare(c) { shareCourse.value = c }

onMounted(async () => {
  try { categories.value = (await api.get('/categories')).data } catch (e) {}
  load()
})
async function load() {
  try { courses.value = (await api.get('/courses', { params: { category: curCat.value } })).data } catch (e) {}
}
function setCat(id) { curCat.value = id; load() }

// 立即报名：跳转详情页并自动唤起下单弹窗（下单业务逻辑在详情页完全复用，前端零改动）
function jumpBuy(c) {
  router.push('/course/' + c.id + '?buy=1')
}

// 发起拼团：跳转拼团页（promoter 身份确认弹窗由拼团页内部处理）
function goGroup(c) {
  router.push('/group?courseId=' + c.id)
}

// 发起砍价：与详情页一致，先创建砍价活动再跳转（promoter 身份确认弹窗逻辑同步）
async function startBargain(c) {
  if (!store.token) { router.push('/login'); return }
  // 分享推广身份（promoter）用户发起砍价：需确认放弃本单全部分享奖励
  if (store.user && store.user.identity === 'promoter') {
    if (!(await dialog.confirm('您当前是分享推广身份，参与砍价优惠，本订单将放弃全部分享奖励，不会产生推广收益，也不会更新您的分享推广身份，确认继续下单？'))) return
  }
  try {
    const r = await api.post('/bargain/start', { courseId: c.id })
    alert(r.msg); router.push('/bargain/' + r.data.id)
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.courses-hero {
  position: relative;
  overflow: hidden;
  display: flex; justify-content: space-between; align-items: center;
  background: var(--grad);
  color: #fff;
  border-radius: 18px;
  padding: 20px;
  margin-bottom: 14px;
  box-shadow: 0 10px 26px rgba(138, 74, 30, .28);
}
.hero-brush { font-size: 44px; opacity: .85; filter: grayscale(.2); }

.courses-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- 单列大卡片：移动端纵向（封面在上横图，信息在下） ---------- */
.course-card {
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform .18s, box-shadow .2s;
  animation: cardIn .35s ease both;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
.course-card:active { transform: scale(.98); }
.course-card:hover { box-shadow: var(--shadow-md); }

.card-cover {
  position: relative;
  aspect-ratio: 16 / 9; /* 横向宽图 */
  background: linear-gradient(135deg, #f3e6d4, #f9f0e2);
}
.card-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 52px;
}
.cover-fallback.t0 { background: linear-gradient(135deg, #f3e6d4, #f0dcc0); }
.cover-fallback.t1 { background: linear-gradient(135deg, #e8e3f0, #d8cfe8); }
.cover-fallback.t2 { background: linear-gradient(135deg, #e3f0e4, #cfe3d2); }
.cover-fallback.t3 { background: linear-gradient(135deg, #fdeed7, #f7dda8); }
.cover-fallback.t4 { background: linear-gradient(135deg, #fde8e3, #f5d0c6); }

.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 16px;
}
.card-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.card-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tag {
  flex: none;
  font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 6px;
}
.tag-group { background: rgba(21, 101, 192, .1); color: #1565c0; border: 1px solid rgba(21, 101, 192, .3); }
.tag-bargain { background: rgba(245, 124, 0, .1); color: #f57c00; border: 1px solid rgba(245, 124, 0, .32); }
.card-share {
  flex: none;
  margin-left: auto;
  font-size: 12px;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
  transition: transform .15s, color .2s;
}
.card-share:hover { color: var(--brand); border-color: var(--brand); }
.card-share:active { transform: scale(.95); }

.card-sub {
  font-size: 13px; color: var(--muted);
  margin-top: 6px; line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-price-row {
  display: flex; align-items: baseline; gap: 8px;
  margin-top: 12px;
}
.price {
  font-size: 20px; font-weight: 700;
  color: var(--color-cinnabar);
}
.origin { font-size: 12px; color: #b3a896; text-decoration: line-through; }
.type-tag {
  margin-left: auto;
  font-size: 11px; padding: 2px 9px; border-radius: 5px;
  background: #f5efe4; color: var(--brand);
}
.type-tag.tp-goods { background: #e8e3f0; color: #5e35b1; }
.type-tag.tp-activity { background: #fdeed7; color: #c98f1b; }
.card-sales { font-size: 12px; color: #b3a896; margin-top: 6px; }

/* ---------- 操作按钮组：主按钮权重最高，营销按钮弱化，全部横向排布 ---------- */
.card-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  margin-top: auto;      /* 按钮统一收拢在卡片最底部 */
  padding-top: 16px;
}
.btn-buy {
  flex: 1 1 100%;        /* 手机端：立即报名独占第一行 */
  min-height: 46px;
  border: none;
  border-radius: 10px;
  background: var(--color-cinnabar);
  color: #fff;
  font-size: 15px;
  font-weight: 700;      /* 主按钮加粗 */
  cursor: pointer;
  transition: transform .15s, box-shadow .2s, opacity .2s;
  box-shadow: 0 4px 12px rgba(200, 36, 35, .28);
}
.btn-buy:hover { box-shadow: 0 6px 16px rgba(200, 36, 35, .38); transform: translateY(-1px); }
.btn-buy:active { transform: scale(.97); }
.btn-sub {
  flex: 1 1 calc(50% - 6px); /* 手机端：拼团/砍价换行到下一行并排 */
  min-height: 40px;
  padding: 0 8px;
  border: 1px solid var(--brand);
  border-radius: 10px;
  background: #fff;
  color: var(--brand);
  font-size: 13px;       /* 字号略小，视觉弱化 */
  font-weight: 500;
  cursor: pointer;
  transition: transform .15s, background .2s;
}
.btn-sub:hover { background: var(--brand-soft); }
.btn-sub:active { transform: scale(.97); }
.btn-sub-bargain { border-color: #f57c00; color: #f57c00; }
.btn-sub-bargain:hover { background: #fdf0e2; }

/* ---------- PC 宽屏：封面通栏顶部大图 + 底部三按钮同一行平铺 ---------- */
@media (min-width: 768px) {
  .card-body { padding: 20px 26px; }
  .card-title { font-size: 19px; }
  .card-sub { font-size: 14px; }
  .card-price-row { margin-top: 16px; }
  .price { font-size: 24px; }
  .card-btns { flex-wrap: nowrap; }   /* 三个按钮平铺同一行 */
  .btn-buy { flex: 2 1 auto; min-height: 46px; font-size: 16px; }  /* 主按钮宽度占比最大 */
  .btn-sub { flex: 1 1 auto; min-height: 44px; font-size: 14px; padding: 0 20px; }
}
</style>
