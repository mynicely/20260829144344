<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.push('/community')">← 返回互动</button>
    </div>
    <h1>我的动态</h1>

    <!-- 个人发表/编辑入口（审核制：发布后待管理员审核，审核通过后才在栏目展示） -->
    <div class="card">
      <h2>{{ form.id ? '编辑内容' : '发表内容' }}</h2>
      <p class="muted" style="font-size:12px;">
        {{ form.id ? '保存修改：已通过的内容直接生效；被驳回的内容保存后将重新送审。' : '发布后需管理员审核，审核通过后才在「翰墨互动」展示。' }}
      </p>
      <label class="label">分类</label>
      <select class="input" v-model="form.category">
        <option v-for="c in cats" :key="c.value" :value="c.value">{{ c.name }}</option>
      </select>
      <label class="label">标题（选填）</label>
      <input class="input" v-model="form.title" placeholder="给内容起个标题" />
      <label class="label">内容（支持图片 / 视频 / 链接）</label>
      <WysiwygEditor v-model="form.content" placeholder="分享你的书法心得、作品或问题..." />
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-block" @click="submit">{{ form.id ? '保存修改' : '提交（待审核）' }}</button>
        <button v-if="form.id" class="btn btn-outline" @click="cancelEdit">取消编辑</button>
      </div>
    </div>

    <div v-for="p in posts" :key="p.id" class="card">
      <p style="display:flex;justify-content:space-between;align-items:center;">
        <b @click="$router.push('/post/' + p.id)" style="cursor:pointer;">{{ p.title || '（无标题）' }}</b>
        <span>
          <span v-if="p.hidden" class="tag status-invalid" style="margin-right:4px;">已隐藏</span>
          <span class="tag" :class="statusClass[p.status]">{{ statusText[p.status] }}</span>
        </span>
      </p>
      <p class="muted">{{ stripHtml(p.content, 60) }}</p>
      <p class="muted">{{ p.created_at }}｜❤️ {{ p.like_count }}｜💬 {{ p.comment_count }}</p>
      <div style="display:flex;gap:6px;margin-top:6px;" v-if="p.status !== 'deleted'">
        <button class="btn btn-outline" @click="editPost(p)">编辑</button>
        <button class="btn btn-outline" @click="toggleHide(p)">{{ p.hidden ? '恢复公开' : '隐藏' }}</button>
        <button v-if="p.status === 'pending'" class="btn btn-outline" @click="del(p.id)">撤回</button>
      </div>
    </div>
    <p v-if="!posts.length" class="muted" style="text-align:center;padding:30px;">你还没有发布过内容</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { dialog } from '../utils/dialog'
import { stripHtml } from '../utils/html'
import WysiwygEditor from '../components/WysiwygEditor.vue'

const router = useRouter()
const store = useUserStore()
const posts = ref([])
const cats = ref([])
const form = ref({ id: null, title: '', content: '', category: 'works', images: [] })
const statusText = { pending: '待审核', approved: '已通过', rejected: '已驳回', deleted: '已删除' }
const statusClass = { pending: '', approved: 'status-qualified', rejected: 'status-invalid', deleted: 'status-invalid' }

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  try { cats.value = (await api.get('/post-categories')).data; if (!form.value.category) form.value.category = cats.value[0]?.value || 'works' } catch (e) {}
  load()
})
function resetForm() { form.value = { id: null, title: '', content: '', category: 'works', images: [] } }
async function submit() {
  if (!store.token) { router.push('/login'); return }
  if (!form.value.content) { alert('请输入内容'); return }
  try {
    let r
    if (form.value.id) {
      r = await api.put('/community/posts/' + form.value.id, { title: form.value.title, content: form.value.content, category: form.value.category, images: form.value.images })
    } else {
      r = await api.post('/community/posts', { ...form.value })
    }
    alert(r.msg)
    resetForm()
    load()
  } catch (e) { alert(e.message) }
}
async function load() {
  try { posts.value = (await api.get('/community/my')).data } catch (e) {}
}
function editPost(p) {
  // 兼容旧帖：历史 images 数组中的图片转换为富文本 HTML 附加到正文尾部
  let html = p.content || ''
  if (Array.isArray(p.images) && p.images.length) {
    const imgs = p.images.map(u => `<img src="${u}" alt="图片" />`).join('')
    html = (html ? html + '<p></p>' : '') + imgs
  }
  form.value = { id: p.id, title: p.title || '', content: html, category: p.category || 'works', images: [] }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function cancelEdit() { resetForm() }
async function toggleHide(p) {
  const target = !p.hidden
  if (!(await dialog.confirm(target ? '隐藏后仅自己可见，其他人将看不到这篇内容，确定隐藏？' : '恢复后所有人都能看到这篇内容，确定恢复公开？'))) return
  try {
    await api.post('/community/posts/' + p.id + '/hide', { hidden: target ? 1 : 0 })
    alert(target ? '已隐藏，仅自己可见' : '已恢复公开')
    load()
  } catch (e) { alert(e.message) }
}
async function del(id) {
  if (!(await dialog.confirm('确定撤回该内容？'))) return
  try { await api.post('/community/posts/' + id + '/retract'); posts.value = posts.value.filter(p => p.id !== id); alert('已撤回') }
  catch (e) { alert(e.message) }
}
</script>
