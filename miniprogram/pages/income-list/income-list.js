// 收益明细总览：可提现分享奖励 vs 抵现金余额（两个资产隔离展示）+ 分类明细
const api = require('../../utils/api')
const util = require('../../utils/util')
const { INCOME_TYPES } = require('../../utils/constants')
const app = getApp()

const TABS = [
  { key: 'direct', label: '介绍奖励' },
  { key: 'help', label: '培育奖' },
  { key: 'allowance', label: '主理人待遇' },
  { key: 'coupon', label: '抵现金' },
  { key: 'withdraw', label: '提现记录' },
]

Page({
  data: {
    tabs: TABS,
    activeTab: 'direct',
    activeTabLabel: '介绍奖励',
    wallet: null,
    couponBalance: 0,
    incomeTypes: INCOME_TYPES,
    list: [],
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
      const w = await api.get('/user/wallet').catch(() => ({ data: null }))
      this.setData({
        wallet: w.data,
        couponBalance: (me && me.couponBalance) || 0,
      })
      await this.switchTab(this.data.activeTab)
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  onTabTap(e) {
    this.switchTab(e.currentTarget.dataset.key)
  },

  async switchTab(key) {
    this.setData({ activeTab: key, activeTabLabel: this.tabLabel(key), list: [], loading: true })
    try {
      let list = []
      if (key === 'direct') {
        list = (await api.get('/user/commissions')).data || []
      } else if (key === 'help') {
        list = (await api.get('/user/help-rewards')).data || []
      } else if (key === 'allowance') {
        list = (await api.get('/user/allowances')).data || []
      } else if (key === 'coupon') {
        list = (await api.get('/user/coupon-flows')).data || []
      } else if (key === 'withdraw') {
        list = (await api.get('/user/withdrawals')).data || []
      }
      list = list.map((it) => this.decorate(key, it))
      this.setData({ list, loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  // 按类型装饰每条记录（字段全部来自后端）
  decorate(key, it) {
    if (key === 'direct') return { ...it, amount: it.amount, statusText: it.status === 'paid' ? '已到账' : '处理中', date: util.formatTime(it.created_at) }
    if (key === 'help') return { ...it, amount: it.amount, statusText: it.status === 'paid' ? '已发放' : (it.status === 'full' ? '已解锁' : '未解锁'), date: util.formatTime(it.created_at) }
    if (key === 'allowance') return { ...it, amount: it.amount, statusText: it.status === 'paid' ? '已发放' : '待发放', date: util.formatTime(it.created_at) }
    if (key === 'coupon') return { ...it, amount: it.change_amount, statusText: it.type, date: util.formatTime(it.created_at), remark: it.remark }
    if (key === 'withdraw') return { ...it, amount: '-' + it.amount, statusText: it.status, date: util.formatTime(it.created_at) }
    return it
  },

  // Tab 名称（WXML 不支持函数调用，预计算到 activeTabLabel）
  tabLabel(key) {
    const t = this.data.tabs.find((x) => x.key === key)
    return t ? t.label : ''
  },

  // 提现
  goWithdraw() {
    wx.navigateTo({ url: '/pages/withdrawals/withdrawals' })
  },
})
