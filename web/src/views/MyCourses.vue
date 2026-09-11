<template>
  <div class="page">
    <h1>我的课程</h1>

    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>

    <div v-for="mc in list" :key="mcKey(mc)" class="card">
      <div style="display:flex;gap:12px;align-items:center;">
        <div class="course-thumb">{{ mc.course?.cover ? '🖼️' : '📚' }}</div>
        <div style="flex:1;">
          <p><b>{{ mc.course?.title || mc.product_type + ' 课程包' }}</b>
            <span class="tag" style="margin-left:6px;">{{ mc.product_type }}</span>
          </p>
          <p class="muted">{{ mc.course?.subtitle || (mc.course?.validity === 'lifetime' ? '终身学习权益' : '一年学习权益') }}</p>
          <p class="muted">购买于 {{ mc.bought_at }}｜共 {{ mc.order_count }} 单</p>
        </div>
      </div>

      <!-- 章节学习进度 -->
      <div v-if="chData(cid(mc)) && chData(cid(mc)).total" class="mt">
        <div class="progress-bar" style="margin:6px 0;">
          <div class="progress-fill" :style="{ width: progressPct(cid(mc)) + '%' }"></div>
        </div>
        <p class="muted" style="text-align:center;font-size:13px;">
          已完成 {{ chData(cid(mc)).doneCount }}/{{ chData(cid(mc)).total }} 章
          <span v-if="progressPct(cid(mc)) === 100" style="color:#2e7d32;">🎉 全部完成，太棒了</span>
        </p>
      </div>

      <button class="btn btn-outline btn-block mt" @click="toggle(mc)">
        {{ openKey === mcKey(mc) ? '收起学习内容 ▲' : '进入学习 ▼' }}
      </button>

      <div v-if="openKey === mcKey(mc)" class="mt" style="border-top:1px dashed #ddd;padding-top:10px;">
        <!-- 章节式学习 -->
        <template v-if="chData(cid(mc)) && chData(cid(mc)).chapters.length">
          <div v-for="(ch, i) in chData(cid(mc)).chapters" :key="ch.id"
            style="border:1px solid #eee;border-radius:8px;margin-bottom:8px;overflow:hidden;">
            <div style="display:flex;align-items:center;gap:8px;padding:10px;cursor:pointer;"
              :style="openChapter === ch.id ? 'background:#f7f3ea;' : 'background:#fff;'"
              @click="openChapter = openChapter === ch.id ? null : ch.id">
              <span style="font-size:16px;" :style="ch.done ? 'color:#2e7d32;' : 'color:#c9c2b8;'">{{ ch.done ? '✅' : '◻️' }}</span>
              <span style="flex:1;"><b>{{ i + 1 }}. {{ ch.title }}</b></span>
              <span class="muted" v-if="ch.duration">{{ ch.duration }}</span>
              <span class="muted">{{ openChapter === ch.id ? '▲' : '▼' }}</span>
            </div>
            <div v-if="openChapter === ch.id" style="padding:10px;border-top:1px solid #eee;background:#fbfaf7;">
              <div class="rich-content" style="line-height:1.9;" v-html="ch.content || mc.course?.content || '<p>章节内容整理中，敬请期待</p>'"></div>
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn" style="flex:1;" v-if="!ch.done" @click="setDone(mc, ch, true)">✅ 标记本章完成</button>
                <button class="btn btn-outline" style="flex:1;" v-else @click="setDone(mc, ch, false)">↩️ 标记未完成</button>
              </div>
            </div>
          </div>
        </template>
        <!-- 无章节兜底：展示课程详情 -->
        <template v-else>
          <div class="rich-content" style="line-height:1.9;" v-html="mc.course?.content || '<p>课程内容整理中，敬请期待</p>'"></div>
        </template>

        <div style="text-align:right;margin-top:10px;">
          <button v-if="!myReview[mcKey(mc)]" class="btn" @click="openReview(mc)">✍️ 写评价</button>
          <p v-else class="muted">✅ 已评价（{{ myReview[mcKey(mc)].rating }}星）</p>
        </div>
      </div>
    </div>

    <div class="card" v-if="!list.length">
      <p class="muted" style="text-align:center;">还没有购买课程，快去选购吧</p>
      <button class="btn btn-block mt" @click="$router.push('/courses')">去选课 ›</button>
    </div>

    <!-- 写评价弹层 -->
    <div class="modal-mask" v-if="showReview">
      <div class="modal">
        <h2 style="margin-bottom:6px;">评价课程</h2>
        <p class="muted">{{ reviewCourse?.course?.title || reviewCourse?.product_type + ' 课程' }}</p>
        <div class="stars" style="margin:10px 0;">
          <span v-for="s in 5" :key="s" class="star" :class="{ on: s <= rating }" @click="rating = s">{{ s <= rating ? '★' : '☆' }}</span>
        </div>
        <label class="label">评价内容</label>
        <WysiwygEditor v-model="reviewText" :min-height="'110px'" placeholder="说说你的学习体验吧（选填），支持加粗、图片等富文本" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-block" @click="submitReview">提交评价</button>
          <button class="btn btn-outline btn-block" @click="showReview = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { toast } from '../utils/toast'
import WysiwygEditor from '../components/WysiwygEditor.vue'

const store = useUserStore()
const router = useRouter()
const list = ref([])
const openKey = ref(null)
const openChapter = ref(null)
const chapterData = reactive({}) // course_id -> {total, doneCount, chapters}
const showReview = ref(false)
const reviewCourse = ref(null)
const rating = ref(5)
const reviewText = ref('')
const myReview = reactive({}) // product_type -> {rating}
const pendingOrders = ref([])

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  try {
    const orders = (await api.get('/order/my')).data || []
    pendingOrders.value = orders.filter(o => o.status === 'pending')
  } catch (e) {}
  try {
    list.value = (await api.get('/user/my-courses')).data
    // 预取每个档位课程的我的评价状态
    for (const mc of list.value) {
      if (!mc.course) continue
      try {
        const d = (await api.get('/course/' + mc.course.id + '/reviews')).data
        if (d.mine) myReview[mcKey(mc)] = d.mine
      } catch (e) {}
    }
  } catch (e) { alert(e.message) }
})

// 分组键：优先课程ID（新订单），老订单按价格档位
function mcKey(mc) { return mc.course_id ? 'c' + mc.course_id : 'p' + mc.product_type }
function cid(mc) { return mc.course ? mc.course.id : null }
function chData(id) { return id ? chapterData[id] : null }
function progressPct(id) {
  const d = chapterData[id]
  if (!d || !d.total) return 0
  return Math.min(100, Math.round(d.doneCount / d.total * 100))
}

async function toggle(mc) {
  const k = mcKey(mc)
  openKey.value = openKey.value === k ? null : k
  if (openKey.value === k && mc.course && !chapterData[mc.course.id]) {
    await loadChapters(mc)
  }
}

async function loadChapters(mc) {
  try {
    const d = (await api.get('/course/' + mc.course.id + '/chapters')).data
    chapterData[mc.course.id] = { total: d.total, doneCount: d.doneCount, chapters: d.chapters || [] }
  } catch (e) {
    chapterData[mc.course.id] = { total: 0, doneCount: 0, chapters: [] }
  }
}

async function setDone(mc, ch, done) {
  try {
    const r = await api.post('/course/' + mc.course.id + '/chapters/' + ch.id + '/done', { done })
    ch.done = done
    const d = chapterData[mc.course.id]
    if (d) d.doneCount = r.doneCount
    if (mc.course) mc.course.chapterDone = r.doneCount
    // 课堂签到：标记章节完成后自动打卡
    if (done && sessionStorage.getItem('pendingCheckin') === 'class') {
      try {
        const ck = await api.post('/task/checkin-by-action', { taskType: 'class' })
        toast(ck.msg)
      } catch (e) { toast(e.message, 'error') }
      sessionStorage.removeItem('pendingCheckin')
    }
  } catch (e) { alert(e.message) }
}

function openReview(mc) {
  reviewCourse.value = mc
  rating.value = 5
  reviewText.value = ''
  showReview.value = true
}

async function submitReview() {
  if (!reviewCourse.value?.course?.id) { alert('该课程暂不支持评价'); return }
  try {
    const r = await api.post('/course/' + reviewCourse.value.course.id + '/review', { rating: rating.value, content: reviewText.value })
    alert(r.msg)
    myReview[mcKey(reviewCourse.value)] = { rating: rating.value }
    showReview.value = false
  } catch (e) { alert(e.message) }
}
</script>
