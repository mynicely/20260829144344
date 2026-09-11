// 拼团：进行中的团列表 + 开团（档位选择、promoter 确认、支付）
// promoter 确认逻辑与 web 端一致：确认后后端强制 forgo_share_reward=1
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    groups: [],
    courses: [],
    groupTiers: [],
    groupMin: 2,
    // 开团表单
    courseId: '',
    tierCount: null,
    selectedCourse: null,
    creating: false,
    // 预计算字段（WXML 不支持函数调用）
    tiers: [],
    bestTierN: null,
    // 确认弹窗
    promoterModal: false,
    confirmCreateModal: false,
    // 支付
    payModalVisible: false,
    receiveInfo: null,
    payOrderNo: '',
    payAmount: 0,
    // 倒计时
    now: Date.now(),
  },

  onLoad(options) {
    if (options.courseId) this.setData({ courseId: String(options.courseId) })
    this.load()
    // 倒计时每秒刷新（数据来自后端 expire_at，前端仅渲染）
    this.timer = setInterval(() => this.refreshCountdowns(), 1000)
  },

  onUnload() { if (this.timer) clearInterval(this.timer) },

  // 刷新拼团列表倒计时（WXML 不能直接调用函数，预计算字段）
  refreshCountdowns() {
    const groups = (this.data.groups || []).map((g) => ({
      ...g,
      remainText: util.countdownText(util.remainSeconds(g.expire_at)),
    }))
    this.setData({ groups })
  },

  async load() {
    try {
      const [m, courses, groups] = await Promise.all([
        api.get('/public/marketing'),
        api.get('/courses'),
        api.get('/group/list').catch(() => ({ data: [] })),
      ])
      const list = (courses.data || []).map((c) => ({
        ...c,
        group_tiers: this.normTiers(c.group_tiers),
      }))
      const tiers = (m.data.groupTiers || []).map((t) => ({ n: Number(t.n || t.count), price: Number(t.price), services: t.services || '', gift: t.gift || '' }))
      this.setData({
        groupTiers: tiers,
        groupMin: m.data.groupMin || 2,
        courses: list,
        groups: groups.data || [],
      })
      this.refreshCountdowns()
      this.applyCourseId(this.data.courseId)
    } catch (e) {
      util.toast(e.message)
    }
  },

  normTiers(gt) {
    if (Array.isArray(gt) && gt.length) {
      return gt.map((t) => ({ n: Number(t.count || t.n), price: Number(t.price), services: t.services || '', gift: t.gift || '' }))
    }
    return null
  },

  applyCourseId(courseId) {
    const c = this.data.courses.find((x) => String(x.id) === String(courseId))
    if (!c) return
    const tiers = c.group_tiers || this.data.groupTiers
    // 预计算当前课程档位与最划算档位（WXML 不支持函数调用）
    const best = tiers.length ? tiers.reduce((a, b) => (b.price < a.price ? b : a)) : null
    this.setData({
      selectedCourse: c,
      courseId: String(c.id),
      tiers,
      bestTierN: best ? best.n : null,
      tierCount: tiers.length ? tiers[0].n : (c.group_min || this.data.groupMin),
    })
  },

  onCourseChange(e) {
    this.applyCourseId(e.detail.value)
  },

  onTierTap(e) {
    this.setData({ tierCount: Number(e.currentTarget.dataset.n) })
  },

  // 开团主流程
  async onCreateTap() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    if (!this.data.selectedCourse) { util.toast('请选择课程'); return }
    // 确保用户信息已加载（首次进入可能为空）
    const me = app.globalData.userInfo || (await app.fetchUser(true)) || null
    // 分享推广身份（promoter）用户参与拼团：需确认放弃本单全部分享奖励
    if (me && me.identity === 'promoter') {
      this.setData({ promoterModal: true })
      return
    }
    this.setData({ confirmCreateModal: true })
  },

  onPromoterConfirm() {
    this.setData({ promoterModal: false })
    this.setData({ confirmCreateModal: true })
  },

  onPromoterCancel() {
    this.setData({ promoterModal: false })
  },

  async doCreate() {
    if (this.data.creating) return
    this.setData({ confirmCreateModal: false, creating: true })
    try {
      const body = { courseId: this.data.selectedCourse.id }
      if (this.data.tierCount) body.tierCount = this.data.tierCount
      const r = await api.post('/group/create', body)
      const tierTip = r.data.tierPrice ? `，本团价 ¥${util.money(r.data.tierPrice)}` : ''
      if (r.data.payMode === 'manual') {
        this.setData({ payModalVisible: true, receiveInfo: r.data.receiveInfo || {}, payOrderNo: r.data.order.order_no, payAmount: r.data.pay })
        return
      }
      if (r.data.payParams) {
        await this.doWxPay(r.data.payParams, r.data.order.order_no, r.data.groupId, tierTip)
        return
      }
      // 模拟支付模式：下单即开团成功
      app.fetchUser(true)
      util.success('开团成功！')
      wx.redirectTo({ url: '/pages/group-detail/group-detail?id=' + r.data.groupId })
    } catch (e) {
      util.toast(e.message)
      this.setData({ creating: false })
    }
  },

  doWxPay(payParams, orderNo, groupId, tierTip) {
    return new Promise((resolve) => {
      wx.requestPayment({
        ...payParams,
        success: async () => {
          const order = await this.waitOrderPaid(orderNo)
          app.fetchUser(true)
          this.setData({ creating: false })
          if (order) {
            util.success('开团成功！')
            wx.redirectTo({ url: '/pages/group-detail/group-detail?id=' + groupId })
          } else {
            util.toast('支付已提交，到账确认中，稍后自动开团')
            wx.redirectTo({ url: '/pages/group-detail/group-detail?id=' + groupId })
          }
          resolve()
        },
        fail: (err) => {
          util.toast((err && err.errMsg && err.errMsg.indexOf('cancel') > -1) ? '已取消支付，订单保留' : '支付失败')
          this.setData({ creating: false })
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

  onGroupTap(e) {
    wx.navigateTo({ url: '/pages/group-detail/group-detail?id=' + e.currentTarget.dataset.id })
  },

  onCancelCreate() { this.setData({ confirmCreateModal: false }) },

  closePayModal() { this.setData({ payModalVisible: false }) },
})
