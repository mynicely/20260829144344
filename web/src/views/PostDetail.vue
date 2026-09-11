<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>

    <div v-if="post">
      <div class="card">
        <p style="display:flex;justify-content:space-between;align-items:center;">
          <b style="font-size:18px;">{{ post.title || '（无标题）' }}</b>
          <span class="tag">{{ catText(post.category) }}</span>
        </p>
        <p class="muted">{{ post.nickname }}｜{{ post.created_at }}</p>
        <div class="rich-content" v-html="post.content"></div>
        <div v-if="post.images && post.images.length" style="margin-top:10px;">
          <img v-for="img in post.images" :key="img" :src="img" style="max-width:100%;border-radius:8px;margin-bottom:6px;" />
        </div>

        <!-- 附件资料下载（碑帖资料等） -->
        <div v-if="post.attachment && post.attachment.length" style="margin-top:12px;border:1px dashed #e0cfa8;border-radius:10px;padding:10px;">
          <p style="font-weight:700;font-size:13px;color:#7d5a34;">📎 资料下载（{{ post.attachment.length }}个）</p>
          <div v-for="(f,i) in post.attachment" :key="i" style="margin-top:6px;">
            <a :href="f.url" target="_blank" rel="noopener" class="dl-link">⬇️ {{ f.name || ('附件' + (i+1)) }}</a>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-outline" @click="like">❤️ {{ post.like_count }}</button>
          <button class="btn btn-outline" @click="gotoComment">💬 {{ post.comment_count }} 评论</button>
        </div>
      </div>

      <div class="card">
        <h2>评论（{{ post.comments?.length || 0 }}）</h2>
        <p class="muted" style="font-size:12px;">评论经管理员审核通过后展示，请文明发言。</p>
        <div v-for="c in post.comments" :key="c.id" class="trial-item">
          <p><b>{{ c.nickname }}</b>：{{ c.content }}</p>
          <p class="muted">{{ c.created_at }}</p>
        </div>
        <p v-if="!post.comments || !post.comments.length" class="muted">暂无评论</p>
        <label class="label" style="margin-top:10px;">评论内容</label>
        <div style="display:flex;gap:6px;">
          <input class="input" v-model="comment" placeholder="写下你的评论..." style="margin-bottom:0;" @keyup.enter="submitComment" />
          <button class="btn" @click="submitComment">评论</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const post = ref(null)
const comment = ref('')
const cats = ref([])
const catText = (c) => (cats.value.find(x => x.value === c) || {}).name || c

onMounted(load)
async function load() {
  try { cats.value = (await api.get('/post-categories')).data } catch (e) {}
  try { post.value = (await api.get('/community/posts/' + route.params.id)).data } catch (e) { alert(e.message); router.back() }
}
async function like() {
  try {
    const r = await api.post('/community/posts/' + route.params.id + '/like')
    if (r && r.ok) post.value.like_count++
  } catch (e) {}
}
function gotoComment() { document.querySelector('.input[placeholder="写下你的评论..."]')?.focus() }
async function submitComment() {
  if (!store.token) { router.push('/login'); return }
  if (!comment.value) { alert('请输入评论'); return }
  try {
    await api.post('/community/posts/' + route.params.id + '/comment', { content: comment.value })
    alert('评论已提交，待管理员审核通过后展示'); comment.value = ''
  } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.rich-content {
  margin-top: 10px;
  line-height: 1.9;
  font-size: 15px;
  color: #3d2e1c;
  word-break: break-word;
}
.rich-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 8px 0;
}
.rich-content :deep(video) {
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}
.rich-content :deep(iframe) {
  max-width: 100%;
  aspect-ratio: 16/9;
  border-radius: 8px;
}
.rich-content :deep(a) { color: #8a6d3b; }
.rich-content :deep(blockquote) {
  border-left: 3px solid #d8c9ab;
  margin: 8px 0;
  padding: 6px 12px;
  background: #faf6ee;
  color: #6d5a43;
}
.rich-content :deep(pre) {
  background: #f5f0e6;
  padding: 10px;
  border-radius: 8px;
  overflow-x: auto;
}
.rich-content :deep(table) { border-collapse: collapse; }
.rich-content :deep(td),
.rich-content :deep(th) {
  border: 1px solid #e5dccb;
  padding: 6px 10px;
}
.dl-link {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #fff;
  background: var(--brand, #8a6d3b);
  text-decoration: none;
}
.dl-link:active { transform: scale(.97); }
</style>
