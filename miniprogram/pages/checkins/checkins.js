// 打卡记录：展示练字打卡与学情复盘记录（数据来自后端 task/my-learning）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

const LABELS = {
  calligraphy: { label: '练字打卡', icon: '字' },
  review: { label: '学情复盘', icon: '悟' },
  class: { label: '课堂签到', icon: '堂' },
}

Page({
  data: {
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
      const r = await api.get('/task/my-learning')
      const list = (r.data || []).map((t) => ({ ...t, meta: LABELS[t.task_type] || { label: t.task_type, icon: '卡' } }))
      this.setData({ list, loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },
})
