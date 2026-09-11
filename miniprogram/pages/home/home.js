// 首页：Banner + 8宫格 + 课程卡片 + 学员风采/教学动态 + 底部规则入口
const api = require('../../utils/api')
const util = require('../../utils/util')
const { COMPLIANCE, COURSE_LEVEL } = require('../../utils/constants')
const app = getApp()

Page({
  data: {
    compliance: COMPLIANCE.homeTop,
    banners: [],
    courses: [],
    posts: [],          // 学员风采
    notices: [],        // 教学动态公告（官方帖子）
    grid: [
      { key: 'lesson', label: '线上课程', icon: '课', url: '/pages/lesson/lesson' },
      { key: 'task', label: '学习任务', icon: '练', url: '/pages/task/task' },
      { key: 'homework', label: '我的作业', icon: '作', url: '/pages/my-homework/my-homework' },
      { key: 'practice', label: '题库练习', icon: '题', url: '/pages/practice/practice' },
      { key: 'group', label: '拼团砍价', icon: '拼', url: '/pages/group/group' },
      { key: 'invite', label: '邀请好友', icon: '邀', url: '/pages/invite/invite' },
      { key: 'posts', label: '学员社区', icon: '社', url: '/pages/posts/posts' },
      { key: 'mine', label: '个人中心', icon: '我', url: '/pages/mine/mine' },
    ],
    isShareMode: false,
    loading: true,
  },

  onLoad() {
    this.setData({ isShareMode: app.isShareMode() })
    this.loadData()
  },

  onShow() {
    // 模式切换后刷新置灰状态
    this.setData({ isShareMode: app.isShareMode() })
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    try {
      const [ads, courses, posts] = await Promise.all([
        api.get('/ads').catch(() => ({ data: [] })),
        api.get('/courses'),
        api.get('/community/posts').catch(() => ({ data: [] })),
      ])
      const bannerFallbacks = ['书法课程报名', '免费体验课预约', '学习福利任务中心']
      const banners = (ads.data || []).slice(0, 3).map((b, i) => ({
        ...b,
        // 预计算兜底文案（WXML 不支持函数调用）
        fallbackTitle: bannerFallbacks[i % 3],
      }))
      const levelList = (courses.data || []).map((c) => ({ ...c, levelTag: COURSE_LEVEL[c.level] }))
      this.setData({
        banners,
        courses: levelList,
        posts: (posts.data || []).filter((p) => p.category === 'works' || p.images && p.images.length).slice(0, 6),
        notices: (posts.data || []).filter((p) => p.category === 'activity' || p.category === 'materials').slice(0, 4),
        loading: false,
      })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  onGridTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'invite' && !this.data.isShareMode) {
      // 纯学习模式：邀请好友置灰弱化
      wx.showToast({ title: '当前为纯学习模式，开启分享推广后可使用', icon: 'none' })
      return
    }
    const item = this.data.grid.find((g) => g.key === key)
    if (!item) return
    if (key === 'group') {
      wx.navigateTo({ url: item.url })
    } else {
      wx.navigateTo({ url: item.url })
    }
  },

  onCourseTap(e) {
    wx.navigateTo({ url: '/pages/course-detail/course-detail?id=' + e.currentTarget.dataset.id })
  },

  onPostTap(e) {
    wx.navigateTo({ url: '/pages/post-detail/post-detail?id=' + e.currentTarget.dataset.id })
  },

  goRules() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  },

  goReserve() {
    wx.navigateTo({ url: '/pages/reserve/reserve' })
  },
})
