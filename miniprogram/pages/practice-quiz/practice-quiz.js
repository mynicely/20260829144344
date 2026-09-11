// 答题练习：抽题、作答、计时、交卷
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    courseId: 0,
    courseTitle: '综合练习',
    questions: [],
    answers: {},        // questionId -> 'A' 或 'A,B'
    current: 0,
    elapsed: 0,
    showSubmit: false,
    submitting: false,
  },

  onLoad(options) {
    const courseId = Number(options.courseId) || 0
    this.setData({ courseId })
    this.timer = setInterval(() => this.setData({ elapsed: this.data.elapsed + 1 }), 1000)
    this.start()
  },

  onUnload() { if (this.timer) clearInterval(this.timer) },

  formatElapsed(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`
  },

  async start() {
    try {
      const r = await api.get('/practice/start', { courseId: this.data.courseId, count: 10 })
      this.setData({ questions: r.data.questions || [] })
      if (r.data.questions && r.data.questions.length) {
        wx.setNavigationBarTitle({ title: '答题练习（' + r.data.questions.length + '题）' })
      }
    } catch (e) {
      util.toast(e.message)
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  // 选择选项（single/judge 单选，multi 多选）
  onOptionTap(e) {
    const { qid, key } = e.currentTarget.dataset
    const q = this.data.questions.find((x) => x.id === qid)
    if (!q) return
    const cur = this.data.answers[qid]
    if (q.type === 'multi') {
      const arr = cur ? cur.split(',') : []
      const i = arr.indexOf(key)
      if (i > -1) arr.splice(i, 1)
      else arr.push(key)
      this.setData({ [`answers.${qid}`]: arr.sort().join(',') })
    } else {
      this.setData({ [`answers.${qid}`]: key })
    }
  },

  isSelected(qid, key) {
    const cur = this.data.answers[qid]
    if (!cur) return false
    return cur.split(',').indexOf(key) > -1
  },

  answeredCount() {
    return Object.keys(this.data.answers).length
  },

  prev() { this.setData({ current: Math.max(0, this.data.current - 1) }) },
  next() { this.setData({ current: Math.min(this.data.questions.length - 1, this.data.current + 1) }) },

  onTapQuestion(e) {
    this.setData({ current: Number(e.currentTarget.dataset.i) })
  },

  askSubmit() {
    const n = this.data.questions.length
    if (!n) return
    const done = this.answeredCount()
    if (done < n) {
      util.confirm('还有题目未作答', `已完成 ${done}/${n} 题，确定交卷？`, () => this.setData({ showSubmit: true }))
    } else {
      this.setData({ showSubmit: true })
    }
  },

  async doSubmit() {
    if (this.data.submitting) return
    this.setData({ submitting: true, showSubmit: false })
    try {
      const answers = this.data.questions.map((q) => ({
        questionId: q.id,
        answer: this.data.answers[q.id] || '',
      }))
      const r = await api.post('/practice/submit', {
        courseId: this.data.courseId,
        courseTitle: this.data.courseTitle,
        duration: this.data.elapsed,
        answers,
      })
      // 结果数据较大，用本地缓存传给成绩页
      wx.setStorageSync('practice_result', r.data)
      wx.redirectTo({ url: '/pages/practice-result/practice-result' })
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ submitting: false })
    }
  },

  onCancelSubmit() { this.setData({ showSubmit: false }) },
})
