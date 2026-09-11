<template>
  <div class="page" v-if="result">
    <!-- 成绩总览 -->
    <div class="hero-card" style="text-align:center;">
      <div style="font-size:13px;opacity:.85;">练习完成 · {{ result.title }}</div>
      <div style="font-size:64px;font-weight:800;line-height:1.3;">{{ result.score }}</div>
      <div style="font-size:12px;opacity:.85;">正确 {{ result.correct }}/{{ result.total }} 题</div>
      <div style="margin-top:10px;">
        <span v-if="result.score >= 90" style="font-size:14px;background:rgba(255,255,255,.16);padding:6px 14px;border-radius:20px;">🏆 优秀！书法大师就是你</span>
        <span v-else-if="result.score >= 60" style="font-size:14px;background:rgba(255,255,255,.16);padding:6px 14px;border-radius:20px;">👍 不错，继续加油！</span>
        <span v-else style="font-size:14px;background:rgba(255,255,255,.16);padding:6px 14px;border-radius:20px;">💪 温故而知新，再练一次</span>
      </div>
    </div>

    <!-- 操作 -->
    <div class="card">
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" style="flex:1;" @click="$router.replace('/practice')">返回练习中心</button>
        <button class="btn btn-primary" style="flex:1;" @click="retry">再练一次</button>
        <router-link to="/practice/wrong" class="btn btn-outline" style="flex:1;display:inline-flex;">📕 错题本</router-link>
      </div>
    </div>

    <!-- 逐题解析 -->
    <div class="card" v-for="(d, i) in result.detail" :key="d.id">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span class="quiz-tag" :class="d.type">{{ typeText(d.type) }}</span>
        <span class="tag" :class="d.correct ? 'tag-green' : 'tag-gray'" style="background:#d3362b;color:#fff;" v-if="!d.correct">答错</span>
        <span class="tag tag-green" v-else>答对</span>
      </div>
      <p style="font-weight:600;line-height:1.7;">{{ i + 1 }}. <span class="rich-content" v-html="d.question"></span></p>
      <div v-for="o in d.options" :key="o.k" class="quiz-option disabled" :class="optClass(d, o)">
        <span class="key">{{ o.k }}</span>
        <span>{{ o.t }}</span>
      </div>
      <div class="analysis-box">
        <div v-if="!d.correct"><b>你的答案：</b>{{ fmtAnswer(d.userAnswer) }}　<b>正确答案：</b>{{ fmtAnswer(d.rightAnswer) }}</div>
        <div v-else><b>你的答案：</b>{{ fmtAnswer(d.userAnswer) }} ✓</div>
        <div v-if="d.analysis" style="margin-top:4px;"><b>解析：</b><span class="rich-content" v-html="d.analysis"></span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { toast } from '../utils/toast'

const router = useRouter()
const result = ref(null)

const typeText = (t) => ({ single: '单选题', multi: '多选题', judge: '判断题' }[t] || '选择题')

function fmtAnswer(a) {
  if (!a) return '未作答'
  return String(a).split(',').join('、')
}
function optClass(d, o) {
  const rightSet = d.rightAnswer.split(',')
  const userSet = String(d.userAnswer || '').split(',').filter(Boolean)
  const isRightOpt = rightSet.includes(o.k)
  const isUserOpt = userSet.includes(o.k)
  if (isRightOpt) return 'correct'
  if (isUserOpt) return 'wrong'
  return 'disabled'
}

onMounted(async () => {
  try {
    result.value = JSON.parse(sessionStorage.getItem('practiceResult') || 'null')
  } catch (e) { result.value = null }
  if (!result.value) router.replace('/practice')

  // 课堂签到：完成一次练习后自动打卡
  if (sessionStorage.getItem('pendingCheckin') === 'class') {
    try {
      const r = await api.post('/task/checkin-by-action', { taskType: 'class' })
      toast(r.msg)
    } catch (e) { toast(e.message, 'error') }
    sessionStorage.removeItem('pendingCheckin')
  }
})

function retry() {
  const cid = result.value.course_id || 0
  router.replace('/practice/quiz?courseId=' + cid + '&title=' + encodeURIComponent(result.value.title || '在线练习'))
}
</script>
