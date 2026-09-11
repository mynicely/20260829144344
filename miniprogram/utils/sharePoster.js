// 国风分享海报通用绘制与保存（课程/拼团/砍价三套分享复用，与邀请码分享相互独立）

function splitLines(ctx, text, maxWidth) {
  const arr = []
  let cur = ''
  for (const ch of String(text || '')) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) { arr.push(cur); cur = ch }
    else cur += ch
  }
  if (cur) arr.push(cur)
  return arr
}

// 绘制 720x1080 竖版国风海报
function drawSharePoster(ctx, w, h, o) {
  // 宣纸底色
  ctx.fillStyle = '#F8F5F0'
  ctx.fillRect(0, 0, w, h)
  // 暗纹横线
  ctx.strokeStyle = 'rgba(74, 99, 116, 0.05)'
  ctx.lineWidth = 1
  for (let y = 20; y < h; y += 26) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }
  // 上下朱砂色带
  ctx.fillStyle = '#C82423'
  ctx.fillRect(0, 0, w, 12)
  ctx.fillRect(0, h - 12, w, 12)
  // 品牌
  ctx.fillStyle = '#1A1A1A'
  ctx.textAlign = 'center'
  ctx.font = 'bold 68px "STKaiti", serif'
  ctx.fillText('翰 墨 书 院', w / 2, 130)
  ctx.font = '26px "STKaiti", serif'
  ctx.fillStyle = '#4A6374'
  ctx.fillText('—— ' + (o.slogan || '在线学书法 · 平价好课 · 天天练字') + ' ——', w / 2, 190)
  // 副标题
  if (o.sub) {
    ctx.fillStyle = '#888888'
    ctx.font = '24px sans-serif'
    ctx.fillText(o.sub, w / 2, 250)
  }
  // 标题框
  const boxY = 300
  ctx.fillStyle = 'rgba(200, 36, 35, 0.06)'
  ctx.strokeStyle = 'rgba(200, 36, 35, 0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(70, boxY); ctx.lineTo(w - 70, boxY)
  ctx.lineTo(w - 70, boxY + 200); ctx.lineTo(70, boxY + 200)
  ctx.closePath()
  ctx.fill(); ctx.stroke()
  // 主标题（最多两行）
  const lines = splitLines(ctx, o.title || '好课推荐', w - 200)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = 'bold 36px "STKaiti", serif'
  lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, boxY + 70 + i * 52))
  // 价格
  if (o.price) {
    ctx.fillStyle = '#C82423'
    ctx.font = 'bold 64px sans-serif'
    ctx.fillText(o.price, w / 2, boxY + 180)
  }
  // 印章
  ctx.fillStyle = '#C82423'
  ctx.save()
  ctx.translate(w / 2, 640)
  ctx.rotate(-0.08)
  ctx.fillRect(-60, -60, 120, 120)
  ctx.fillStyle = '#F8F5F0'
  ctx.font = 'bold 60px "STKaiti", serif'
  ctx.fillText('荐', 0, 22)
  ctx.restore()
  // 提示与行动
  ctx.fillStyle = '#4A6374'
  ctx.font = '26px sans-serif'
  ctx.fillText(o.tip || '长按识别小程序码，立即查看', w / 2, 770)
  ctx.fillStyle = '#C82423'
  ctx.font = 'bold 34px "STKaiti", serif'
  ctx.fillText(o.action || '一起学习，天天进步', w / 2, 840)
  // 底部合规
  ctx.fillStyle = '#aaaaaa'
  ctx.font = '22px sans-serif'
  ctx.fillText('推广权益为平台赠与，具体以平台规则公示为准', w / 2, h - 70)
}

// 向 Page 实例注入 onGenPoster / onSavePoster（canvas type=2d 模式）
function setupPoster(page, canvasId, getOption) {
  page.onGenPoster = function () {
    if (this.data.generating) return
    this.setData({ generating: true })
    wx.showLoading({ title: '生成海报中…', mask: true })
    const query = wx.createSelectorQuery().in(this)
    query.select('#' + canvasId).fields({ node: true, size: true }).exec((res) => {
      try {
        if (!res || !res[0] || !res[0].node) throw new Error('canvas node not found')
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : (wx.getSystemInfoSync().pixelRatio || 2))
        const w = 720
        const h = 1080
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)
        drawSharePoster(ctx, w, h, getOption.call(this) || {})
        wx.canvasToTempFilePath({
          canvas,
          success: (r) => {
            wx.hideLoading()
            this.setData({ posterUrl: r.tempFilePath, generating: false })
            wx.showToast({ title: '海报已生成', icon: 'success' })
          },
          fail: () => {
            wx.hideLoading(); this.setData({ generating: false })
            wx.showToast({ title: '海报生成失败', icon: 'none' })
          },
        })
      } catch (e) {
        wx.hideLoading()
        this.setData({ generating: false })
        wx.showToast({ title: '海报生成失败', icon: 'none' })
      }
    })
  }
  page.onSavePoster = function () {
    if (!this.data.posterUrl) { wx.showToast({ title: '请先生成海报', icon: 'none' }); return }
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterUrl,
      success: () => {
        this.setData({ saving: false })
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: (err) => {
        this.setData({ saving: false })
        if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请前往设置开启相册权限后再试',
            confirmText: '去设置',
            cancelText: '取消',
            success: (r) => { if (r.confirm) wx.openSetting() },
          })
        } else {
          wx.showToast({ title: '保存失败，请重试', icon: 'none' })
        }
      },
    })
  }
}

module.exports = { drawSharePoster, setupPoster }
