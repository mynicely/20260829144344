// 学习任务中心：今日任务、打卡日历、阶梯奖励、提交作业
const api = require('../../utils/api')
const util = require('../../utils/util')
const { COMPLIANCE } = require('../../utils/constants')
const app = getApp()

Page({
  data: {
    compliance: COMPLIANCE.taskBottom,
    today: '',
    done: {},
    streak: 0,
    monthCount: 0,
    bonus: [],
    taskDefs: [],
    days: [],
    calendar: [],
    // 提交弹窗
    activeTask: null,      // calligraphy/review 类型
    showSubmit: false,
    content: '',
    image: '',
    submitting: false,
    // 历史记录
    myLearning: [],
  },

  onShow() {
    if (!app.isLogin()) {
      wx.showModal({
        title: '请先登录',
        content: '登录后参与学习任务，可获抵现金奖励',
        confirmText: '去登录',
        success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }) },
      })
      return
    }
    this.load()
  },

  async load() {
    try {
      const [todayR, myR] = await Promise.all([
        api.get('/task/today'),
        api.get('/task/my-learning').catch(() => ({ data: [] })),
      ])
      const t = todayR.data
      const cal = this.buildCalendar(t.days || [], t.today)
      const done = t.done || {}
      this.setData({
        today: t.today,
        done,
        todayDoneCount: Object.keys(done).filter((k) => done[k]).length,
        streak: t.streak || 0,
        monthCount: t.monthCount || 0,
        bonus: t.bonus || [],
        taskDefs: t.taskDefs || [],
        calendar: cal,
        myLearning: myR.data || [],
      })
    } catch (e) {
      util.toast(e.message)
    }
  },

  // 最近35天打卡日历（5行x7列），纯前端渲染，数据来自后端 days
  buildCalendar(days, todayStr) {
    const set = {}
    ;(days || []).forEach((d) => { set[d] = true })
    const today = new Date(todayStr ? todayStr.replace(/-/g, '/') : Date.now())
    const cells = []
    // 从今天往前推 34 天
    for (let i = 34; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const key = `${y}-${m}-${day}`
      cells.push({ key, day: d.getDate(), done: !!set[key], isToday: key === todayStr })
    }
    return cells
  },

  // 课堂签到：直接打卡
  async onClassCheckin() {
    if (this.data.done['class']) { util.toast('今日课堂签到已完成'); return }
    try {
      const r = await api.post('/task/checkin-by-action', { taskType: 'class' })
      util.success(r.msg)
      this.load()
    } catch (e) { util.toast(e.message) }
  },

  // 练字/复盘：打开展示提交弹窗
  onTaskTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'class') { this.onClassCheckin(); return }
    if (this.data.done[key]) { util.toast('今日该打卡已完成'); return }
    this.setData({ activeTask: key, showSubmit: true, content: '', image: '' })
  },

  onContentInput(e) { this.setData({ content: e.detail.value }) },

  // 选择并上传练字图片
  async onChooseImage() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'] })
      const filePath = res.tempFiles[0].tempFilePath
      util.toast('上传中...')
      const url = await api.upload(filePath)
      this.setData({ image: url })
    } catch (e) {
      if (!String(e && e.message || e).includes('cancel')) util.toast('图片上传失败')
    }
  },

  async onSubmit() {
    const t = this.data.activeTask
    if (!t) return
    if (t === 'calligraphy' && !this.data.image) { util.toast('练字打卡需先上传练字作业图片'); return }
    if (t === 'review' && !this.data.content.trim()) { util.toast('学情复盘需先写下学习心得'); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const body = { taskType: t, content: this.data.content.trim(), image: this.data.image || undefined, checkinType: t }
      const r = await api.post('/task/learning', body)
      util.success(r.msg)
      this.setData({ showSubmit: false, submitting: false })
      this.load()
    } catch (e) {
      util.toast(e.message)
      this.setData({ submitting: false })
    }
  },

  onCloseSubmit() { this.setData({ showSubmit: false }) },

  goHomework() { wx.navigateTo({ url: '/pages/my-homework/my-homework' }) },
  goCheckins() { wx.navigateTo({ url: '/pages/checkins/checkins' }) },
})
