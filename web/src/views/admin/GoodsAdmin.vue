<template>
  <div class="page admin-page">
    <h1>商品管理</h1>
    <AdminNav />

    <div class="card">
      <h2>类目管理</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span v-for="c in categories" :key="c.id" class="tag">{{ c.icon }} {{ c.name }}</span>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-end;">
        <div style="flex:1;">
          <label class="field-label">类目名称</label>
          <input class="input" v-model="newCat.name" placeholder="如 楷书入门" style="margin-bottom:0;" />
        </div>
        <div style="width:80px;">
          <label class="field-label">图标</label>
          <input class="input" v-model="newCat.icon" placeholder="如 ✍" style="margin-bottom:0;" />
        </div>
        <button class="btn" @click="addCat">添加</button>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h2 style="margin-bottom:0;">商品列表</h2>
        <button class="btn" @click="openCreate">+ 新增商品</button>
      </div>
      <div v-for="c in goods" :key="c.id" style="border:1px solid #eee;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p><b>{{ c.title }}</b> <span class="price">¥{{ c.price }}</span> <span class="tag">{{ c.category_name || '未分类' }}</span></p>
          <span class="muted" :class="{ 'status-qualified': c.status === 'on' }">{{ c.status === 'on' ? '上架' : '下架' }}</span>
        </div>
        <p class="muted">{{ c.subtitle }}｜类型：{{ typeText(c.type) }}｜拼团：{{ c.is_group ? '是' : '否' }}｜砍价：{{ c.is_bargain ? '是' : '否' }}</p>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn btn-outline" @click="edit(c)">编辑</button>
          <button class="btn btn-outline" @click="toggleStatus(c)">{{ c.status === 'on' ? '下架' : '上架' }}</button>
        </div>
      </div>
      <p v-if="!goods.length" class="muted">暂无商品</p>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showForm" class="modal-mask">
      <div class="modal">
        <h2>{{ editing.id ? '编辑商品' : '新增商品' }}</h2>
        <label class="label">标题</label>
        <input class="input" v-model="form.title" />
        <label class="label">副标题</label>
        <input class="input" v-model="form.subtitle" />
        <label class="label">类型</label>
        <select class="input" v-model="form.type">
          <option value="course">课程</option>
          <option value="goods">实物</option>
          <option value="activity">活动</option>
        </select>
        <label class="label">类目</label>
        <select class="input" v-model="form.category_id">
          <option value="">未分类</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <label class="label">价格（元）</label>
        <input class="input" type="number" v-model.number="form.price" />
        <label class="label">原价（元）</label>
        <input class="input" type="number" v-model.number="form.original_price" />
        <label class="label">有效期</label>
        <select class="input" v-model="form.validity">
          <option value="1year">一年</option>
          <option value="2year">两年</option>
          <option value="lifetime">终身</option>
          <option value="goods">实物/其他</option>
        </select>
        <label class="label">档位标识（用于订单，如 499）</label>
        <input class="input" v-model="form.level" />
        <label class="label">封面图片（jpg / png / webp，单张 ≤10MB）</label>
        <div class="cover-uploader">
          <div v-if="form.cover" class="cover-preview">
            <img :src="form.cover" alt="封面预览" />
            <div class="cover-actions">
              <button class="btn btn-outline btn-sm" @click="pickCover" :disabled="coverUploading">替换封面</button>
              <button class="btn btn-outline btn-sm" @click="form.cover = ''">删除封面</button>
            </div>
          </div>
          <button v-else class="cover-pick" @click="pickCover">{{ coverUploading ? '上传中…' : '＋ 上传本地封面' }}</button>
          <input ref="coverInput" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" style="display:none;" @change="onCoverChange" />
          <p class="hint">上传后自动生成可访问地址存入封面字段；历史旧课程已有的 http(s) 封面链接不受影响，正常展示。</p>
        </div>
        <label class="label">库存（-1不限）</label>
        <input class="input" type="number" v-model.number="form.stock" />
        <label class="label">营销</label>
        <div style="display:flex;gap:12px;margin-bottom:10px;">
          <label><input type="checkbox" v-model="form.is_group" /> 可拼团</label>
          <label><input type="checkbox" v-model="form.is_bargain" /> 可砍价</label>
        </div>

        <!-- 拼团档位配置 -->
        <div v-if="form.is_group" class="marketing-box">
          <label class="label">拼团档位（人数越多越优惠）</label>
          <div v-for="(t, i) in form.groupTiers" :key="i" class="tier-card">
            <div class="tier-card-head">
              <b>档位 {{ i + 1 }}</b>
              <button class="btn btn-outline btn-sm" @click="form.groupTiers.splice(i, 1)">删除该档</button>
            </div>
            <div class="tier-card-grid">
              <div class="field">
                <label class="field-label">成团人数</label>
                <input class="input" type="number" v-model.number="t.count" placeholder="如 2" />
              </div>
              <div class="field">
                <label class="field-label">拼团价（元）</label>
                <input class="input" type="number" v-model.number="t.price" placeholder="如 299" />
              </div>
              <div class="field">
                <label class="field-label">服务内容</label>
                <input class="input" v-model="t.services" placeholder="如：一年网络学习＋作业点评" />
              </div>
              <div class="field">
                <label class="field-label">礼包内容</label>
                <input class="input" v-model="t.gift" placeholder="如：进阶文房礼包一套" />
              </div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" @click="addGroupTier">+ 添加一档</button>
          <p class="hint">留空则使用「拼团人数+固定抵扣」旧逻辑</p>
          <div class="field" style="margin-top:10px;">
            <label class="field-label">拼团人数（旧逻辑兜底）</label>
            <input class="input" type="number" v-model.number="form.group_min" />
          </div>
        </div>

        <!-- 砍价规则配置 -->
        <div v-if="form.is_bargain" class="marketing-box">
          <div class="field">
            <label class="field-label">砍价规则模式</label>
            <select class="input" v-model="form.bargainConfig.mode">
              <option value="tiers">固定档位（达到帮砍人数→对应价格）</option>
              <option value="step">每刀减价（每多1人帮砍减固定金额）</option>
              <option value="random">随机砍到底价</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <div class="field" style="flex:1;">
              <label class="field-label">底价（元）</label>
              <input class="input" type="number" v-model.number="form.bargainConfig.floor_price" placeholder="砍到最低多少钱" />
            </div>
            <div class="field" style="flex:1;">
              <label class="field-label">最多帮砍人数</label>
              <input class="input" type="number" v-model.number="form.bargainConfig.max_helps" placeholder="最多允许多人帮砍" />
            </div>
          </div>
          <template v-if="form.bargainConfig.mode === 'tiers'">
            <div v-for="(t, i) in form.bargainConfig.tiers" :key="i" class="tier-card">
              <div class="tier-card-head">
                <b>档位 {{ i + 1 }}</b>
                <button class="btn btn-outline btn-sm" @click="form.bargainConfig.tiers.splice(i, 1)">删除该档</button>
              </div>
              <div class="tier-card-grid">
                <div class="field">
                  <label class="field-label">帮砍人数</label>
                  <input class="input" type="number" v-model.number="t.helps" placeholder="如 5" />
                </div>
                <div class="field">
                  <label class="field-label">砍价后价格（元）</label>
                  <input class="input" type="number" v-model.number="t.price" placeholder="如 299" />
                </div>
                <div class="field">
                  <label class="field-label">服务内容</label>
                  <input class="input" v-model="t.services" placeholder="如：一年网络学习＋作业点评" />
                </div>
                <div class="field">
                  <label class="field-label">礼包内容</label>
                  <input class="input" v-model="t.gift" placeholder="如：进阶文房礼包一套" />
                </div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" @click="addBargainTier">+ 添加一档</button>
          </template>
          <div v-else-if="form.bargainConfig.mode === 'step'" class="field" style="margin-top:8px;">
            <label class="field-label">每刀减价金额（元）</label>
            <input class="input" type="number" v-model.number="form.bargainConfig.step" placeholder="每多1人帮砍减多少元" />
          </div>
        </div>

        <label class="label">讲师介绍（用于课程详情页展示，选填）</label>
        <WysiwygEditor v-model="form.teacher" :min-height="'110px'" placeholder="如：王老师｜中国书法家协会会员，10年一线教学经验，擅长楷书与行书" />
        <label class="label">常见问题（每行一条，格式：问题｜回答）</label>
        <textarea class="input" rows="4" v-model="form.faqText" style="font-family:monospace;font-size:13px;" placeholder="没有基础能学会吗？｜可以，课程从零开始系统教学
每天要学多久？｜建议每天20-30分钟，跟着课程节奏即可"></textarea>
        <label class="label">课程章节（每行一条，格式：章节标题｜时长）</label>
        <textarea class="input" rows="6" v-model="form.chaptersText" style="font-family:monospace;font-size:13px;" placeholder="第一章 认识工具与执笔｜20分钟
第二章 基本笔画：横与竖｜25分钟
第三章 结构规律：重心与间距｜25分钟"></textarea>
        <label class="label">详情</label>
        <WysiwygEditor v-model="form.content" placeholder="课程/商品详情，支持加粗、标题、列表、图片、视频等富文本排版" />
        <div style="display:flex;gap:8px;">
          <button class="btn" style="flex:1;" @click="saveGoods">保存</button>
          <button class="btn btn-outline" style="flex:1;" @click="showForm = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'
import WysiwygEditor from '../../components/WysiwygEditor.vue'

const categories = ref([])
const goods = ref([])
const showForm = ref(false)
const editing = ref({})
const newCat = ref({ name: '', icon: '' })
const emptyForm = () => ({ title: '', subtitle: '', type: 'course', category_id: '', price: 0, original_price: '', validity: '1year', level: '', cover: '', stock: -1, is_group: false, is_bargain: false, group_min: 2, groupTiers: [], bargainConfig: { mode: 'tiers', floor_price: 0, max_helps: 5, tiers: [], step: 10 }, content: '', teacher: '', faqText: '', chaptersText: '' })
const form = ref(emptyForm())
const typeText = (t) => ({ course: '课程', goods: '实物', activity: '活动' }[t] || t)

// FAQ 文本 ⇄ 数组
function faqToText(arr) {
  return (arr || []).map(x => (x.q || '') + '|' + (x.a || '')).join('\n')
}
function parseFaq(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf('|')
    return i > -1 ? { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() } : { q: l, a: '' }
  })
}
// 章节文本 → 数组
function parseChapters(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf('|')
    return i > -1 ? { title: l.slice(0, i).trim(), duration: l.slice(i + 1).trim() } : { title: l, duration: '' }
  })
}

onMounted(load)
async function load() {
  try { categories.value = (await api.get('/admin/categories')).data } catch (e) {}
  try { goods.value = (await api.get('/admin/courses')).data } catch (e) {}
}
async function addCat() {
  if (!newCat.value.name) { alert('请输入类目名称'); return }
  try { await api.post('/admin/categories', { name: newCat.value.name, icon: newCat.value.icon }); newCat.value = { name: '', icon: '' }; load() } catch (e) { alert(e.message) }
}
function openCreate() { editing.value = {}; form.value = emptyForm(); showForm.value = true }
async function edit(c) {
  editing.value = c
  let faqArr = []
  try { faqArr = typeof c.faq === 'string' ? JSON.parse(c.faq || '[]') : (c.faq || []) } catch (e) { faqArr = [] }
  let groupTiers = []
  try { groupTiers = Array.isArray(c.group_tiers) ? c.group_tiers : JSON.parse(c.group_tiers || '[]') } catch (e) { groupTiers = [] }
  let bargainCfg = { mode: 'tiers', floor_price: 0, max_helps: 5, tiers: [], step: 10 }
  try { bargainCfg = Object.assign(bargainCfg, typeof c.bargain_config === 'object' ? c.bargain_config : JSON.parse(c.bargain_config || '{}')) } catch (e) {}
  if (!bargainCfg.tiers) bargainCfg.tiers = []
  form.value = { title: c.title, subtitle: c.subtitle, type: c.type, category_id: c.category_id || '', price: c.price, original_price: c.original_price, validity: c.validity, level: c.level, cover: c.cover, stock: c.stock, is_group: !!c.is_group, is_bargain: !!c.is_bargain, group_min: c.group_min, groupTiers, bargainConfig: bargainCfg, content: c.content, teacher: c.teacher || '', faqText: faqToText(faqArr), chaptersText: '' }
  showForm.value = true
  // 加载已有章节
  try {
    const d = (await api.get('/course/' + c.id + '/chapters')).data
    form.value.chaptersText = (d.chapters || []).map(x => x.title + (x.duration ? '|' + x.duration : '')).join('\n')
  } catch (e) { /* 忽略 */ }
}
function addGroupTier() { form.value.groupTiers.push({ count: 2, price: 0, services: '', gift: '' }) }
function addBargainTier() { form.value.bargainConfig.tiers.push({ helps: 5, price: 0, services: '', gift: '' }) }

// ---------- 封面本地图片上传 ----------
const coverInput = ref(null)
const coverUploading = ref(false)

function pickCover() { coverInput.value?.click() }

async function onCoverChange(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  // 格式限制：仅 jpg / png / webp
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { alert('仅支持 jpg / png / webp 格式的图片'); return }
  // 大小限制：单张 ≤10MB（与后端一致）
  if (file.size > 10 * 1024 * 1024) { alert('图片过大，单张最大 10MB'); return }
  if (coverUploading.value) return
  coverUploading.value = true
  try {
    const dataUrl = await compressImage(file)
    // 管理员接口：/api/admin/upload（api.js 会自动替换 admin 前缀并携带管理员 token）
    const r = await api.post('/admin/upload', { data: dataUrl, name: file.name })
    form.value.cover = r.url
  } catch (err) {
    alert(err.message || '封面上传失败')
  } finally {
    coverUploading.value = false
  }
}

// 图片压缩：最大宽 1600，JPEG quality 0.85；压缩失败回退原图
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1600
        let { width, height } = img
        if (width > MAX) {
          height = Math.round((height * MAX) / width)
          width = MAX
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        try { resolve(canvas.toDataURL('image/jpeg', 0.85)) }
        catch (e) { resolve(reader.result) }
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
async function saveGoods() {
  if (!form.value.title) { alert('请输入标题'); return }
  try {
    const chapters = parseChapters(form.value.chaptersText)
    const body = {
      ...form.value,
      category_id: form.value.category_id ? Number(form.value.category_id) : null,
      faq: parseFaq(form.value.faqText),
      group_tiers: form.value.groupTiers,
      bargain_config: form.value.bargainConfig,
      chaptersText: undefined,
      groupTiers: undefined,
      bargainConfig: undefined
    }
    let id = editing.value.id
    if (id) { await api.post('/admin/courses/' + id, body) }
    else { const r = await api.post('/admin/courses', body); id = r.id }
    // 章节有内容则同步保存
    if (chapters.length && id) {
      try { await api.post('/admin/courses/' + id + '/chapters', { chapters }) } catch (e) { alert('商品已保存，但章节保存失败：' + e.message) }
    }
    alert('已保存'); showForm.value = false; load()
  } catch (e) { alert(e.message) }
}
async function toggleStatus(c) {
  const target = c.status === 'on' ? 'off' : 'on'
  try { await api.post('/admin/courses/' + c.id, { status: target }); load() } catch (e) { alert(e.message) }
}
</script>

<style scoped>
.marketing-box {
  border: 1px dashed #d7c4a8;
  background: #fdfbf6;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.hint {
  font-size: 12px;
  color: #9b8f80;
  margin: 6px 0 0;
}
.tier-card {
  border: 1px solid #ece0cd;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.tier-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.tier-card-head b {
  font-size: 13px;
  color: #8a6d3b;
}
.tier-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.field .input,
.field select.input {
  margin-bottom: 0;
}
.field-label {
  font-size: 12px;
  color: #6b5e4f;
  font-weight: 600;
  white-space: nowrap;
}

/* ---------- 封面图片上传 ---------- */
.cover-uploader { margin-bottom: 10px; }
.cover-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px solid #ece0cd;
  border-radius: 10px;
  background: #fff;
}
.cover-preview img {
  width: 150px;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
  background: #f5efe4;
}
.cover-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cover-pick {
  width: 100%;
  min-height: 92px;
  border: 1px dashed #d7c4a8;
  border-radius: 10px;
  background: #fdfbf6;
  color: var(--brand);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background .2s;
}
.cover-pick:hover { background: #f7f0e3; }
</style>
