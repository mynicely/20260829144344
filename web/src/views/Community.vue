<template>
  <div class="page">
    <h1 style="text-align:center;font-size:20px;margin-bottom:6px;">翰墨互动</h1>
    <p class="muted" style="text-align:center;font-size:12px;">内容经官方审核后展示</p>

    <div class="cat-tabs">
      <button
        v-for="c in cats"
        :key="c.value"
        class="cat-tab"
        :class="{ active: curCat === c.value }"
        @click="setCat(c.value)"
      >{{ c.name }}</button>
    </div>

    <div class="feed">
      <div v-for="p in posts" :key="p.id" class="feed-card card" @click="$router.push('/post/' + p.id)">
        <div class="feed-head">
          <div class="feed-avatar">{{ (p.nickname || '官方').slice(0,1) }}</div>
          <div class="feed-meta">
            <div class="feed-name">{{ p.nickname || '官方' }}</div>
            <div class="feed-time">{{ p.created_at }}</div>
          </div>
          <span class="feed-cat">{{ catText(p.category) }}</span>
        </div>

        <div class="feed-body">
          <div v-if="p.title" class="feed-title">{{ p.title }}</div>
          <div class="feed-text">{{ stripHtml(p.content, 120) }}</div>
        </div>

        <div v-if="p.images && p.images.length" class="feed-imgs">
          <img v-for="(img,i) in p.images.slice(0,3)" :key="i" :src="img" class="feed-img" alt="" />
          <div v-if="p.images.length > 3" class="feed-img-more">+{{ p.images.length - 3 }}</div>
        </div>

        <div class="feed-foot">
          <span v-if="p.attachment && p.attachment.length" class="feed-att">📎 {{ p.attachment.length }}个附件</span>
          <span class="feed-stat">❤️ {{ p.like_count || 0 }}</span>
          <span class="feed-stat">💬 {{ p.comment_count || 0 }}</span>
        </div>
      </div>
    </div>

    <p v-if="!posts.length" class="muted" style="text-align:center;padding:40px 0;">该栏目暂无内容</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'
import { stripHtml } from '../utils/html'

const posts = ref([])
const cats = ref([])
const curCat = ref('')
const catText = (c) => (cats.value.find(x => x.value === c) || {}).name || c

onMounted(async () => {
  try { cats.value = (await api.get('/post-categories')).data } catch (e) {}
  load()
})
async function load() {
  try { posts.value = (await api.get('/community/posts', { params: { category: curCat.value || '' } })).data } catch (e) {}
}
function setCat(c) { curCat.value = curCat.value === c ? '' : c; load() }
</script>

<style scoped>
.cat-tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0 12px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.cat-tabs::-webkit-scrollbar { display: none; }
.cat-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid #e5d8c3;
  background: #fff;
  color: #6d5a43;
  font-size: 13px;
  cursor: pointer;
  transition: all .2s;
}
.cat-tab.active {
  background: #f5efe4;
  border-color: #c9b796;
  color: #5c4626;
  font-weight: 600;
}

.feed { display: flex; flex-direction: column; gap: 10px; }
.feed-card {
  padding: 14px;
  cursor: pointer;
  transition: transform .15s;
}
.feed-card:active { transform: scale(.99); }
.feed-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.feed-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: #e9dfc8;
  color: #6d5a43;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
}
.feed-meta { flex: 1; }
.feed-name { font-size: 14px; font-weight: 600; color: #3d2e1c; }
.feed-time { font-size: 11px; color: #9e8f76; margin-top: 2px; }
.feed-cat {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 999px;
  background: #f5efe4;
  color: #7d5a34;
}

.feed-body { margin-bottom: 10px; }
.feed-title {
  font-size: 15px;
  font-weight: 700;
  color: #2b2118;
  margin-bottom: 6px;
  line-height: 1.5;
}
.feed-text {
  font-size: 13px;
  color: #5e503f;
  line-height: 1.7;
}

.feed-imgs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 10px;
  position: relative;
}
.feed-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #f3eadc;
}
.feed-img-more {
  position: absolute;
  right: 0; bottom: 0;
  width: calc(33.333% - 4px);
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  background: rgba(43,33,24,.55);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600;
}

.feed-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: #9e8f76;
  padding-top: 8px;
  border-top: 1px solid #f0e9de;
}
.feed-att { color: #7d5a34; }
.feed-stat { display: flex; align-items: center; gap: 3px; }
</style>
