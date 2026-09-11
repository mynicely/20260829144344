<template>
  <div class="wysiwyg">
    <div class="wysiwyg-toolbar">
      <button type="button" class="tb-btn" title="加粗" @mousedown.prevent @click="exec('bold')">
        <svg viewBox="0 0 24 24"><path d="M7 4h6.2a3.4 3.4 0 0 1 0 6.8H7V4zm0 6.8h7.4a3.4 3.4 0 0 1 0 6.8H7v-6.8z" fill="currentColor"/></svg>
      </button>
      <button type="button" class="tb-btn" title="斜体" @mousedown.prevent @click="exec('italic')">
        <svg viewBox="0 0 24 24"><path d="M10 4h8M6 20h8M14 4l-4 16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="tb-btn" title="下划线" @mousedown.prevent @click="exec('underline')">
        <svg viewBox="0 0 24 24"><path d="M6 4v7a6 6 0 0 0 12 0V4M5 20h14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="tb-btn" title="删除线" @mousedown.prevent @click="exec('strikeThrough')">
        <svg viewBox="0 0 24 24"><path d="M7 5h10M6 12h12M9 19h6M8 12c.3-2.4 1.8-3.8 4-3.8 1.7 0 3 .9 3.5 2.4" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/></svg>
      </button>
      <span class="tb-sep"></span>
      <button type="button" class="tb-btn" title="二级标题" @mousedown.prevent @click="formatBlock('h2')">H2</button>
      <button type="button" class="tb-btn" title="三级标题" @mousedown.prevent @click="formatBlock('h3')">H3</button>
      <button type="button" class="tb-btn" title="正文" @mousedown.prevent @click="formatBlock('p')">正文</button>
      <button type="button" class="tb-btn" title="引用" @mousedown.prevent @click="formatBlock('blockquote')">
        <svg viewBox="0 0 24 24"><path d="M4 6h6v6H6.5c0 3 1.6 4.4 4 5.2v2C5.6 18.7 4 15.7 4 12V6zm10 0h6v6h-3.5c0 3 1.6 4.4 4 5.2v2c-4.9-.5-6.5-3.5-6.5-7V6z" fill="currentColor"/></svg>
      </button>
      <span class="tb-sep"></span>
      <button type="button" class="tb-btn" title="无序列表" @mousedown.prevent @click="exec('insertUnorderedList')">
        <svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="1.7" fill="currentColor"/><circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="5" cy="18" r="1.7" fill="currentColor"/><path d="M10 6h10M10 12h10M10 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="tb-btn" title="有序列表" @mousedown.prevent @click="exec('insertOrderedList')">
        <svg viewBox="0 0 24 24"><path d="M5.2 5h1.6M5.2 5V4l1-.6M5.2 12h2M5.2 12v-1.4l2-1.4V9M5.2 19h1.6M5.2 19v-1.4l2-1.4V16" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 6h10M10 12h10M10 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="tb-btn" title="插入链接" @mousedown.prevent @click="insertLink">
        <svg viewBox="0 0 24 24"><path d="M9.5 14.5a4.2 4.2 0 0 0 5.9 0l3.1-3.1a4.2 4.2 0 1 0-5.9-5.9l-1.4 1.4M14.5 9.5a4.2 4.2 0 0 0-5.9 0l-3.1 3.1a4.2 4.2 0 1 0 5.9 5.9l1.4-1.4" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/></svg>
      </button>
      <span class="tb-sep"></span>
      <button type="button" class="tb-btn" title="插入图片" @mousedown.prevent @click="imgInput.click()">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.2" stroke="currentColor" stroke-width="1.9" fill="none"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17.5l5-5 3.6 3.6 2.9-2.9 4.5 4.3" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="tb-btn" title="插入视频" @mousedown.prevent @click="onInsertVideo">
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="12.5" height="14" rx="2.2" stroke="currentColor" stroke-width="1.9" fill="none"/><path d="M15.5 10.2l5.5-3v9.6l-5.5-3" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="tb-btn" title="清除格式" @mousedown.prevent @click="clearFormat">
        <svg viewBox="0 0 24 24"><path d="M4 5h16M8 5l-2.6 15M16 5l-1.5 8.5" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/><path d="M4 20h8M15 21l6-6M21 21l-6-6" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/></svg>
      </button>
      <input ref="imgInput" type="file" accept="image/*" hidden @change="onImageFile" />
    </div>
    <div
      ref="editor"
      class="wysiwyg-body"
      :style="minHeight ? { minHeight } : null"
      contenteditable="true"
      :data-placeholder="placeholder"
      @input="onInput"
      @paste="onPaste"
    ></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import api from '../api'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入内容...' },
  minHeight: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const editor = ref(null)
const imgInput = ref(null)

onMounted(() => {
  editor.value.innerHTML = props.modelValue || ''
})
// 外部值变化（如切换编辑对象）时同步编辑区
watch(() => props.modelValue, (v) => {
  if (editor.value && v !== editor.value.innerHTML) editor.value.innerHTML = v || ''
})

function exec(cmd, val) {
  editor.value.focus()
  document.execCommand(cmd, false, val)
}
function formatBlock(tag) {
  editor.value.focus()
  document.execCommand('formatBlock', false, '<' + tag + '>')
}
function clearFormat() {
  editor.value.focus()
  document.execCommand('removeFormat')
  document.execCommand('formatBlock', false, '<p>')
}
function onInput() { emit('update:modelValue', editor.value.innerHTML) }
function onPaste(e) {
  // 粘贴统一转纯文本，避免外部样式漂移
  e.preventDefault()
  const text = (e.clipboardData || window.clipboardData).getData('text/plain')
  document.execCommand('insertText', false, text)
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
async function insertLink() {
  const url = prompt('请输入链接地址（以 http:// 或 https:// 开头）')
  if (!url) return
  if (!/^https?:\/\//i.test(url.trim())) { alert('链接需以 http:// 或 https:// 开头'); return }
  const text = prompt('请输入链接文字', url.trim())
  if (text === null) return
  editor.value.focus()
  document.execCommand('insertHTML', false, `<a href="${url.trim()}" target="_blank" rel="noopener nofollow">${escapeHtml(text.trim() || url.trim())}</a>`)
}

// 图片：压缩后上传再插入
async function onImageFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!/^image\//.test(file.type)) { alert('请选择图片文件'); return }
  if (file.size > 10 * 1024 * 1024) { alert('图片过大，单张最大 10MB'); return }
  try {
    const dataUrl = await compressImage(file)
    const r = await api.post('/upload', { data: dataUrl, name: file.name })
    editor.value.focus()
    document.execCommand('insertHTML', false, `<p><img src="${r.url}" alt="图片" /></p>`)
  } catch (err) { alert(err.message || '图片上传失败') }
}
// 图片压缩：最大宽 1600，JPEG quality 0.85，压缩失败回退原图
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          const MAX_W = 1600
          let w = img.width, h = img.height
          if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          // 小图或带透明度的 PNG 保留原格式，其余转 JPEG
          const keepPng = file.type === 'image/png' && (file.size < 200 * 1024 || /^image\/png$/.test(file.type))
          resolve(canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.85))
        } catch (err) { resolve(reader.result) }
      }
      img.onerror = () => resolve(reader.result)
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 视频：上传本地（≤10MB）或插入链接（mp4 直链 / B站 / 优酷 / 腾讯视频）
async function onInsertVideo() {
  const mode = prompt('选择方式：\n1 = 上传本地视频（单文件 ≤10MB）\n2 = 插入视频链接（mp4 直链或 B站/优酷/腾讯视频页面）')
  if (mode === '1') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/mp4,video/webm,video/ogg'
    input.onchange = async () => {
      const file = input.files[0]
      if (!file) return
      if (!/^video\//.test(file.type)) { alert('请选择视频文件'); return }
      if (file.size > 10 * 1024 * 1024) { alert('视频过大，单文件最大 10MB，建议改用视频链接方式'); return }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(r.result)
          r.onerror = reject
          r.readAsDataURL(file)
        })
        const r = await api.post('/upload', { data: dataUrl, name: file.name })
        insertMediaHtml(`<video controls src="${r.url}"></video>`)
      } catch (err) { alert(err.message || '视频上传失败') }
    }
    input.click()
  } else if (mode === '2') {
    const url = prompt('请输入视频链接（mp4 直链，或 B站/优酷/腾讯视频页面地址）')
    if (!url) return
    const html = parseVideoUrl(url.trim())
    if (!html) { alert('无法识别的视频链接，支持 mp4 直链或 B站/优酷/腾讯视频页面地址'); return }
    insertMediaHtml(html)
  }
}
function insertMediaHtml(html) {
  editor.value.focus()
  document.execCommand('insertHTML', false, `<p>${html}</p>`)
}
function parseVideoUrl(url) {
  const u = url.toLowerCase()
  const bili = url.match(/bilibili\.com\/video\/(BV[\w]+)/i)
  if (bili) return `<iframe src="//player.bilibili.com/player.html?bvid=${bili[1]}&page=1" frameborder="0" allowfullscreen loading="lazy"></iframe>`
  const yk = url.match(/youku\.com\/v_show\/id_([\w=]+)\.html/i)
  if (yk) return `<iframe src="//player.youku.com/embed/${yk[1]}" frameborder="0" allowfullscreen loading="lazy"></iframe>`
  const qq = url.match(/v\.qq\.com\/x\/(?:page|cover)\/([\w]+)\.html/i)
  if (qq) return `<iframe src="//v.qq.com/txp/iframe/player.html?vid=${qq[1]}" frameborder="0" allowfullscreen loading="lazy"></iframe>`
  if (/\.(mp4|webm|ogg|m4a)(\?|$)/i.test(u)) return `<video controls src="${url}"></video>`
  return null
}
</script>

<style scoped>
.wysiwyg {
  border: 1px solid #e5dccb;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.wysiwyg-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid #f0e9de;
  background: #faf7f0;
}
.tb-btn {
  min-width: 30px;
  height: 28px;
  padding: 0 6px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: #6d5a43;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tb-btn svg {
  width: 17px;
  height: 17px;
  display: block;
  flex-shrink: 0;
}
.tb-btn:hover { background: #efe6d3; }
.tb-btn:active { background: #e2d5ba; }
.tb-sep {
  width: 1px;
  height: 18px;
  background: #e5dccb;
  margin: 5px 4px;
}
.wysiwyg-body {
  min-height: 160px;
  padding: 12px 14px;
  font-size: 15px;
  line-height: 1.8;
  color: #3d2e1c;
  outline: none;
}
.wysiwyg-body:empty::before {
  content: attr(data-placeholder);
  color: #b3a78f;
  pointer-events: none;
}
.wysiwyg-body img { max-width: 100%; border-radius: 8px; margin: 6px 0; }
.wysiwyg-body video { max-width: 100%; border-radius: 8px; background: #000; }
.wysiwyg-body iframe { max-width: 100%; aspect-ratio: 16/9; border-radius: 8px; }
.wysiwyg-body blockquote {
  border-left: 3px solid #d8c9ab;
  margin: 8px 0;
  padding: 6px 12px;
  background: #faf6ee;
  color: #6d5a43;
}
.wysiwyg-body pre { background: #f5f0e6; padding: 10px; border-radius: 8px; overflow-x: auto; }
.wysiwyg-body a { color: #8a6d3b; }
</style>
