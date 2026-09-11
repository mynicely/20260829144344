<template>
  <div class="page admin-page">
    <h1>广告/活动管理</h1>
    <AdminNav />

    <div class="card">
      <h2>新增广告</h2>
      <label class="label">标题</label>
      <input class="input" v-model="form.title" />
      <label class="label">广告图片（选填）</label>
      <input class="input" v-model="form.image" placeholder="图片地址，如 /uploads/xxx.png 或 https://..." />
      <input type="file" accept="image/*" @change="uploadImage" style="margin-top:8px;" />
      <img v-if="form.image" :src="form.image" class="ad-preview" />
      <label class="label">跳转链接（内部如 /courses，或外部 https://）</label>
      <input class="input" v-model="form.link" placeholder="/courses 或 https://..." />
      <label class="label">展示位置</label>
      <select class="input" v-model="form.position">
        <option value="home_bottom">首页底部</option>
      </select>
      <label class="label">排序（数字小在前）</label>
      <input class="input" type="number" v-model.number="form.sort" />
      <button class="btn btn-block" @click="add">添加广告</button>
    </div>

    <div class="card">
      <h2>广告列表</h2>
      <div v-for="a in ads" :key="a.id" style="border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p><b>{{ a.title }}</b> <span class="tag">{{ a.position === 'home_bottom' ? '首页底部' : a.position }}</span></p>
          <span class="muted" :class="{ 'status-qualified': a.status === 'on' }">{{ a.status === 'on' ? '显示' : '隐藏' }}</span>
        </div>
        <p class="muted">链接：{{ a.link || '无' }}｜排序：{{ a.sort }}</p>
        <img v-if="a.image" :src="a.image" class="ad-list-thumb" />
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline" @click="toggle(a)">{{ a.status === 'on' ? '隐藏' : '显示' }}</button>
          <button class="btn btn-outline" @click="del(a)">删除</button>
        </div>
      </div>
      <p v-if="!ads.length" class="muted">暂无广告</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import { dialog } from '../../utils/dialog'
import AdminNav from './AdminNav.vue'

const ads = ref([])
const form = ref({ title: '', image: '', link: '', position: 'home_bottom', sort: 0 })

onMounted(load)
async function load() {
  try { ads.value = (await api.get('/admin/ads')).data } catch (e) {}
}
async function add() {
  if (!form.value.title) { alert('请输入标题'); return }
  try { await api.post('/admin/ads', { ...form.value }); form.value = { title: '', image: '', link: '', position: 'home_bottom', sort: 0 }; load() } catch (e) { alert(e.message) }
}
async function uploadImage(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const r = await api.post('/upload', { base64: reader.result, filename: file.name })
      form.value.image = r.url
    } catch (e) { alert(e.message) }
  }
  reader.onerror = () => alert('读取图片失败')
  reader.readAsDataURL(file)
}
async function toggle(a) {
  try { await api.post('/admin/ads/' + a.id, { ...a, status: a.status === 'on' ? 'off' : 'on' }); load() } catch (e) { alert(e.message) }
}
async function del(a) {
  if (!(await dialog.confirm('确定删除该广告？'))) return
  try { await api.post('/admin/ads/' + a.id + '/delete'); load() } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.ad-preview { max-width: 120px; max-height: 80px; margin-top: 8px; border-radius: 6px; border: 1px solid #eee; }
.ad-list-thumb { max-width: 100px; max-height: 60px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #eee; }
</style>
