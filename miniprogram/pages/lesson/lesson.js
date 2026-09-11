// 线上课程学习：我的课程列表 + 章节学习进度 + 标记完成
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    courses: [],
    expandedId: null,   // 展开的课程 id
    chapters: [],
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) {
      this.setData({ courses: [], loading: false })
      wx.showModal({
        title: '请先登录',
        content: '登录后可查看已购课程与学习进度',
        confirmText: '去登录',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/login/login' })
        },
      })
      return
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const r = await api.get('/user/my-courses')
      const list = (r.data || []).map((o) => ({
        ...o,
        course: o.course || null,
        progress: o.course ? Math.round((o.course.chapterDone / Math.max(1, o.course.chapterTotal)) * 100) : 0,
      }))
      this.setData({ courses: list, loading: false })
      // 展开的课程刷新章节
      if (this.data.expandedId) this.loadChapters(this.data.expandedId, false)
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  async loadChapters(courseId, toggle) {
    if (toggle && this.data.expandedId === courseId) {
      this.setData({ expandedId: null, chapters: [] })
      return
    }
    try {
      const r = await api.get('/course/' + courseId + '/chapters')
      this.setData({ expandedId: courseId, chapters: r.data.chapters || [] })
    } catch (e) {
      util.toast(e.message)
    }
  },

  onCourseTap(e) {
    const id = e.currentTarget.dataset.id
    this.loadChapters(id, true)
  },

  // 查看章节内容
  onChapterTap(e) {
    const ch = e.currentTarget.dataset.ch
    if (!ch || !ch.content) {
      util.toast('该章节暂无内容')
      return
    }
    wx.showModal({
      title: ch.title,
      content: ch.content,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  // 标记完成 / 取消完成
  onToggleDone(e) {
    const { courseId, chapterId, done } = e.currentTarget.dataset
    api.post(`/course/${courseId}/chapters/${chapterId}/done`, { done: !done })
      .then((r) => {
        util.success(r.msg)
        this.loadChapters(courseId, false)
        this.load()
      })
      .catch((err) => util.toast(err.message))
  },

  goBuy() {
    wx.navigateTo({ url: '/pages/home/home' })
  },
})
