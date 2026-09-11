// 拼团详情：成团进度、团员列表、倒计时、参团（promoter 确认）
const api = require('../../utils/api')
const util = require('../../utils/util')
const { setupPoster } = require('../../utils/sharePoster')
const app = getApp()

Page({
  data: {
    id: null,
    group: null,
    members: [],
    isMine: false,
    joining: false,
    promoterModal: false,
    confirmJoinModal: false,
    now: Date.now(),
  },

  onLoad(options) {
    this.setData({ id: Number(options.id) })
    this.timer = setInterval(() => this.refreshCountdown(), 1000)
    this.load()
  },

  onUnload() { if (this.timer) clearInterval(this.timer) },

  // 刷新倒计时字段（WXML 不支持函数调用，预计算）
  refreshCountdown() {
    const g = this.data.group
    if (!g) return
    this.setData({ 'group.remainText': util.countdownText(util.remainSeconds(g.expire_at)) })
  },

  async load() {
    try {
      const r = await api.get('/group/' + this.data.id)
      const me = app.globalData.userInfo || (await app.fetchUser(true)) || null
      const g = r.data
      this.setData({
        group: {
          ...g,
          // 成团进度百分比（预计算）
          pctValue: Math.min(100, Math.round((g.member_count / Math.max(1, g.min_count)) * 100)),
          remainText: util.countdownText(util.remainSeconds(g.expire_at)),
        },
        members: (g.members || []).map((m) => ({
          ...m,
          avatarChar: String(m.nickname || '友').slice(0, 1),
        })),
        isMine: !!(me && g.leader_user === me.id),
      })
    } catch (e) {
      util.toast(e.message)
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  // 复制拼团链接邀请
  onShare() {
    wx.showShareMenu({ withShareTicket: false })
    wx.showToast({ title: '请点击右上角「···」转发给好友参团', icon: 'none' })
  },

  // 参团
  async onJoinTap() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    if (this.data.joining) return
    const g = this.data.group
    if (!g) return
    if (g.member_count >= g.min_count) { util.toast('该团人数已满'); return }
    // 确保用户信息已加载（首次进入可能为空）
    const me = app.globalData.userInfo || (await app.fetchUser(true)) || null
    // 分享推广身份（promoter）用户参与拼团：需确认放弃本单全部分享奖励
    if (me && me.identity === 'promoter') {
      this.setData({ promoterModal: true })
      return
    }
    this.setData({ confirmJoinModal: true })
  },

  onPromoterConfirm() {
    this.setData({ promoterModal: false, confirmJoinModal: true })
  },

  onPromoterCancel() { this.setData({ promoterModal: false }) },

  async doJoin() {
    if (this.data.joining) return
    this.setData({ joining: true, confirmJoinModal: false })
    try {
      const r = await api.post('/group/join', { groupId: this.data.id })
      util.success(r.msg)
      this.load()
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ joining: false })
    }
  },

  // 团长取消拼团
  onCancelTap() {
    util.confirm('取消拼团', '取消后未成团预付款将原路退回，确认取消？', async () => {
      try {
        const r = await api.post('/group/' + this.data.id + '/cancel')
        util.success(r.msg)
        this.load()
      } catch (e) { util.toast(e.message) }
    })
  },

  onConfirmJoinCancel() { this.setData({ confirmJoinModal: false }) },
})
