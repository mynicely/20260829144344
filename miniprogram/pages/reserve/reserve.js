// 免费体验课预约：表单提交 + 预约记录
const api = require('../../utils/api')
const util = require('../../utils/util')
const { AGE_GROUPS } = require('../../utils/constants')

Page({
  data: {
    name: '',
    phone: '',
    ageGroups: AGE_GROUPS,
    ageIndex: 0,
    subjects: ['软笔书法', '硬笔书法'],
    subjectIndex: 0,
    modes: ['线上直播课', '线下一对一'],
    modeIndex: 0,
    preferTime: '',
    inviteCode: '',
    submitting: false,
    myTrials: [],
    options: null,
  },

  onLoad() {
    this.load()
  },

  async load() {
    try {
      const r = await api.get('/trial/options')
      const o = r.data || {}
      const set = {}
      if (o.ageGroups && o.ageGroups.length) set.ageGroups = o.ageGroups
      if (o.subjects && o.subjects.length) set.subjects = o.subjects
      if (o.modes && o.modes.length) set.modes = o.modes
      if (o.preferTimes && o.preferTimes.length) set.preferTimes = o.preferTimes
      set.options = o
      this.setData(set)
    } catch (e) { /* 使用默认选项 */ }
    api.get('/trial/my').then((r) => this.setData({ myTrials: r.data || [] })).catch(() => {})
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },

  onAgeChange(e) { this.setData({ ageIndex: Number(e.detail.value) }) },
  onSubjectChange(e) { this.setData({ subjectIndex: Number(e.detail.value) }) },
  onModeChange(e) { this.setData({ modeIndex: Number(e.detail.value) }) },

  async onSubmit() {
    const { name, phone, ageGroups, ageIndex, subjects, subjectIndex, modes, modeIndex, preferTime, inviteCode } = this.data
    if (!name.trim()) { util.toast('请输入姓名'); return }
    if (!util.isValidPhone(phone)) { util.toast('请输入正确的手机号'); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await api.post('/trial/book', {
        name: name.trim(),
        phone: phone.trim(),
        ageGroup: ageGroups[ageIndex],
        subject: subjects[subjectIndex],
        mode: modes[modeIndex],
        preferTime,
        inviteCode: inviteCode.trim() || undefined,
      })
      util.success('预约成功，请留意回访电话')
      this.load()
      this.setData({ name: '', phone: '', preferTime: '', inviteCode: '' })
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ submitting: false })
    }
  },

  onMyTrialTap() {
    wx.showToast({ title: '请保持电话畅通，顾问将尽快回访', icon: 'none' })
  },
})
