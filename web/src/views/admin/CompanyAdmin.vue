<template>
  <div class="page admin-page">
    <h1>公司介绍编辑</h1>
    <AdminNav />

    <div class="card">
      <label class="label">标题</label>
      <input class="input" v-model="title" />
      <label class="label">内容</label>
      <WysiwygEditor v-model="content" placeholder="支持加粗、标题、列表、图片、视频等富文本排版" />
      <button class="btn btn-block" @click="save">保存公司介绍</button>
      <div class="card mt" v-if="content">
        <h2>预览</h2>
        <div style="line-height:1.9;" v-html="content"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'
import WysiwygEditor from '../../components/WysiwygEditor.vue'

const title = ref('')
const content = ref('')

onMounted(async () => {
  try {
    const d = (await api.get('/admin/company')).data
    if (d) { title.value = d.title; content.value = d.content }
  } catch (e) {}
})

async function save() {
  try {
    const r = await api.post('/admin/company', { title: title.value, content: content.value })
    alert(r.msg)
  } catch (e) { alert(e.message) }
}
</script>
