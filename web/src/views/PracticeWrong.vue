<template>
  <div class="page">
    <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:8px;">
      <button class="btn btn-ghost btn-sm" @click="$router.back()">← 返回</button>
      <b style="flex:1;">错题本（{{ list.length }}）</b>
      <button v-if="list.length" class="btn btn-outline btn-sm" @click="retryWrong">重做错题</button>
    </div>

    <div v-for="(w, i) in list" :key="w.id" class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="quiz-tag" :class="w.type">{{ typeText(w.type) }}</span>
        <span class="tag" style="background:#d3362b;color:#fff;">曾答错</span>
      </div>
      <p style="font-weight:600;line-height:1.7;">{{ i + 1 }}. <span class="rich-content" v-html="w.question"></span></p>
      <div v-for="o in w.options" :key="o.k" class="quiz-option disabled" :class="optClass(w, o)">
        <span class="key">{{ o.k }}</span>
        <span>{{ o.t }}</span>
      </div>
      <div class="analysis-box">
        <div><b>我的答案：</b>{{ fmtAnswer(w.my_answer) }}　<b>正确答案：</b>{{ fmtAnswer(w.answer) }}</div>
        <div v-if="w.analysis" style="margin-top:4px;"><b>解析：</b><span class="rich-content" v-html="w.analysis"></span></div>
      </div>
    </div>
    <div v-if="!list.length" class="card">
      <div class="empty"><span class="e-ico">🎉</span>太棒了，错题本空空如也！</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { toast } from '../utils/toast'

const router = useRouter()
const store = useUserStore()
const list = ref([])

const typeText = (t) => ({ single: '单选题', multi: '多选题', judge: '判断题' }[t] || '选择题')
function fmtAnswer(a) {
  if (!a) return '未作答'
  return String(a).split(',').join('、')
}
function optClass(w, o) {
  const rightSet = String(w.answer || '').split(',')
  const userSet = String(w.my_answer || '').split(',').filter(Boolean)
  const isRightOpt = rightSet.includes(o.k)
  const isUserOpt = userSet.includes(o.k)
  if (isRightOpt) return 'correct'
  if (isUserOpt) return 'wrong'
  return 'disabled'
}

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  try { list.value = (await api.get('/practice/wrong')).data } catch (e) { toast(e.message, 'error') }
})

async function retryWrong() {
  if (!list.value.length) return
  const qs = list.value.map(w => ({ id: w.id, course_id: w.course_id, type: w.type, question: w.question, options: w.options }))
  sessionStorage.setItem('practiceQuestions', JSON.stringify(qs))
  router.replace('/practice/quiz?local=1&title=' + encodeURIComponent('错题重练'))
}
</script>
