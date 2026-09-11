<template>
  <div class="page admin-page">
    <h1>学习任务管理</h1>
    <AdminNav />

    <div class="card">
      <h2>作业/学习记录</h2>
      <div v-for="t in tasks" :key="t.id" style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p><b>{{ t.nickname }}</b>（{{ t.phone }}）<span class="tag">{{ typeText(t.task_type) }}</span>
            <span class="tag" :style="t.status==='reviewed'?'background:#2e7d32':''">{{ t.status === 'reviewed' ? '已点评' : '待点评' }}</span>
          </p>
          <span class="muted">#{{ t.id }}</span>
        </div>
        <p class="muted">{{ t.created_at }}</p>
        <p v-if="t.content" style="margin-top:6px;">留言：<span class="rich-content" v-html="t.content"></span></p>
        <img v-if="t.image" :src="t.image" style="max-width:100%;border-radius:8px;margin:6px 0;max-height:200px;" />
        <a v-if="t.file" :href="t.file" target="_blank" style="color:#8b4513;">📎 查看文件</a>
        <label class="label" style="margin-top:8px;">老师点评</label>
        <div style="display:flex;gap:6px;">
          <input class="input" :value="t.teacher_comment" @change="comment(t.id, $event.target.value)" placeholder="填写点评" style="margin-bottom:0;" />
          <button class="btn" @click="comment(t.id, t.teacher_comment)">点评</button>
        </div>
      </div>
      <p v-if="!tasks.length" class="muted">暂无学习记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'
const tasks = ref([])
const typeText = (t) => ({ watch: '看课学习', homework: '提交作业', review: '学情复盘', upload: '作品上传' }[t] || t)
onMounted(load)
async function load() {
  try { tasks.value = (await api.get('/admin/learning-tasks')).data } catch (e) {}
}
async function comment(id, text) {
  try { await api.post('/admin/learning-tasks/' + id, { teacherComment: text }); alert('已点评'); load() } catch (e) { alert(e.message) }
}
</script>
