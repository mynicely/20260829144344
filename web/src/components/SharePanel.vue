<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal share-modal">
      <h2 style="margin-bottom:4px;">{{ title }}</h2>
      <p class="muted" style="font-size:13px;margin-bottom:12px;">把链接或海报发给好友，一起享优惠</p>

      <!-- 方式一：复制链接 -->
      <button class="share-row" @click="copyLink">
        <span class="share-ico">📋</span>
        <span style="flex:1;">复制链接，发送给好友</span>
        <span class="muted">›</span>
      </button>

      <!-- 方式二：生成海报 -->
      <button class="share-row" @click="genPoster" :disabled="generating">
        <span class="share-ico">🖼️</span>
        <span style="flex:1;">生成国风海报，保存相册</span>
        <span class="muted">{{ generating ? '生成中…' : '›' }}</span>
      </button>

      <!-- 海报预览 -->
      <div v-if="posterUrl" class="poster-preview">
        <img :src="posterUrl" alt="分享海报" />
        <p class="muted" style="font-size:12px;margin:8px 0;">保存到相册后，可分享到朋友圈/微信群</p>
        <button class="btn btn-block" @click="downloadPoster">💾 下载海报</button>
      </div>

      <button class="btn btn-outline btn-block" style="margin-top:12px;" @click="$emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import QRCode from 'qrcode'
import { dialog } from '../utils/dialog'

const props = defineProps({
  title: { type: String, default: '分享给好友' },
  link: { type: String, required: true },
  posterTitle: { type: String, default: '' },
  posterSub: { type: String, default: '在线学书法 · 平价好课 · 天天练字' },
  posterPrice: { type: String, default: '' },
  posterTip: { type: String, default: '长按识别二维码 · 立即查看' },
  actionText: { type: String, default: '一起学习，天天进步' },
  cover: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const posterUrl = ref('')
const generating = ref(false)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.link)
    alert('链接已复制：' + props.link)
  } catch (e) {
    await dialog.prompt('链接（请长按复制）', props.link)
  }
}

// 多行文字（海报标题折行，最多 2 行）
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = []
  let cur = ''
  for (const ch of String(text)) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) { lines.push(cur); cur = ch }
    else cur += ch
  }
  if (cur) lines.push(cur)
  lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight))
  return lines.length
}

// 用 canvas 绘制国风分享海报（750x1334 竖版宣纸风格，含二维码；与邀请码海报同源但独立参数）
async function genPoster() {
  if (generating.value) return
  generating.value = true
  try {
    const w = 750, h = 1334
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')

    // 背景：宣纸渐变
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#f7ead0')
    bg.addColorStop(1, '#e8d3a8')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // 顶部墨色块
    ctx.fillStyle = '#4e342e'
    ctx.fillRect(60, 70, w - 120, 300)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 76px serif'
    ctx.fillText('翰 墨 书 院', w / 2, 185)
    ctx.font = '34px serif'
    ctx.fillStyle = '#f3e5d0'
    ctx.fillText(props.posterSub, w / 2, 260)
    ctx.fillStyle = '#d7a86e'
    ctx.font = '28px serif'
    ctx.fillText('专业书法名师 · 系统课程体系 · 一对一点评', w / 2, 315)

    // 课程封面（可选；外链无 CORS 时跳过，不影响海报）
    if (props.cover) {
      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = props.cover })
        ctx.fillStyle = '#fff'
        ctx.fillRect(w / 2 - 140, 410, 280, 190)
        ctx.drawImage(img, w / 2 - 130, 420, 260, 170)
      } catch (e) { /* 跳过封面 */ }
    }

    // 主标题（最多 2 行）
    ctx.fillStyle = '#4e342e'
    ctx.font = 'bold 46px sans-serif'
    const titleY = props.cover ? 700 : 500
    const lines = wrapText(ctx, props.posterTitle, w / 2, titleY, 620, 64)
    let nextY = titleY + lines * 64

    // 价格
    if (props.posterPrice) {
      ctx.fillStyle = '#8b4513'
      ctx.font = 'bold 84px sans-serif'
      ctx.fillText(props.posterPrice, w / 2, nextY + 60)
      nextY += 130
    }

    // 二维码
    try {
      const qr = await QRCode.toDataURL(props.link, { margin: 1, width: 340, color: { dark: '#4e342e', light: '#ffffff' } })
      const img = new Image()
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = qr })
      const qrY = Math.max(760, nextY + 40)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(w / 2 - 180, qrY, 360, 360)
      ctx.drawImage(img, w / 2 - 170, qrY + 10, 340, 340)
      ctx.fillStyle = '#4e342e'
      ctx.font = '30px sans-serif'
      ctx.fillText(props.posterTip, w / 2, qrY + 420)
    } catch (e) { /* 二维码生成失败不影响海报 */ }

    // 行动文案
    ctx.fillStyle = '#4e342e'
    ctx.font = 'bold 32px serif'
    ctx.fillText(props.actionText, w / 2, 1190)

    // 底部装饰条
    ctx.fillStyle = '#4e342e'
    ctx.fillRect(0, h - 60, w, 60)

    posterUrl.value = canvas.toDataURL('image/png')
  } catch (e) {
    alert('海报生成失败，请重试')
  } finally {
    generating.value = false
  }
}

function downloadPoster() {
  const a = document.createElement('a')
  a.href = posterUrl.value
  a.download = '翰墨书院分享海报.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
</script>

<style scoped>
.share-modal { text-align: left; }
.share-row {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  padding: 13px 14px;
  margin-bottom: 10px;
  background: #fdf9f0;
  border: 1px solid #e8d9bd;
  border-radius: 12px;
  font-size: 14px; color: var(--ink);
  cursor: pointer;
  transition: background .2s, transform .15s;
}
.share-row:active { transform: scale(.98); }
.share-row:disabled { opacity: .6; }
.share-ico { font-size: 18px; }
.poster-preview {
  margin-top: 8px;
  text-align: center;
}
.poster-preview img {
  width: 100%; max-width: 300px;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .22);
}
</style>
