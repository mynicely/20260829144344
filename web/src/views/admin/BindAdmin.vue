<template>
  <div class="page admin-page">
    <h1>绑定关系管理</h1>
    <AdminNav />

    <div class="card">
      <h2>手动更改推荐关系绑定</h2>
      <label class="label">选择学员（搜索 ID / 手机号 / 昵称）</label>
      <input class="input" v-model="keyword" placeholder="输入学员 ID、手机号或昵称" @input="onSearch" />
      <select class="input" v-model="selectedUserId" @change="onSelect">
        <option value="">-- 选择学员 --</option>
        <option v-for="u in filtered" :key="u.id" :value="u.id">
          {{ u.id }} · {{ u.nickname }}（{{ u.phone }}）{{ u.identity === 'promoter' ? '·分享' : '' }}
        </option>
      </select>
      <p v-if="!filtered.length && keyword" class="muted">未找到匹配的学员</p>
    </div>

    <!-- 选中学员后的操作区 -->
    <div v-if="selected" class="card">
      <h2>操作对象</h2>
      <p>
        <b>#{{ selected.id }} {{ selected.nickname }}</b>
        <span class="tag">{{ selected.identity === 'promoter' ? '分享成员' : '普通消费者' }}</span>
        <span v-if="selected.is_paid" class="tag">已付费</span>
      </p>
      <p class="muted">当前介绍人：
        <b v-if="curReferrer">{{ curReferrer.nickname }}（#{{ curReferrer.id }}）</b>
        <b v-else>无（未绑定）</b>
      </p>
      <p v-if="curReferrer" class="muted" style="margin-top:4px;">
        当前介绍人身份：{{ curReferrer.identity === 'promoter' ? '分享成员' : '普通消费者' }}
      </p>

      <label class="label mt">新的推荐人（介绍人）用户ID</label>
      <input class="input" v-model.number="newReferrerId" placeholder="输入新介绍人用户ID" />
      <p v-if="newRefPreview" class="muted">
        将绑定到：<b>{{ newRefPreview.nickname }}（#{{ newRefPreview.id }}）</b>
        <span class="tag">{{ newRefPreview.identity === 'promoter' ? '分享成员' : '普通消费者' }}</span>
      </p>
      <p v-else-if="newReferrerId" class="muted" style="color:#d32f2f;">未找到该ID对应的用户</p>

      <label class="label">备注（选填，会记录到操作日志）</label>
      <input class="input" v-model="note" placeholder="如：客户要求调整/处理售后投诉等" />

      <div style="display:flex;gap:8px;">
        <button class="btn" style="flex:1;" @click="rebind" :disabled="!selectedUserId || !newReferrerId">重新绑定</button>
        <button class="btn btn-outline" style="flex:1;" @click="unbind" :disabled="!selectedUserId || !curReferrer">解绑</button>
      </div>
    </div>

    <div class="card">
      <h2>绑定变更日志</h2>
      <p v-if="!logs.length" class="muted">暂无操作记录</p>
      <div v-for="l in logs" :key="l.id" style="border-bottom:1px solid #eee;padding:8px 0;">
        <p>
          <b>{{ l.user_name || '#' + l.user_id }}</b>
          <span class="tag" :style="l.action === 'unbind' ? 'background:#d32f2f;' : 'background:#2e7d32;'">{{ l.action === 'unbind' ? '解绑' : '重新绑定' }}</span>
          <span class="muted" style="font-size:12px;">{{ l.created_at }}</span>
        </p>
        <p class="muted" style="font-size:12px;margin-top:2px;">
          原介绍人：{{ l.old_referrer_name ? l.old_referrer_name + '（#' + l.old_referrer_id + '）' : '无' }}
          → 新介绍人：{{ l.new_referrer_name ? l.new_referrer_name + '（#' + l.new_referrer_id + '）' : '无（已解绑）' }}
        </p>
        <p class="muted" style="font-size:12px;">
          操作人：{{ l.operator || '系统' }}（{{ l.operator_type === 'user' ? '用户端' : '后台' }}）
          <span v-if="l.note">｜备注：{{ l.note }}</span>
        </p>
      </div>
    </div>

    <div class="card">
      <h2>全部绑定关系</h2>
      <table class="table">
        <tr><th>ID</th><th>学员</th><th>身份</th><th>介绍人ID</th><th>操作</th></tr>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.id }}</td>
          <td>{{ u.nickname }}</td>
          <td>{{ u.identity === 'promoter' ? '分享' : '普通' }}</td>
          <td>{{ u.referrer_id || '无' }}</td>
          <td><button class="btn btn-outline" style="padding:4px 10px;font-size:12px;" @click="pick(u)">操作</button></td>
        </tr>
      </table>
      <p v-if="!users.length" class="muted">暂无用户</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '../../api'
import { dialog } from '../../utils/dialog'
import AdminNav from './AdminNav.vue'

const users = ref([])
const keyword = ref('')
const selectedUserId = ref('')
const newReferrerId = ref('')
const note = ref('')
const curReferrer = ref(null)
const newRefPreview = ref(null)
const logs = ref([])

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return users.value
  return users.value.filter(u =>
    String(u.id).includes(k) ||
    (u.phone || '').toLowerCase().includes(k) ||
    (u.nickname || '').toLowerCase().includes(k)
  )
})

const selected = computed(() => users.value.find(u => u.id === selectedUserId.value))

onMounted(async () => {
  try { users.value = (await api.get('/admin/users')).data } catch (e) { alert(e.message) }
  loadLogs()
})

async function loadLogs() {
  try { logs.value = (await api.get('/admin/rebind-logs')).data } catch (e) {}
}

// 输入新介绍人ID时实时预览
watch(newReferrerId, async (val) => {
  newRefPreview.value = null
  if (!val) return
  const id = Number(val)
  if (!id) return
  newRefPreview.value = users.value.find(u => u.id === id) || null
})

function onSearch() { if (!selectedUserId.value) selectedUserId.value = filtered.value[0]?.id || '' }

async function onSelect() {
  curReferrer.value = null
  newRefPreview.value = null
  newReferrerId.value = ''
  note.value = ''
  if (!selectedUserId.value) return
  const s = selected.value
  if (s && s.referrer_id) {
    curReferrer.value = users.value.find(u => u.id === s.referrer_id) || { id: s.referrer_id, nickname: '未知', identity: '' }
  }
}

function pick(u) {
  keyword.value = u.phone || String(u.id)
  selectedUserId.value = u.id
  onSelect()
}

async function rebind() {
  if (!selectedUserId.value) { alert('请先选择学员'); return }
  if (!newReferrerId.value) { alert('请输入新的介绍人用户ID'); return }
  if (!(await dialog.confirm(`确认将 #${selected.value.id} ${selected.value.nickname} 的介绍人绑定为 #${newReferrerId.value}？`))) return
  try {
    const r = await api.post('/admin/rebind', { userId: selectedUserId.value, newReferrerId: newReferrerId.value, note: note.value })
    alert(r.msg); resetAfterAction()
  } catch (e) { alert(e.message) }
}

async function unbind() {
  if (!selectedUserId.value) { alert('请先选择学员'); return }
  if (!(await dialog.confirm(`确认解绑 #${selected.value.id} ${selected.value.nickname} 的介绍人关系？`))) return
  try {
    const r = await api.post('/admin/rebind', { userId: selectedUserId.value, note: note.value })
    alert(r.msg); resetAfterAction()
  } catch (e) { alert(e.message) }
}

async function resetAfterAction() {
  keyword.value = ''; selectedUserId.value = ''; newReferrerId.value = ''
  note.value = ''
  curReferrer.value = null; newRefPreview.value = null
  try { users.value = (await api.get('/admin/users')).data } catch (e) {}
  loadLogs()
}
</script>
