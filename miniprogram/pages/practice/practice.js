// 题库练习入口：按课程练习、综合练习、练习历史、错题本
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    courses: [],
    history: [],
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const [c, h] = await Promise.all([
        api.get('/practice/courses'),
        api.get('/practice/history'),
      ])
      this.setData({ courses: c.data || [], history: h.data || [], loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  // 开始综合练习
  onComprehensive() {
    wx.navigateTo({ url: '/pages/practice-quiz/practice-quiz' })
  },

  // 按课程练习
  onCoursePractice(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/practice-quiz/practice-quiz?courseId=' + id })
  },

  goWrong() {
    wx.navigateTo({ url: '/pages/practice-wrong/practice-wrong' })
  },
})
