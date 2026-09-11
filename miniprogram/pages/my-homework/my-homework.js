// 我的作业：展示已提交的练字作业（图片）与学习心得
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    list: [],
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) {
      wx.showModal({
        title: '请先登录',
        content: '登录后查看我的作业',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }) },
      })
      return
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const r = await api.get('/task/my-learning')
      this.setData({ list: r.data || [], loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  // 预览作业大图
  onPreview(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },

  goSubmit() {
    wx.navigateTo({ url: '/pages/task/task' })
  },
})
