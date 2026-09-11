// 砍价详情：当前价/底价/进度、帮砍、按底价购买（promoter 确认）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    id: null,
    bargain: null,
    helpers: [],
    helping: false,
    buying: false,
    promoterModal: false,
    payModalVisible: false,
    receiveInfo: null,
    payOrderNo: '',
    payAmount: 0,
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
    const b = this.data.bargain
    if (!b) return
    this.setData({ 'bargain.remainText': util.countdownText(util.remainSeconds(b.expire_at)) })
  },

  async load() {
    try {
      const r = await api.get('/bargain/' + this.data.id)
      const b = r.data
      this.setData({
        bargain: {
          ...b,
          // 砍价进度（已砍金额 / 可砍总额，预计算）
          pctValue: this.calcPct(b),
          remainText: util.countdownText(util.remainSeconds(b.expire_at)),
        },
        helpers: (b.helpers || b.records || []).map((h) => ({
          ...h,
          avatarChar: String(h.nickname || '友').slice(0, 1),
        })),
      })
    } catch (e) {
      util.toast(e.message)
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  // 砍价进度
  calcPct(b) {
    if (!b) return 0
    const total = Number(b.price || 0) - Number(b.floor_price || 0)
    if (total <= 0) return 100
    const cut = Number(b.price || 0) - Number(b.current_price || b.price || 0)
    return Math.min(100, Math.round((cut / total) * 100))
  },

  // 帮好友砍一刀
  async onHelpTap() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    if (this.data.helping || this.data.bargain.status !== 'active') return
    this.setData({ helping: true })
    try {
      const r = await api.post('/bargain/' + this.data.id + '/help')
      util.success(r.msg)
      this.load()
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ helping: false })
    }
  },

  // 复制砍价链接
  onCopy() {
    wx.setClipboardData({ data: '我正在「翰墨书院」砍价购课，快帮我砍一刀！' })
  },

  // 按当前价购买
  async onBuyTap() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    if (this.data.buying) return
    const b = this.data.bargain
    if (!b || b.status !== 'active') { util.toast('砍价已结束'); return }
    // 确保用户信息已加载（首次进入可能为空）
    const me = app.globalData.userInfo || (await app.fetchUser(true)) || null
    // 分享推广身份（promoter）用户参与砍价购买：需确认放弃本单全部分享奖励
    if (me && me.identity === 'promoter') {
      this.setData({ promoterModal: true })
      return
    }
    this.doBuy()
  },

  onPromoterConfirm() {
    this.setData({ promoterModal: false })
    this.doBuy()
  },

  onPromoterCancel() { this.setData({ promoterModal: false }) },

  async doBuy() {
    if (this.data.buying) return
    this.setData({ buying: true })
    try {
      const r = await api.post('/bargain/' + this.data.id + '/buy')
      if (r.data.payMode === 'manual') {
        this.setData({ payModalVisible: true, receiveInfo: r.data.receiveInfo || {}, payOrderNo: r.data.order.order_no, payAmount: r.data.pay })
        return
      }
      if (r.data.payParams) {
        await this.doWxPay(r.data.payParams, r.data.order.order_no)
        return
      }
      app.fetchUser(true)
      util.success('购买成功')
      this.setData({ buying: false })
      setTimeout(() => wx.redirectTo({ url: '/pages/lesson/lesson' }), 600)
    } catch (e) {
      util.toast(e.message)
      this.setData({ buying: false })
    }
  },

  doWxPay(payParams, orderNo) {
    return new Promise((resolve) => {
      wx.requestPayment({
        ...payParams,
        success: async () => {
          const order = await this.waitOrderPaid(orderNo)
          app.fetchUser(true)
          this.setData({ buying: false })
          if (order) {
            util.success('购买成功')
            setTimeout(() => wx.redirectTo({ url: '/pages/lesson/lesson' }), 600)
          } else {
            util.toast('支付已提交，到账确认中')
          }
          resolve()
        },
        fail: (err) => {
          util.toast((err && err.errMsg && err.errMsg.indexOf('cancel') > -1) ? '支付已取消' : '支付失败')
          this.setData({ buying: false })
          resolve()
        },
      })
    })
  },

  waitOrderPaid(orderNo, timeoutMs) {
    timeoutMs = timeoutMs || 15000
    const start = Date.now()
    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        try {
          const r = await api.get('/order/' + orderNo)
          if (r.data && r.data.status === 'paid') { clearInterval(timer); resolve(r.data); return }
        } catch (e) { /* 继续轮询 */ }
        if (Date.now() - start >= timeoutMs) { clearInterval(timer); resolve(null) }
      }, 1200)
    })
  },

  closePayModal() { this.setData({ payModalVisible: false }) },
})
