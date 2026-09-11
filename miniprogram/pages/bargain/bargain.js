// 砍价：我的砍价列表 + 发起砍价
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    bargains: [],
    courses: [],
    courseId: '',
    selectedCourse: null,
    starting: false,
    now: Date.now(),
  },

  onLoad(options) {
    if (options.courseId) this.setData({ courseId: String(options.courseId) })
    this.timer = setInterval(() => this.refreshCountdowns(), 1000)
    this.load()
  },

  onUnload() { if (this.timer) clearInterval(this.timer) },

  // 刷新砍价列表倒计时（WXML 不支持函数调用，预计算字段）
  refreshCountdowns() {
    const bargains = (this.data.bargains || []).map((b) => ({
      ...b,
      remainText: util.countdownText(util.remainSeconds(b.expire_at)),
    }))
    this.setData({ bargains })
  },

  async load() {
    try {
      const [courses, bargains] = await Promise.all([
        api.get('/courses'),
        api.get('/bargain/my').catch(() => ({ data: [] })),
      ])
      this.setData({
        courses: courses.data || [],
        bargains: bargains.data || [],
      })
      this.refreshCountdowns()
      if (this.data.courseId) {
        const c = this.data.courses.find((x) => String(x.id) === String(this.data.courseId))
        if (c) this.setData({ selectedCourse: c })
      }
    } catch (e) {
      util.toast(e.message)
    }
  },

  onCourseChange(e) {
    const c = this.data.courses.find((x) => String(x.id) === String(e.detail.value))
    this.setData({ selectedCourse: c || null })
  },

  async onStartTap() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    if (!this.data.selectedCourse) { util.toast('请选择课程'); return }
    if (this.data.starting) return
    this.setData({ starting: true })
    try {
      const r = await api.post('/bargain/start', { courseId: this.data.selectedCourse.id })
      util.success('砍价已发起')
      wx.redirectTo({ url: '/pages/bargain-detail/bargain-detail?id=' + r.data.bargainId })
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ starting: false })
    }
  },

  onBargainTap(e) {
    wx.navigateTo({ url: '/pages/bargain-detail/bargain-detail?id=' + e.currentTarget.dataset.id })
  },
})
