<template>
  <div class="page admin-page">
    <h1>参数配置</h1>
    <AdminNav />

    <!-- 后台访问路径（防破解） -->
    <div class="card">
      <h2>🔐 后台访问路径</h2>
      <p class="muted" style="font-size:13px;line-height:1.8;">
        当前后台地址：<b style="color:#8b4513;">/{{ prefix }}</b><br/>
        修改前缀后，默认 <b>/admin</b> 与旧地址<b style="color:#d32f2f;">立即失效（返回404）</b>，需用新地址访问后台。
        建议修改为不易猜测的字母/数字组合（如 /hmsy2026）。前端页面不再显示任何后台入口。
      </p>
      <label class="label" style="margin-top:10px;">新后台访问路径</label>
      <div style="display:flex;gap:8px;">
        <input class="input" v-model="newPrefix" placeholder="新前缀，如 hmsy2026" style="flex:1;" />
        <button class="btn" @click="savePrefix">保存并跳转</button>
      </div>
      <p class="muted" style="font-size:12px;margin-top:6px;">仅限字母/数字/下划线/中划线，至少2位；保存后请记牢新地址。</p>
    </div>

    <div class="card">
      <p class="muted">所有参数可随时修改、实时生效，无需改代码。</p>
      <div v-for="s in settings" :key="s.key" class="mt" style="border-bottom:1px solid #eee;padding-bottom:10px;">
        <label class="label">{{ s.remark }}（{{ s.key }}）</label>
        <input class="input" :value="getVal(s)" @change="update(s.key, $event.target.value)" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import { dialog } from '../../utils/dialog'
import AdminNav from './AdminNav.vue'
const settings = ref([])
const newPrefix = ref('')
const prefix = ref((window.__ADMIN_PREFIX__ || localStorage.getItem('admin_prefix') || 'admin').replace(/^\/+|\/+$/g, ''))
onMounted(async () => {
  try { settings.value = (await api.get('/admin/settings')).data } catch (e) {}
})
function getVal(s) { try { return JSON.parse(s.value).v } catch (e) { return s.value } }
async function update(key, value) {
  try { await api.post('/admin/settings', { key, value }); alert('已更新 ' + key) }
  catch (e) { alert(e.message) }
}
async function savePrefix() {
  const p = String(newPrefix.value || '').trim()
  if (!p) { alert('请输入新前缀'); return }
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(p)) { alert('前缀须为2-32位字母/数字/下划线/中划线'); return }
  if (!(await dialog.confirm('确认将后台地址改为 /' + p + '？保存后 /' + prefix.value + ' 立即失效，请务必记牢新地址！'))) return
  try {
    const r = await api.post('/admin/prefix', { prefix: p })
    const np = r.prefix || p
    localStorage.setItem('admin_prefix', np)
    window.__ADMIN_PREFIX__ = np
    alert(r.msg)
    location.href = '/' + np + '/dashboard'
  } catch (e) { alert(e.message) }
}
</script>
