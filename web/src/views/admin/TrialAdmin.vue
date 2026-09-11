<template>
  <div class="page admin-page">
    <h1>体验课管理</h1>
    <AdminNav />

    <div class="card" v-if="stats">
      <h2>数据统计</h2>
      <p>总预约：<b>{{ stats.total }}</b>｜线上：<b>{{ stats.online }}</b>｜线下：<b>{{ stats.offline }}</b></p>
      <p>待联系：<b class="status-frozen">{{ stats.booked }}</b>｜已联系：<b>{{ stats.contacted }}</b>｜已完成：<b>{{ stats.finished }}</b></p>
      <p v-if="stats.bySubject.length">科目分布：
        <span v-for="s in stats.bySubject" :key="s.subject" class="tag" style="background:#666;">{{ s.subject }} {{ s.c }}</span>
      </p>
    </div>

    <div class="card">
      <h2>预约列表</h2>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <button class="btn btn-outline" :class="{ on: filter === 'all' }" @click="setFilter('all')">全部</button>
        <button class="btn btn-outline" :class="{ on: filter === 'booked' }" @click="setFilter('booked')">待联系</button>
        <button class="btn btn-outline" :class="{ on: filter === 'contacted' }" @click="setFilter('contacted')">已联系</button>
        <button class="btn btn-outline" :class="{ on: filter === 'finished' }" @click="setFilter('finished')">已完成</button>
      </div>

      <div v-for="t in trials" :key="t.id" style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p><b>{{ t.name }}</b>（{{ t.phone }}）<span class="tag">{{ statusText(t.status) }}</span></p>
          <span class="muted">#{{ t.id }}</span>
        </div>
        <p class="muted">
          科目：{{ t.subject }}｜方式：{{ t.mode === 'online' ? '线上' : '线下' }}｜时段：{{ t.prefer_time || '未指定' }}
          ｜{{ t.age_group === 'child' ? '少儿' : '成人' }}
        </p>
        <p class="muted">预约于 {{ t.created_at }}｜用户昵称：{{ t.user_nickname }}</p>

        <label class="label">状态</label>
        <select class="input" :value="t.status" @change="updateStatus(t.id, $event.target.value)">
          <option value="booked">待联系</option>
          <option value="contacted">已联系</option>
          <option value="finished">已完成</option>
          <option value="closed">已关闭</option>
        </select>
        <label class="label">沟通回复（用户可见）</label>
        <input class="input" :value="t.reply" @change="saveField(t.id, 'reply', $event.target.value)" placeholder="填写后用户可在「我的体验课预约」看到" />
        <label class="label">内部备注（仅后台可见）</label>
        <input class="input" :value="t.admin_note" @change="saveField(t.id, 'adminNote', $event.target.value)" placeholder="管理员内部备注" />
      </div>
      <p v-if="!trials.length" class="muted">暂无预约记录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const route = useRoute()
const trials = ref([])
const stats = ref(null)
const filter = ref(route.query.status || 'all')
const statusText = (s) => ({ booked: '待联系', contacted: '已联系', finished: '已完成', closed: '已关闭' }[s] || s)

onMounted(load)

async function load() {
  try { trials.value = (await api.get('/admin/trials', { params: { status: filter.value } })).data } catch (e) {}
  try { stats.value = (await api.get('/admin/trial-stats')).data } catch (e) {}
}
function setFilter(f) { filter.value = f; load() }
async function updateStatus(id, status) {
  try { await api.post('/admin/trial/' + id, { status }); load() } catch (e) { alert(e.message) }
}
async function saveField(id, field, value) {
  const body = field === 'adminNote' ? { adminNote: value } : { reply: value }
  try { await api.post('/admin/trial/' + id, body) } catch (e) { alert(e.message) }
}
</script>
