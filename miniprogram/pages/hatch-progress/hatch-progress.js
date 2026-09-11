// 孵化任务进度：每名被帮扶新人名下管培生孵化合格进度（数据全部来自后端）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    list: [],
    slotLimit: 2,
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const r = await api.get('/user/help-rewards')
      const list = (r.data || []).map((h) => ({
        ...h,
        // 每名新人最多孵化 slot_limit 名管培生（后端计算，前端仅渲染）
        hatched: h.hatched_count || 0,
        statusText: h.status === 'paid' ? '已发放' : (h.status === 'full' ? '已解锁' : '解锁中'),
      }))
      this.setData({ list, loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  goTrainees() {
    wx.navigateTo({ url: '/pages/trainee-status/trainee-status' })
  },
})
