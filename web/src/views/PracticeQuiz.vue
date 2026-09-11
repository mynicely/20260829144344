<template>
  <div class="page" v-if="questions.length">
    <!-- 顶栏 -->
    <div class="card" style="padding:12px 14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn btn-ghost btn-sm" @click="confirmLeave">退出</button>
        <div style="flex:1;text-align:center;font-weight:600;">{{ title }}</div>
        <div class="countdown">⏱ {{ fmtUse() }}</div>
      </div>
      <div class="progress-bar" style="height:8px;margin:10px 0 0;">
        <div class="progress-fill brand" :style="{ width: (cur + 1) / questions.length * 100 + '%' }"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--muted);">
        <span>第 {{ cur + 1 }} / {{ questions.length }} 题</span>
        <span>已答 {{ answeredCount }} 题</span>
      </div>
    </div>

    <!-- 题目 -->
    <div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span class="quiz-tag" :class="q.type">{{ typeText(q.type) }}</span>
        <span class="chip chip-line">{{ q.type === 'multi' ? '可多选' : '单选' }}</span>
      </div>
      <div style="font-size:16px;font-weight:600;line-height:1.7;margin-bottom:14px;">{{ cur + 1 }}. <span class="rich-content" v-html="q.question"></span></div>
      <div v-for="o in q.options" :key="o.k" class="quiz-option"
        :class="{ selected: isSelected(o) }"
        @click="toggle(o)">
        <span class="key">{{ o.k }}</span>
        <span>{{ o.t }}</span>
      </div>

      <div class="divider"></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" style="flex:1;" @click="prev" :disabled="cur === 0">上一题</button>
        <button v-if="cur < questions.length - 1" class="btn btn-primary" style="flex:2;" @click="next">下一题</button>
        <button v-else class="btn btn-gold" style="flex:2;" @click="submit">交 卷</button>
      </div>
    </div>

    <!-- 答题卡 -->
    <div class="card">
      <h2>答题卡</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <button v-for="(_, i) in questions" :key="i" class="card-chip"
          :class="{ on: hasAnswer(i), cur: i === cur }"
          @click="cur = i">{{ i + 1 }}</button>
      </div>
      <button class="btn btn-gold btn-block mt" @click="submit">提交试卷</button>
    </div>
  </div>

  <!-- 加载中 -->
  <div class="page" v-else>
    <div class="card" style="text-align:center;padding:40px 16px;">
      <div style="font-size:40px;margin-bottom:10px;">✍️</div>
      <p class="muted">正在抽取题目...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const questions = ref([])
const cur = ref(0)
const answers = ref({}) // questionId -> answer
const title = ref(route.query.title || '在线练习')
const courseId = Number(route.query.courseId) || 0
const usedSec = ref(0)
let timer = null

const q = computed(() => questions.value[cur.value])
const answeredCount = computed(() => Object.keys(answers.value).length)

const typeText = (t) => ({ single: '单选题', multi: '多选题', judge: '判断题' }[t] || '选择题')

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  timer = setInterval(() => { usedSec.value += 1 }, 1000)
  // 错题重练：本地题目直达
  if (route.query.local === '1') {
    try {
      const qs = JSON.parse(sessionStorage.getItem('practiceQuestions') || '[]')
      if (qs.length) { questions.value = qs; return }
    } catch (e) { /* 数据异常则走正常抽题 */ }
  }
  try {
    const d = (await api.get('/practice/start', { params: { courseId, count: 10 } })).data
    questions.value = d.questions
    if (!d.questions.length) { toast('暂无题目', 'warn'); router.replace('/practice') }
  } catch (e) { toast(e.message, 'error'); router.replace('/practice') }
})
onUnmounted(() => clearInterval(timer))

function fmtUse() {
  const s = usedSec.value
  return (s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + (s % 60 ? s % 60 + 's' : ''))
}
function isSelected(o) {
  const a = answers.value[q.value.id]
  if (!a) return false
  if (q.value.type === 'multi') return a.split(',').includes(o.k)
  return a === o.k
}
function toggle(o) {
  const id = q.value.id
  if (q.value.type === 'multi') {
    const arr = (answers.value[id] || '').split(',').filter(Boolean)
    const i = arr.indexOf(o.k)
    if (i >= 0) arr.splice(i, 1); else arr.push(o.k)
    answers.value[id] = arr.join(',')
  } else {
    answers.value[id] = o.k
  }
  // 单选自动跳到下一题
  if (q.value.type !== 'multi' && cur.value < questions.value.length - 1) {
    setTimeout(() => { cur.value += 1 }, 160)
  }
}
function hasAnswer(i) { return !!answers.value[questions.value[i].id] }
function prev() { if (cur.value > 0) cur.value -= 1 }
function next() { if (cur.value < questions.value.length - 1) cur.value += 1 }

async function submit() {
  const total = questions.value.length
  const done = answeredCount.value
  if (done < total) {
    if (!(await dialog.confirm(`还有 ${total - done} 题未作答，确定要交卷吗？`))) return
  }
  const payload = {
    courseId,
    courseTitle: title.value,
    duration: usedSec.value,
    answers: Object.keys(answers.value).map(id => ({ questionId: Number(id), answer: answers.value[id] })),
  }
  try {
    const r = await api.post('/practice/submit', payload)
    sessionStorage.setItem('practiceResult', JSON.stringify({ ...r.data, title: title.value }))
    router.replace('/practice/result')
  } catch (e) { toast(e.message, 'error') }
}
async function confirmLeave() {
  if (answeredCount.value && !(await dialog.confirm('退出后将丢失本次作答，确定退出？'))) return
  router.replace('/practice')
}
</script>

<style scoped>
.card-chip {
  width: 36px; height: 36px; border-radius: 10px;
  border: 1.5px solid var(--line); background: #fff;
  font-size: 14px; color: var(--muted); transition: all .2s;
}
.card-chip.on { background: var(--brand); border-color: var(--brand); color: #fff; font-weight: 700; }
.card-chip.cur { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(212,160,23,.35); }
</style>
