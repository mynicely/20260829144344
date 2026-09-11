// 课程详情：价格区 + 二选一弹窗 + 拼团/砍价入口
// 业务 JS 与 web 端完全一致（仅 UI 美化）：forgo_share_reward 原样传递给后端
const api = require('../../utils/api')
const util = require('../../utils/util')
const { COMPLIANCE, COURSE_LEVEL } = require('../../utils/constants')
const app = getApp()

Page({
  data: {
    id: null,
    course: null,
    chapters: [],
    reviews: [],
    faq: [],
    covers: [],
    curCover: 0,
    couponBalance: 0,
    compliance: COMPLIANCE.courseBottom,
    // 下单状态
    showIdentity: false,     // 二选一弹窗
    showConfirm: false,      // 参与分享有奖二次确认
    buying: false,
    payModalVisible: false,
    receiveInfo: null,
    payOrderNo: '',
    payAmount: 0,
  },

  onLoad(options) {
    this.setData({ id: Number(options.id) })
    this.load()
  },

  async load() {
    try {
      const c = (await api.get('/courses/' + this.data.id)).data
      const covers = this.parseCovers(c.cover)
      let faq = []
      try { faq = JSON.parse(c.faq || '[]') } catch (e) { faq = [] }
      this.setData({
        course: { ...c, levelTag: COURSE_LEVEL[c.level] || { text: c.level, cls: '' } },
        covers,
        faq: Array.isArray(faq) ? faq : [],
        curCover: 0,
      })
      this.setData({ navigationBarTitle: '' })
      wx.setNavigationBarTitle({ title: c.title || '课程详情' })
      // 课程大纲
      api.get('/course/' + this.data.id + '/chapters').then((r) => {
        this.setData({ chapters: (r.data && r.data.chapters) || [] })
      }).catch(() => {})
      // 评价（stars 预计算：WXML 不支持 '★'.repeat() 函数调用）
      api.get('/course/' + this.data.id + '/reviews').then((r) => {
        const reviews = (r.data || []).map((v) => ({
          ...v,
          stars: '★'.repeat(Math.min(5, Math.max(1, Number(v.rating) || 5))),
        }))
        this.setData({ reviews })
      }).catch(() => {})
      // 用户抵现金余额
      if (app.isLogin()) {
        const me = await app.fetchUser(true)
        this.setData({ couponBalance: (me && me.couponBalance) || 0 })
      }
    } catch (e) {
      util.toast(e.message)
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  parseCovers(cover) {
    if (!cover) return []
    if (typeof cover === 'string') {
      try {
        const arr = JSON.parse(cover)
        return Array.isArray(arr) ? arr : [cover]
      } catch (e) { return [cover] }
    }
    return cover
  },

  onCoverTap() {
    const n = this.data.covers.length
    if (n <= 1) return
    this.setData({ curCover: (this.data.curCover + 1) % n })
  },

  // 是否触发分享二选一（≥499 且为课程）
  isFissionCourse() {
    const c = this.data.course
    return c && c.type === 'course' && Number(c.price) >= 499
  },

  // 立即报名
  onBuyTap() {
    if (!app.isLogin()) {
      util.toast('请先登录')
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    if (this.data.buying) return
    if (this.isFissionCourse()) {
      this.setData({ showIdentity: true })
    } else {
      this.doBuy({})
    }
  },

  // 二选一：放弃本单分享奖励（普通消费者，直接下单）
  onConfirmForgo() {
    this.setData({ showIdentity: false })
    this.doBuy({ joinFission: false, forgoShareReward: 1, newReferrerId: null })
  },

  // 二选一：参与分享有奖（先二次确认，防误触）
  onChooseShare() {
    this.setData({ showIdentity: false, showConfirm: true })
  },

  // 二次确认 → 确认参与
  onConfirmShareJoin() {
    this.setData({ showConfirm: false })
    this.doBuy({ joinFission: true, forgoShareReward: 0, newReferrerId: null })
  },

  async doBuy(payload) {
    if (this.data.buying) return
    this.setData({ buying: true })
    const c = this.data.course
    try {
      const r = await api.post('/order', {
        productType: c.level,
        couponUsed: 0,
        courseId: c.id,
        ...payload,
      })
      // 线下确认收款模式：展示收款信息，等待管理员确认到账后开通
      if (r.data.payMode === 'manual') {
        this.setData({ payModalVisible: true, receiveInfo: r.data.receiveInfo || {}, payOrderNo: r.data.order.order_no, payAmount: r.data.pay })
        return
      }
      // 真实微信支付模式：后端返回 payParams，前端调起支付
      if (r.data.payParams) {
        await this.doWxPay(r.data.payParams, r.data.order.order_no)
        return
      }
      // 模拟支付模式：下单即成功
      util.success('购买成功')
      app.fetchUser(true)
      this.setData({ buying: false })
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
          util.toast('支付成功，正在确认到账...')
          const order = await this.waitOrderPaid(orderNo)
          app.fetchUser(true)
          this.setData({ buying: false })
          if (order) {
            util.success('购买成功')
            setTimeout(() => wx.redirectTo({ url: '/pages/lesson/lesson' }), 600)
          } else {
            util.toast('支付已提交，到账确认中，请稍后在「我的课程」查看')
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

  // 支付后轮询订单状态（与 web 端 waitOrderPaid 一致）
  waitOrderPaid(orderNo, timeoutMs) {
    timeoutMs = timeoutMs || 15000
    const start = Date.now()
    return new Promise((resolve) => {
      const timer = setInterval(async () => {
        try {
          const r = await api.get('/order/' + orderNo)
          if (r.data && r.data.status === 'paid') {
            clearInterval(timer)
            resolve(r.data)
            return
          }
        } catch (e) { /* 继续轮询 */ }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer)
          resolve(null)
        }
      }, 1200)
    })
  },

  // 发起拼团
  goGroup() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    wx.navigateTo({ url: '/pages/group/group?courseId=' + this.data.id })
  },

  // 发起砍价
  goBargain() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    wx.navigateTo({ url: '/pages/bargain/bargain?courseId=' + this.data.id })
  },

  // 讲师介绍展开（富文本内容简化为纯文本展示）
  onCopyInvite() {
    const c = this.data.course
    if (!c) return
    wx.setClipboardData({ data: c.invite_note || c.subtitle || '' })
  },

  closePayModal() { this.setData({ payModalVisible: false }) },
})
