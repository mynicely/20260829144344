<template>
  <div class="page admin-page">
    <h1>内容管理</h1>
    <AdminNav />

    <!-- 官方发布（教培动态/碑帖资料/活动交流等，发布即展示） -->
    <div class="card">
      <h2>官方发布（发布后直接展示）</h2>
      <p class="muted" style="font-size:12px;">教培动态、碑帖资料、活动交流等官方内容由此发布；学员内容由学员在个人中心发布后在此审核。</p>
      <label class="label">栏目分类</label>
      <select class="input" v-model="pub.category">
        <option v-for="c in cats" :key="c.value" :value="c.value">{{ c.name }}</option>
      </select>
      <label class="label">标题</label>
      <input class="input" v-model="pub.title" placeholder="标题" />
      <label class="label">内容（支持图片 / 视频 / 链接，所见即所得）</label>
      <WysiwygEditor v-model="pub.content" placeholder="正文内容，可插入图片、视频、链接" />
      <label class="label">资料附件（碑帖/PDF等，可多个）</label>
      <input class="input" type="file" @change="onPubAttach" />
      <div v-for="(f,i) in pub.attachment" :key="i" style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <span class="muted" style="font-size:12px;">📎 {{ f.name }}</span>
        <button class="btn btn-outline" style="font-size:12px;padding:2px 8px;" @click="pub.attachment.splice(i,1)">移除</button>
      </div>
      <button class="btn btn-block" style="margin-top:10px;" @click="publish">发布</button>
    </div>

    <!-- 栏目分类管理（增删改） -->
    <div class="card">
      <h2>栏目分类管理</h2>
      <p class="muted" style="font-size:12px;margin-bottom:8px;">管理「翰墨互动」栏目与发布分类，可随时增删改；删除即停用，历史帖子不受影响。</p>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:130px;">
          <label class="field-label">栏目名称</label>
          <input class="input" v-model="catForm.name" placeholder="如 作品展示" style="margin-bottom:0;" />
        </div>
        <div style="flex:1;min-width:130px;">
          <label class="field-label">栏目标识</label>
          <input class="input" v-model="catForm.value" placeholder="如 works" style="margin-bottom:0;" />
        </div>
        <div style="width:90px;">
          <label class="field-label">排序</label>
          <input class="input" v-model.number="catForm.sort" type="number" placeholder="数字小在前" style="margin-bottom:0;" />
        </div>
        <button class="btn" @click="saveCat">{{ catForm.id ? '保存修改' : '添加栏目' }}</button>
        <button v-if="catForm.id" class="btn btn-outline" @click="resetCatForm">取消</button>
      </div>
      <div v-for="c in allCats" :key="c.id" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px dashed #eee;">
        <span style="flex:1;font-size:13px;">
          {{ c.name }}
          <span class="muted" style="font-size:12px;">（{{ c.value }}）</span>
          <span v-if="c.status !== 'on'" class="tag status-invalid">已停用</span>
        </span>
        <button class="btn btn-outline" style="font-size:12px;padding:2px 8px;" @click="editCat(c)">编辑</button>
        <button v-if="c.status === 'on'" class="btn btn-outline" style="font-size:12px;padding:2px 8px;" @click="delCat(c)">删除</button>
      </div>
      <p v-if="!allCats.length" class="muted">暂无栏目，先添加一个</p>
    </div>

    <div class="card">
      <h2>敏感词库（发布时自动拦截）</h2>
      <p class="muted" style="margin-bottom:8px;">每行一个词，保存后立即生效。发布动态、评论、学习心得/作业留言时，内容命中敏感词会被自动拦截。</p>
      <label class="label">敏感词列表（每行一个）</label>
      <textarea class="input" rows="6" v-model="wordsText" placeholder="每行一个敏感词"></textarea>
      <button class="btn" style="margin-top:8px;" @click="saveWords">保存敏感词</button>
      <span v-if="savedTip" class="muted" style="margin-left:8px;">{{ savedTip }}</span>
    </div>

    <!-- 帖子审核 -->
    <div class="card">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn btn-outline" :class="{ on: filter === 'pending' }" @click="setFilter('pending')">待审核</button>
        <button class="btn btn-outline" :class="{ on: filter === 'approved' }" @click="setFilter('approved')">已通过</button>
        <button class="btn btn-outline" :class="{ on: filter === 'rejected' }" @click="setFilter('rejected')">已驳回</button>
        <button class="btn btn-outline" :class="{ on: filter === 'all' }" @click="setFilter('all')">全部</button>
        <select class="input" v-model="catFilter" style="width:auto;" @change="loadPosts">
          <option value="all">全部分类</option>
          <option v-for="c in allCats" :key="c.value" :value="c.value">{{ c.name }}{{ c.status !== 'on' ? '（已停用）' : '' }}</option>
        </select>
      </div>

      <div v-for="p in posts" :key="p.id" style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p><b>{{ p.nickname }}</b>：{{ p.title || '（无标题）' }}</p>
          <span>
            <span v-if="p.hidden" class="tag status-invalid" style="margin-right:4px;">已隐藏</span>
            <span class="tag" :class="statusClass[p.status]">{{ statusText[p.status] }}</span>
          </span>
        </div>
        <p class="muted" style="font-size:12px;">{{ catText(p.category) }}</p>
        <p class="muted" style="white-space:pre-wrap;">{{ stripHtml(p.content) }}</p>
        <div v-if="hitsFor(p).length" style="margin:6px 0;font-size:12px;color:#c0392b;">
          ⚠️ 含敏感词：{{ hitsFor(p).join('、') }}
        </div>
        <div v-if="p.images && p.images.length" style="display:flex;gap:6px;margin:6px 0;flex-wrap:wrap;">
          <img v-for="img in p.images" :key="img" :src="img" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" />
        </div>
        <div v-if="p.attachment && p.attachment.length" style="margin:6px 0;font-size:12px;">
          <a v-for="f in p.attachment" :key="f.url" :href="f.url" target="_blank" rel="noopener" style="display:inline-block;margin-right:8px;color:#8a6d3b;">📎 {{ f.name }}</a>
        </div>
        <p class="muted">{{ p.created_at }}｜❤️{{ p.like_count }}｜💬{{ p.comment_count }}</p>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button v-if="p.status !== 'approved'" class="btn" @click="setStatus(p.id, 'approved')">通过</button>
          <button v-if="p.status !== 'rejected'" class="btn btn-outline" @click="setStatus(p.id, 'rejected')">驳回</button>
          <button class="btn btn-outline" @click="del(p.id)">删除</button>
        </div>
      </div>
      <p v-if="!posts.length" class="muted">暂无动态</p>
    </div>

    <!-- 评论审核 -->
    <div class="card">
      <h2>评论审核</h2>
      <p class="muted" style="font-size:12px;">评论默认待审核，审核通过后展示并计入评论数。</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn btn-outline" :class="{ on: cFilter === 'pending' }" @click="setCFilter('pending')">待审核</button>
        <button class="btn btn-outline" :class="{ on: cFilter === 'approved' }" @click="setCFilter('approved')">已通过</button>
        <button class="btn btn-outline" :class="{ on: cFilter === 'rejected' }" @click="setCFilter('rejected')">已驳回</button>
        <button class="btn btn-outline" :class="{ on: cFilter === 'all' }" @click="setCFilter('all')">全部</button>
      </div>
      <div v-for="c in comments" :key="c.id" style="border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:8px;">
        <p style="display:flex;justify-content:space-between;align-items:center;">
          <b>{{ c.user_name }}（{{ c.user_phone }}）</b>
          <span class="tag" :class="statusClass[c.status]">{{ statusText[c.status] }}</span>
        </p>
        <p class="muted" style="font-size:12px;">评论于「{{ c.post_title || '（已删帖）' }}」</p>
        <p>{{ c.content }}</p>
        <p class="muted">{{ c.created_at }}</p>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button v-if="c.status !== 'approved'" class="btn" @click="setCStatus(c.id, 'approved')">通过</button>
          <button v-if="c.status !== 'rejected'" class="btn btn-outline" @click="setCStatus(c.id, 'rejected')">驳回</button>
          <button class="btn btn-outline" @click="delComment(c.id)">删除</button>
        </div>
      </div>
      <p v-if="!comments.length" class="muted">暂无评论</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../../api'
import { dialog } from '../../utils/dialog'
import { stripHtml } from '../../utils/html'
import WysiwygEditor from '../../components/WysiwygEditor.vue'
import AdminNav from './AdminNav.vue'

const route = useRoute()
const posts = ref([])
const comments = ref([])
const filter = ref(route.query.status || 'pending')
const catFilter = ref('all')
const cFilter = ref(route.query.cstatus || 'pending')
const words = ref([])
const wordsText = ref('')
const savedTip = ref('')
const cats = ref([])              // 启用分类（发布下拉）
const allCats = ref([])           // 全部分类（管理/筛选）
const catForm = ref({ id: null, name: '', value: '', sort: 0 })
const statusText = { pending: '待审核', approved: '已通过', rejected: '已驳回', deleted: '已删除' }
const statusClass = { pending: '', approved: 'status-qualified', rejected: 'status-invalid', deleted: 'status-invalid' }
const catText = (c) => (allCats.value.find(x => x.value === c) || {}).name || c
const pub = ref({ title: '', content: '', category: '', images: [], attachment: [] })

onMounted(load)
async function load() { loadPosts(); loadComments(); loadWords(); loadCat() }
async function loadCat() {
  try { allCats.value = (await api.get('/admin/post-categories')).data } catch (e) {}
  try { cats.value = (await api.get('/post-categories')).data } catch (e) {}
  if (!cats.value.length) cats.value = allCats.value.filter(c => c.status === 'on')
  if (!pub.value.category && cats.value[0]) pub.value.category = cats.value[0].value
}
function resetCatForm() { catForm.value = { id: null, name: '', value: '', sort: 0 } }
function editCat(c) { catForm.value = { id: c.id, name: c.name, value: c.value, sort: c.sort } }
async function saveCat() {
  const f = catForm.value
  if (!f.name || !f.value) { alert('请填写栏目名称和标识'); return }
  try {
    const url = f.id ? '/admin/post-categories/' + f.id : '/admin/post-categories'
    const r = await api.post(url, { name: f.name, value: f.value, sort: f.sort || 0 })
    alert(r.msg)
    resetCatForm(); loadCat(); loadPosts()
  } catch (e) { alert(e.message) }
}
async function delCat(c) {
  if (!(await dialog.confirm('确定删除该栏目？将不再在版面与发布中显示（历史帖子不受影响）'))) return
  try {
    const r = await api.post('/admin/post-categories/' + c.id + '/delete')
    alert(r.msg)
    loadCat(); loadPosts()
    if (catFilter.value === c.value) { catFilter.value = 'all'; loadPosts() }
  } catch (e) { alert(e.message) }
}
async function loadWords() {
  try {
    const w = (await api.get('/admin/sensitive-words')).data
    words.value = w
    wordsText.value = w.join('\n')
  } catch (e) {}
}
async function loadPosts() {
  try { posts.value = (await api.get('/admin/posts', { params: { status: filter.value, category: catFilter.value } })).data } catch (e) {}
}
async function loadComments() {
  try { comments.value = (await api.get('/admin/comments', { params: { status: cFilter.value } })).data } catch (e) {}
}
function setFilter(f) { filter.value = f; loadPosts() }
function setCFilter(f) { cFilter.value = f; loadComments() }
function hitsFor(p) {
  const text = (p.title || '') + stripHtml(p.content)
  return words.value.filter(w => w && text.includes(w))
}
async function saveWords() {
  const list = [...new Set(wordsText.value.split(/\r?\n/).map(w => w.trim()).filter(Boolean))]
  if (!list.length) { savedTip.value = '敏感词不能为空'; return }
  try {
    const r = await api.post('/admin/sensitive-words', { words: list })
    words.value = r.data
    wordsText.value = r.data.join('\n')
    savedTip.value = r.msg
    setTimeout(() => { savedTip.value = '' }, 3000)
  } catch (e) { alert(e.message) }
}
async function setStatus(id, status) {
  try { await api.post('/admin/posts/' + id + '/status', { status }); loadPosts() } catch (e) { alert(e.message) }
}
async function del(id) {
  if (!(await dialog.confirm('确定删除该帖？关联评论将一并移除'))) return
  try { await api.post('/admin/posts/' + id + '/delete'); loadPosts(); loadComments() } catch (e) { alert(e.message) }
}
async function setCStatus(id, status) {
  try { await api.post('/admin/comments/' + id + '/status', { status }); loadComments(); loadPosts() } catch (e) { alert(e.message) }
}
async function delComment(id) {
  if (!(await dialog.confirm('确定删除该评论？'))) return
  try { await api.post('/admin/comments/' + id + '/delete'); loadComments(); loadPosts() } catch (e) { alert(e.message) }
}
async function onPubAttach(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const r = await api.post('/upload', { data: reader.result, name: file.name })
      pub.value.attachment.push({ name: file.name, url: r.url })
    } catch (err) { alert(err.message) }
  }
  reader.readAsDataURL(file)
}
async function publish() {
  if (!pub.value.content) { alert('请输入内容'); return }
  try {
    const r = await api.post('/admin/posts', { ...pub.value })
    alert(r.msg)
    pub.value = { title: '', content: '', category: pub.value.category, images: [], attachment: [] }
    loadPosts()
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.field-label {
  display: block;
  font-size: 12px;
  color: #6b5e4f;
  font-weight: 600;
  margin-bottom: 3px;
}
</style>
