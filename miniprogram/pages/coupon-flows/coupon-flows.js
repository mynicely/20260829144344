// 抵现金流水：学习任务产出的抵现金（仅抵扣学费，不可提现）收支明细
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

// 与 web 端 CouponFlows.vue typeText 一致
const TYPE_TEXT = {
  task: '打卡/任务',
  order: '课程抵扣',
  reward: '奖励发放',
  refund: '退款返还',
}

Page({
  data: {
    couponBalance: 0,
    totalEarned: 0,
    flows: [],
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const me = await app.fetchUser(true)
      const r = await api.get('/user/coupon-flows')
      this.setData({
        couponBalance: (me && me.couponBalance) || 0,
        totalEarned: (me && me.totalEarned) || 0,
        flows: (r.data || []).map((f) => ({
          ...f,
          amount: f.change_amount,
          typeText: TYPE_TEXT[f.type] || f.type || '其他',
          date: util.formatTime(f.created_at),
        })),
        loading: false,
      })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },
})
