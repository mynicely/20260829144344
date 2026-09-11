<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>

    <div class="card" v-if="me">
      <div class="invite-hero">
        <h2>邀请好友，一起学习</h2>
        <p class="muted" style="color:#f3e5d0;">
          <template v-if="me.identity !== 'promoter'">好友通过你的邀请链接注册，即可建立邀请绑定；购买 499 元课程并选择「分享有奖」成为分享伙伴后，好友成功购课即可获得分享奖励</template>
          <template v-else>好友通过你的邀请注册并购课，你获得分享奖励</template>
        </p>
        <div class="invite-code-box">
          <span class="ic-label">我的邀请码</span>
          <span class="ic-value">{{ me.invite_code || me.id }}</span>
          <button class="btn btn-sm ic-copy" @click="copyLink">复制</button>
        </div>
        <div class="invite-qr">
          <img v-if="meQr" :src="meQr" alt="邀请二维码" />
          <p class="muted" style="color:#f3e5d0;font-size:12px;margin-top:4px;">长按识别二维码，好友扫码注册即建立绑定</p>
        </div>
        <button class="btn" style="background:#fff;color:#8b4513;margin-top:8px;" @click="copyLink">复制邀请链接</button>
        <button class="btn" style="background:#f57c00;color:#fff;margin-top:8px;width:100%;" @click="generatePoster">🖼️ 生成分享海报</button>
        <button v-if="me.identity !== 'promoter'" class="btn" style="background:#fff;color:#8b4513;margin-top:8px;width:100%;" @click="$router.push('/courses')">立即购买 499 升级为分享成员 ›</button>
      </div>
    </div>

    <!-- 分享海报弹层 -->
    <div class="modal-mask" v-if="showPoster" @click.self="showPoster = false">
      <div class="modal" style="text-align:center;">
        <h2>🖼️ 我的邀请海报</h2>
        <p class="muted">长按图片保存到相册，分享到朋友圈/微信群</p>
        <img :src="posterUrl" alt="邀请海报" style="width:100%;max-width:340px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);" />
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-block" @click="downloadPoster">💾 下载海报</button>
          <button class="btn btn-outline btn-block" @click="showPoster = false">关闭</button>
        </div>
      </div>
    </div>

    <div class="card" v-if="data">
      <h2>我的分享数据</h2>
      <div class="fission-stats">
        <div class="stat-box"><p class="price">{{ data.directCount }}</p><p class="muted">直接邀请</p></div>
        <div class="stat-box"><p class="price">{{ data.secondCount }}</p><p class="muted">间接邀请</p></div>
        <div class="stat-box"><p class="price">{{ data.teamCount }}</p><p class="muted">邀请总人数</p></div>
        <div class="stat-box"><p class="price">¥{{ fmtMoney(data.totalEarned) }}</p><p class="muted">累计收益</p></div>
      </div>
    </div>

    <div class="card">
      <h2>直接邀请（{{ data?.directCount || 0 }}）</h2>
      <div v-for="u in data?.directList || []" :key="u.id" class="trial-item">
        <p><b>{{ u.nickname }}</b> <span class="tag">{{ u.is_paid ? '已付费' : '未付费' }}</span></p>
        <p class="muted">{{ u.phone }}｜{{ u.created_at }}</p>
      </div>
      <p v-if="!data?.directList?.length" class="muted">还没有直接邀请，快去分享你的邀请链接吧！</p>
    </div>

    <div class="card">
      <h2>🏆 推广排行榜</h2>
      <div v-for="(u,i) in rank" :key="u.id" class="trial-item">
        <p><span class="rank-no">{{ i + 1 }}</span> {{ u.nickname }} <span class="muted">邀请 {{ u.direct }} 人</span></p>
      </div>
      <p v-if="!rank.length" class="muted">暂无排行数据</p>
    </div>

    <div class="card" style="text-align:center;">
      <h2>💡 如何参与分享</h2>
      <p class="muted" style="text-align:left;line-height:1.8;">
        1. 任何人分享，好友注册即建立邀请绑定（无需付费）<br/>
        2. 购买 499 元课程时选择「💎 分享有奖」，成为分享伙伴<br/>
        3. 分享伙伴名下的好友成功购课，即可获得分享奖励（499元课程对应100元学习激励）<br/>
        4. 帮助好友成长为合格分享伙伴，解锁额外帮扶激励<br/>
        5. 组建学习小组，享受主理人管理待遇<br/>
        <span style="color:#f57c00;">注：邀请人须为分享伙伴方可获得奖励；普通消费者邀请的好友会自动转绑给最近的分享伙伴。</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import QRCode from 'qrcode'
import api from '../api'
import { useUserStore } from '../store'
import { fmtMoney } from '../utils/fmt'

const router = useRouter()
const store = useUserStore()
const me = ref(null)
const data = ref(null)
const rank = ref([])
const showPoster = ref(false)
const posterUrl = ref('')
const meQr = ref('')

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  me.value = await store.fetchMe()
  try { data.value = (await api.get('/user/fission')).data } catch (e) {}
  try { rank.value = (await api.get('/fission/rank')).data } catch (e) {}
  if (me.value) {
    const link = location.origin + '/login?invite=' + (me.value.invite_code || me.value.id)
    try { meQr.value = await QRCode.toDataURL(link, { margin: 1, width: 260, color: { dark: '#4e342e', light: '#ffffff' } }) } catch (e) {}
  }
})

async function copyLink() {
  const link = location.origin + '/login?invite=' + (me.value.invite_code || me.value.id)
  try { await navigator.clipboard.writeText(link); alert('邀请链接已复制：' + link) }
  catch (e) { await dialog.prompt('邀请链接（请长按复制）', link) }
}

// 用 canvas 绘制邀请海报（750x1334 竖版，宣纸风格，含推荐二维码）
async function generatePoster() {
  const w = 750, h = 1334
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const code = me.value.invite_code || me.value.id
  const link = location.origin + '/login?invite=' + code

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
  ctx.fillText('在线学书法 · 平价好课 · 天天练字', w / 2, 260)
  ctx.fillStyle = '#d7a86e'
  ctx.font = '28px serif'
  ctx.fillText('专业书法名师 · 系统课程体系 · 一对一点评', w / 2, 315)

  // 邀请码
  ctx.fillStyle = '#4e342e'
  ctx.font = 'bold 40px sans-serif'
  ctx.fillText('我的邀请码', w / 2, 430)
  ctx.fillStyle = '#8b4513'
  ctx.font = 'bold 130px sans-serif'
  ctx.fillText(String(code), w / 2, 560)

  // 推荐二维码
  try {
    const qr = await QRCode.toDataURL(link, { margin: 1, width: 340, color: { dark: '#4e342e', light: '#ffffff' } })
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = qr })
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(w / 2 - 180, 620, 360, 360)
    ctx.drawImage(img, w / 2 - 170, 630, 340, 340)
  } catch (e) { /* 二维码生成失败不影响海报 */ }

  ctx.fillStyle = '#4e342e'
  ctx.font = '30px sans-serif'
  ctx.fillText('长按识别二维码 · 或复制邀请链接', w / 2, 1030)

  // 邀请链接
  ctx.fillStyle = '#6d4c41'
  ctx.font = '26px sans-serif'
  ctx.fillText(link, w / 2, 1085)

  // 底部说明
  ctx.fillStyle = '#4e342e'
  ctx.font = 'bold 32px serif'
  ctx.fillText('填写邀请码，激活好友权益', w / 2, 1190)

  // 底部装饰条
  ctx.fillStyle = '#4e342e'
  ctx.fillRect(0, h - 60, w, 60)

  posterUrl.value = canvas.toDataURL('image/png')
  showPoster.value = true
}

function downloadPoster() {
  const a = document.createElement('a')
  a.href = posterUrl.value
  a.download = '翰墨书院邀请海报-' + (me.value.invite_code || me.value.id) + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
</script>

<style scoped>
.invite-code-box {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin: 14px 0 4px;
  background: rgba(255, 255, 255, .12);
  border: 1.5px dashed rgba(255, 255, 255, .45);
  border-radius: 12px;
  padding: 12px 14px;
}
.ic-label { font-size: 13px; color: #f3e5d0; }
.ic-value { font-size: 26px; font-weight: 800; letter-spacing: 2px; color: #fff; }
.ic-copy { background: #f57c00; color: #fff; border: none; border-radius: 8px; }
</style>
