<template>
  <div class="page admin-page">
    <h1>课程评价管理</h1>
    <AdminNav />

    <div class="card">
      <table class="table">
        <tr><th>ID</th><th>课程</th><th>学员</th><th>评分</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr>
        <tr v-for="r in list" :key="r.id">
          <td>#{{ r.id }}</td>
          <td>{{ r.course_title }}</td>
          <td>{{ r.nickname || '#' + r.user_id }}<br/><span class="muted">{{ r.phone }}</span></td>
          <td style="color:#f57c00;">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</td>
          <td>{{ r.content || '—' }}</td>
          <td><span class="tag" :style="r.status === 'on' ? 'background:#2e7d32;' : 'background:#999;'">{{ r.status === 'on' ? '展示中' : '已隐藏' }}</span></td>
          <td class="muted">{{ r.created_at }}</td>
          <td>
            <button class="btn btn-outline" style="padding:2px 8px;" @click="toggle(r)">
              {{ r.status === 'on' ? '隐藏' : '恢复' }}
            </button>
          </td>
        </tr>
        <tr v-if="!list.length"><td colspan="8" class="muted">暂无评价</td></tr>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const list = ref([])

onMounted(load)

async function load() {
  try { list.value = (await api.get('/admin/reviews')).data } catch (e) { alert(e.message) }
}

async function toggle(r) {
  try {
    const action = r.status === 'on' ? 'off' : 'on'
    const res = await api.post('/admin/reviews/' + r.id, { status: action })
    alert(res.msg)
    load()
  } catch (e) { alert(e.message) }
}
</script>
