<template>
  <div class="page">
    <div class="hero-card">
      <div style="font-size:13px;opacity:.85;">每日一练 · 温故知新</div>
      <h1 style="margin:2px 0 6px;">在线练习</h1>
      <div style="font-size:12px;opacity:.85;">学完课程做练习，检验学习成果，错题自动收录错题本</div>
    </div>

    <!-- 选择课程开始练习 -->
    <div class="card">
      <h2>选择练习</h2>
      <div v-for="c in courses" :key="c.id" class="mk-item" @click="start(c)">
        <div class="mk-icon">📖</div>
        <div class="mk-info">
          <p><b>{{ c.title }}</b> <span class="chip" style="margin-left:4px;">{{ c.qcount }} 题</span></p>
          <p class="muted">{{ c.level ? '¥' + c.level + ' 课程配套练习' : '通用基础练习' }}</p>
        </div>
        <button class="btn btn-sm btn-primary">开始</button>
      </div>
      <div v-if="!courses.length" class="empty"><span class="e-ico">📚</span>暂无练习题库，敬请期待</div>
    </div>

    <!-- 我的成绩 -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;">我的成绩</h2>
        <router-link to="/practice/wrong" class="chip" style="cursor:pointer;text-decoration:none;">📕 错题本</router-link>
      </div>
      <div v-for="h in history" :key="h.id" class="trial-item">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="score-chip" :class="{ good: h.score >= 80, mid: h.score >= 60 && h.score < 80 }">{{ h.score }}</div>
          <div style="flex:1;">
            <p><b>{{ h.course_title }}</b></p>
            <p class="muted">{{ h.correct }}/{{ h.total }} 正确 ｜ 用时 {{ fmtDuration(h.duration) }} ｜ {{ h.created_at }}</p>
          </div>
        </div>
      </div>
      <div v-if="!history.length" class="empty"><span class="e-ico">📝</span>还没有练习记录，快去开始第一练吧</div>
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
const courses = ref([])
const history = ref([])

const fmtDuration = (s) => {
  s = Number(s) || 0
  if (s < 60) return s + '秒'
  return Math.floor(s / 60) + '分' + (s % 60 ? s % 60 + '秒' : '')
}

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  try { courses.value = (await api.get('/practice/courses')).data } catch (e) {}
  try { history.value = (await api.get('/practice/history')).data } catch (e) {}
})

function start(c) {
  router.push('/practice/quiz?courseId=' + c.id + '&title=' + encodeURIComponent(c.title))
}
</script>

<style scoped>
.score-chip {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 800; color: #fff; flex-shrink: 0;
  background: linear-gradient(135deg, #e57373, #d3362b);
}
.score-chip.good { background: linear-gradient(135deg, #66bb6a, #2e7d32); }
.score-chip.mid { background: linear-gradient(135deg, #ffb74d, #f57c00); }
</style>
