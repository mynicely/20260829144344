<template>
  <div class="page">
    <!-- 连续打卡 Hero -->
    <div class="hero-card">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="font-size:52px;line-height:1;">🔥</div>
        <div style="flex:1;">
          <div style="font-size:13px;opacity:.85;">已连续打卡</div>
          <div style="font-size:38px;font-weight:800;line-height:1.1;">
            {{ today?.streak || 0 }}<span style="font-size:16px;font-weight:500;"> 天</span>
          </div>
          <div style="font-size:12px;opacity:.85;margin-top:2px;">本月已打卡 {{ today?.monthCount || 0 }} 天</div>
        </div>
        <div style="text-align:center;background:rgba(255,255,255,.14);border-radius:12px;padding:10px 8px;">
          <div style="font-size:24px;font-weight:800;">{{ todayCount }}/3</div>
          <div style="font-size:11px;opacity:.85;">今日任务</div>
        </div>
      </div>
    </div>

    <!-- 近 7 天打卡日历 -->
    <div class="card" v-if="weekDays.length">
      <h2>最近 7 天</h2>
      <div class="cal-grid">
        <div v-for="d in weekDays" :key="d.date" class="cal-cell" :class="{ checked: d.checked, today: d.isToday }">
          <span class="d">{{ d.date.slice(5) }}</span>
          <span>{{ d.checked ? '✓' : (d.isToday ? '今' : '·') }}</span>
        </div>
      </div>
    </div>

    <!-- 今日打卡任务 -->
    <div class="card">
      <h2>每日打卡赚抵用金</h2>
      <p class="muted" style="margin-bottom:4px;">抵用金仅可用于课程续费/升级/线下活动/学习物料抵扣，不可提现</p>
      <div class="checkin-list">
        <div v-for="t in today?.taskDefs || []" :key="t.key" class="checkin-item">
          <span style="font-size:24px;">{{ t.icon }}</span>
          <span style="flex:1;font-weight:500;">{{ t.label }}</span>
          <span v-if="today?.done[t.key]" class="checkin-done">✅ 已完成</span>
          <button v-else class="btn btn-gold btn-sm" @click="checkin(t.key)">打卡 +{{ checkinReward }}元</button>
        </div>
      </div>
      <div class="progress-bar" style="margin-top:10px;">
        <div class="progress-fill brand" :style="{ width: todayProgress + '%' }"></div>
      </div>
      <p class="muted" style="text-align:center;font-size:12px;margin-top:10px;">纯学习任务，无任何拉新推广要求 · 每日抵用金获取有上限</p>
    </div>

    <!-- 连续打卡阶梯奖励 -->
    <div class="card" v-if="bonusList.length">
      <h2>连续打卡奖励</h2>
      <p class="muted" style="margin-bottom:10px;">坚持天数越多，奖励越丰厚</p>
      <div v-for="b in bonusList" :key="b.days" class="reward-step" :class="{ done: (today?.streak || 0) >= b.days }">
        <span class="step-ico">{{ b.icon }}</span>
        <span class="step-name">{{ b.name }} · 连{{ b.days }}天</span>
        <span class="step-val" style="margin-left:auto;">+{{ b.reward }}元</span>
        <span v-if="(today?.streak || 0) >= b.days" style="color:var(--green);font-size:12px;">已达成 ✓</span>
      </div>
    </div>

    <!-- 学习任务 · 作业上传 -->
    <div class="card" id="homework-area">
      <h2>学习任务 · 作业上传</h2>
      <p class="muted" style="margin-bottom:8px;">上传作业图片/文件 + 学习留言，老师会点评。</p>
      <label class="label">任务类型</label>
      <select class="input" v-model="taskType">
        <option value="watch">看课学习</option>
        <option value="homework">提交作业</option>
        <option value="review">学情复盘</option>
        <option value="upload">作品/材料上传</option>
      </select>
      <label class="label">学习留言</label>
      <WysiwygEditor v-model="taskContent" :min-height="'120px'" :placeholder="pendingCheckin === 'review' ? '写下今天的学习心得体会，支持加粗、图片等富文本...' : '写下学习心得或作业说明，支持加粗、图片等富文本...'" />
      <label class="label">上传图片（作业/作品/心得截图）</label>
      <input class="input" type="file" accept="image/*" @change="onImage" />
      <div v-if="taskImage" class="upload-preview">
        <img :src="taskImage" />
        <button class="btn btn-outline btn-sm" @click="taskImage = ''">移除图片</button>
      </div>
      <label class="label">上传文件（选填）</label>
      <input class="input" type="file" @change="onFile" />
      <p v-if="taskFile" class="muted">已选择文件：{{ taskFile.name }}</p>
      <button class="btn btn-primary btn-block mt" @click="submitLearning">
        {{ pendingCheckin ? '提交并打卡' : '提交学习任务' }}
      </button>
      <p v-if="pendingCheckin" class="muted" style="text-align:center;margin-top:6px;">
        完成{{ pendingCheckin === 'calligraphy' ? '练字作业' : '学情复盘' }}后自动发放打卡奖励
      </p>
    </div>

    <!-- 课堂签到：选择去看课还是去做题 -->
    <div class="modal-mask" v-if="showClassChoice">
      <div class="modal">
        <h2 style="margin-bottom:6px;">课堂签到</h2>
        <p class="muted">完成一次学习动作后自动发放 +{{ checkinReward }}元 抵用金</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
          <button class="btn btn-block" @click="goClass('course')">📚 去看课</button>
          <button class="btn btn-outline btn-block" @click="goClass('practice')">📝 去做题</button>
          <button class="btn btn-ghost btn-block" @click="showClassChoice = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 我的学习记录 -->
    <div class="card">
      <h2>我的学习记录</h2>
      <div v-for="t in myTasks" :key="t.id" class="trial-item">
        <p><b>{{ typeText(t.task_type) }}</b> <span class="tag" :class="t.status === 'reviewed' ? 'tag-green' : 'tag-gray'">{{ t.status === 'reviewed' ? '已点评' : '待点评' }}</span></p>
        <p class="muted">{{ t.created_at }}｜+{{ t.reward }}抵用金</p>
        <p v-if="t.content" class="rich-content" v-html="t.content"></p>
        <img v-if="t.image" :src="t.image" class="task-img" />
        <a v-if="t.file" :href="t.file" target="_blank" style="color:var(--brand);">📎 查看上传文件</a>
        <p v-if="t.teacher_comment" style="color:var(--green);">老师点评：{{ t.teacher_comment }}</p>
      </div>
      <div v-if="!myTasks.length" class="empty"><span class="e-ico">📭</span>暂无学习记录</div>
    </div>

    <!-- 我的抵用券 -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;">我的抵用券</h2>
        <router-link to="/coupon-flows" style="color:var(--brand);font-size:13px;">明细 ›</router-link>
      </div>
      <p class="price" style="font-size:32px;">¥{{ fmtMoney(balance) }}</p>
      <p class="muted">累计赚取 ¥{{ fmtMoney(totalEarned) }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../api'
import { useUserStore } from '../store'
import { useRouter } from 'vue-router'
import { toast } from '../utils/toast'
import { fmtMoney } from '../utils/fmt'
import WysiwygEditor from '../components/WysiwygEditor.vue'

const store = useUserStore()
const router = useRouter()
const balance = ref(0)
const totalEarned = ref(0)
const today = ref(null)
const checkinReward = ref(2)
const taskType = ref('watch')
const taskContent = ref('')
const taskImage = ref('')
const taskFile = ref(null)
const myTasks = ref([])
const pendingCheckin = ref('')
const showClassChoice = ref(false)

const todayCount = computed(() => today.value ? Object.values(today.value.done).filter(Boolean).length : 0)
const todayProgress = computed(() => today.value ? Math.round(todayCount.value / 3 * 100) : 0)
const bonusList = computed(() => today.value?.bonus || [])
const weekDays = computed(() => {
  if (!today.value) return []
  const out = []
  const t = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t); d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const isToday = i === 0
    out.push({ date, isToday, checked: isToday ? todayCount.value > 0 : (today.value.days || []).includes(date) })
  }
  return out
})
const typeText = (t) => ({ watch: '看课学习', homework: '提交作业', review: '学情复盘', upload: '作品上传' }[t] || t)

function scrollToHomework() {
  const el = document.getElementById('homework-area')
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  try { checkinReward.value = Number((await api.get('/public/marketing')).data.checkinReward) || 2 } catch (e) { }
  const me = await store.fetchMe()
  if (me) { balance.value = me.couponBalance; totalEarned.value = me.totalEarned }
  load()
})
async function load() {
  try { today.value = (await api.get('/task/today')).data } catch (e) {}
  try { myTasks.value = (await api.get('/task/my-learning')).data } catch (e) {}
}
async function checkin(type) {
  if (type === 'calligraphy') {
    pendingCheckin.value = 'calligraphy'
    taskType.value = 'homework'
    toast('请上传练字作业，提交后自动打卡')
    scrollToHomework()
  } else if (type === 'review') {
    pendingCheckin.value = 'review'
    taskType.value = 'review'
    toast('请上传学习心得，提交后自动打卡')
    scrollToHomework()
  } else if (type === 'class') {
    showClassChoice.value = true
  }
}
function goClass(kind) {
  showClassChoice.value = false
  sessionStorage.setItem('pendingCheckin', 'class')
  if (kind === 'course') router.push('/my-courses')
  else router.push('/practice')
}
function onImage(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { taskImage.value = reader.result }
  reader.readAsDataURL(file)
}
function onFile(e) {
  const file = e.target.files[0]
  if (file) taskFile.value = file
}
async function uploadBase64(dataUrl, name) {
  const r = await api.post('/upload', { data: dataUrl, name })
  return r.url
}
async function submitLearning() {
  if (!store.token) { router.push('/login'); return }
  // 打卡硬性门槛：练字打卡必须上传练字作业图片，学情复盘必须写心得（与后端双重校验）
  if (pendingCheckin.value === 'calligraphy' && !taskImage.value) {
    toast('请先上传练字作业图片，上传后才能获得打卡奖励', 'error')
    scrollToHomework()
    return
  }
  if (pendingCheckin.value === 'review' && !taskContent.value.trim()) {
    toast('请先写下学习心得体会，填写后才能获得打卡奖励', 'error')
    scrollToHomework()
    return
  }
  try {
    let imageUrl = null, fileUrl = null
    if (taskImage.value) imageUrl = await uploadBase64(taskImage.value, 'task.png')
    if (taskFile.value) {
      fileUrl = await uploadBase64(await fileToBase64(taskFile.value), taskFile.value.name)
    }
    const r = await api.post('/task/learning', { taskType: taskType.value, content: taskContent.value, image: imageUrl, file: fileUrl, checkinType: pendingCheckin.value })
    toast(r.msg)
    taskContent.value = ''; taskImage.value = ''; taskFile.value = null; pendingCheckin.value = ''
    load(); up()
  } catch (e) { toast(e.message, 'error') }
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function up() { store.fetchMe().then(me => { if (me) { balance.value = me.couponBalance; totalEarned.value = me.totalEarned } }) }
</script>
