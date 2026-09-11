// 邀请好友（分享推广中心）：纯学习/分享推广双模式 + 邀请码 + canvas 国风海报 + 好友列表 + 排行榜
const api = require('../../utils/api')
const util = require('../../utils/util')
const { COMPLIANCE } = require('../../utils/constants')
const app = getApp()

Page({
  data: {
    isShareMode: false,
    compliance: COMPLIANCE.invitePure,
    inviteCode: '',
    fission: { directCount: 0, teamCount: 0, totalEarned: 0, directList: [] },
    rank: [],
    posterUrl: '',
    generating: false,
    saving: false,
  },

  onShow() {
    const share = app.isShareMode()
    this.setData({ isShareMode: share })
    if (!app.isLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    if (share) this.load()
  },

  // 纯学习模式 → 引导去「我的」开启
  goMine() {
    // 无原生 tabBar，使用自定义底部导航，reLaunch 重置页面栈
    wx.reLaunch({ url: '/pages/mine/mine' })
  },

  async load() {
    try {
      const me = await app.fetchUser(true)
      if (!me) return
      this.setData({ inviteCode: me.invite_code || '' })
      // 分享数据 + 排行榜（后端数据原样渲染）
      const [f, rank] = await Promise.all([
        api.get('/user/fission').catch(() => ({ data: null })),
        api.get('/fission/rank').catch(() => ({ data: [] })),
      ])
      this.setData({
        fission: {
          directCount: (f.data && f.data.directCount) || 0,
          teamCount: (f.data && f.data.teamCount) || 0,
          totalEarned: (f.data && f.data.totalEarned) || 0,
          directList: ((f.data && f.data.directList) || []).map((x) => ({
            ...x,
            // 头像首字预计算（WXML 不支持 slice() 调用）
            avatarChar: String(x.nickname || '友').slice(0, 1),
          })),
        },
        rank: rank.data || [],
      })
    } catch (e) {
      util.toast(e.message)
    }
  },

  onCopy() {
    const code = this.data.inviteCode
    if (!code) { util.toast('暂无邀请码'); return }
    wx.setClipboardData({
      data: code,
      success() { util.toast('邀请码已复制') },
    })
  },

  // 生成国风分享海报（canvas 2d；书法艺术字体仅用于海报标题，正文用系统无衬线）
  onGenPoster() {
    if (this.data.generating) return
    this.setData({ generating: true })
    wx.showLoading({ title: '生成海报中…', mask: true })
    const query = wx.createSelectorQuery()
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      try {
        if (!res || !res[0] || !res[0].node) {
          wx.hideLoading()
          this.setData({ generating: false })
          util.toast('画布初始化失败，请重试')
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio || 2
        const w = 720
        const h = 1080
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)
        this.drawPoster(ctx, w, h)
      } catch (e) {
        wx.hideLoading()
        this.setData({ generating: false })
        util.toast('海报生成失败')
      }
    })
  },

  drawPoster(ctx, w, h) {
    const code = this.data.inviteCode || '请先获取邀请码'
    // 宣纸底色
    ctx.fillStyle = '#F8F5F0'
    ctx.fillRect(0, 0, w, h)
    // 暗纹：仿宣纸细线
    ctx.strokeStyle = 'rgba(74, 99, 116, 0.06)'
    ctx.lineWidth = 1
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    // 顶部朱砂印章式色带
    ctx.fillStyle = '#C82423'
    ctx.fillRect(0, 0, w, 14)
    ctx.fillRect(0, h - 14, w, 14)
    // 主标题（书法艺术字体：仅海报标题允许）
    ctx.fillStyle = '#1A1A1A'
    ctx.textAlign = 'center'
    ctx.font = 'bold 64px "STKaiti", serif'
    ctx.fillText('翰墨书院', w / 2, 140)
    ctx.font = '28px "STKaiti", serif'
    ctx.fillStyle = '#4A6374'
    ctx.fillText('—— 在线学书法 · 天天练字 ——', w / 2, 200)
    // 副标题（正文系统无衬线）
    ctx.fillStyle = '#888888'
    ctx.font = '26px sans-serif'
    ctx.fillText('邀请好友一起学书法，双方同享福利', w / 2, 250)
    // 邀请码区
    ctx.fillStyle = 'rgba(200, 36, 35, 0.06)'
    ctx.strokeStyle = 'rgba(200, 36, 35, 0.4)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(100, 300)
    ctx.lineTo(w - 100, 300)
    ctx.lineTo(w - 100, 440)
    ctx.lineTo(100, 440)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#4A6374'
    ctx.font = '28px sans-serif'
    ctx.fillText('我的邀请码', w / 2, 350)
    ctx.fillStyle = '#C82423'
    ctx.font = 'bold 72px sans-serif'
    ctx.fillText(code, w / 2, 420)
    // 装饰印章（画一个简单的方印）
    ctx.fillStyle = '#C82423'
    ctx.save()
    ctx.translate(w / 2, 560)
    ctx.rotate(-0.08)
    ctx.fillRect(-70, -70, 140, 140)
    ctx.fillStyle = '#F8F5F0'
    ctx.font = '56px "STKaiti", serif'
    ctx.fillText('书', 0, 22)
    ctx.restore()
    // 说明文案
    ctx.fillStyle = '#4A6374'
    ctx.font = '26px sans-serif'
    ctx.fillText('好友注册时填写此邀请码，即建立邀请关系', w / 2, 700)
    ctx.fillStyle = '#C82423'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText('好友购课，邀请人可得分享奖励', w / 2, 760)
    // 底部合规小字（评审要求保留）
    ctx.fillStyle = '#aaaaaa'
    ctx.font = '22px sans-serif'
    ctx.fillText('推广权益为平台赠与，具体以平台规则公示为准', w / 2, h - 80)
    // 转图片
    wx.canvasToTempFilePath({
      canvas,
      success: (r) => {
        wx.hideLoading()
        this.setData({ posterUrl: r.tempFilePath, generating: false })
        util.toast('海报已生成')
      },
      fail: () => {
        wx.hideLoading()
        this.setData({ generating: false })
        util.toast('海报生成失败')
      },
    })
  },

  // 保存海报到相册（做好授权异常处理）
  onSavePoster() {
    if (!this.data.posterUrl) { util.toast('请先生成海报'); return }
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterUrl,
      success: () => {
        this.setData({ saving: false })
        util.toast('已保存到相册')
      },
      fail: (err) => {
        this.setData({ saving: false })
        if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请前往设置开启相册权限后再试',
            confirmText: '去设置',
            cancelText: '取消',
            success: (r) => {
              if (r.confirm) wx.openSetting()
            },
          })
        } else {
          util.toast('保存失败，请重试')
        }
      },
    })
  },
})
