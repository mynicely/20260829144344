// 我的订单：订单列表、状态、待付款订单支付/关闭
const api = require('../../utils/api')
const util = require('../../utils/util')
const { statusLabel } = require('../../utils/util')
const app = getApp()

Page({
  data: {
    orders: [],
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const r = await api.get('/order/my')
      const list = (r.data || []).map((o) => ({
        ...o,
        statusText: statusLabel(o.status),
        amountText: util.money(o.amount),
      }))
      this.setData({ orders: list, loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  // 去支付（重新获取订单支付信息）
  async onPayTap(e) {
    const orderNo = e.currentTarget.dataset.no
    try {
      const r = await api.get('/order/' + orderNo)
      const o = r.data
      if (o.status !== 'pending') { util.toast('订单状态已变化'); this.load(); return }
      // 线下收款模式：展示收款信息（来自 /pay/receive-info）
      if (o.pay_mode === 'manual') {
        const r2 = await api.get('/pay/receive-info').catch(() => ({ data: null }))
        const info = r2.data || {}
        const lines = []
        if (info.wechatAccount) lines.push('微信收款：' + info.wechatAccount)
        if (info.alipayAccount) lines.push('支付宝：' + info.alipayAccount)
        if (info.bankName) lines.push('银行：' + info.bankName + ' ' + info.bankAccount + '（' + info.bankHolder + '）')
        if (info.notice) lines.push(info.notice)
        util.confirm('线下转账付款', `应付 ¥${util.money(o.amount)}，请转账后联系管理员确认到账。\n${lines.join('\n')}`, () => {})
        return
      }
      util.toast('请通过课程详情页重新发起支付')
    } catch (e) {
      util.toast(e.message)
    }
  },

  // 关闭待支付订单
  onCloseTap(e) {
    const orderNo = e.currentTarget.dataset.no
    util.confirm('关闭订单', '确定关闭该待支付订单？', async () => {
      try {
        const r = await api.post('/order/' + orderNo + '/close')
        util.success(r.msg)
        this.load()
      } catch (err) { util.toast(err.message) }
    })
  },
})
