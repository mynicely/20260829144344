// 错题本：做错的题目集中复习（含正确答案与解析）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    list: [],
    loading: true,
  },

  onLoad() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const r = await api.get('/practice/wrong')
      this.setData({ list: r.data || [], loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },
})
