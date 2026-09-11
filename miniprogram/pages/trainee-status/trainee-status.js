// 管培生状态：名额进度、滚动考核周期、补位次数（数据全部来自后端，前端只渲染）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

// 月份状态印章
const MONTH_STATUS = {
  qualified: { text: '合格', cls: 'seal-qualified' },
  probation: { text: '见习', cls: 'seal-probation' },
  invalid: { text: '失效', cls: 'seal-invalid' },
  cleared: { text: '已清退', cls: 'seal-void' },
}
// 名额状态印章
const SLOT_STATUS = {
  normal: { text: '正常在岗', cls: 'seal-qualified' },
  frozen: { text: '冻结待补位', cls: 'seal-frozen' },
  void: { text: '永久作废', cls: 'seal-void' },
}

Page({
  data: {
    trainees: [],
    slotProgress: null,
    filling: 0,
    fillModal: false,
    activeTrainee: null,
    loading: true,
  },

  onShow() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const r = await api.get('/user/trainees')
      const list = (r.data || []).map((t) => ({
        ...t,
        month: MONTH_STATUS[t.month_status] || { text: t.month_status, cls: '' },
        slot: SLOT_STATUS[t.slot_status] || { text: t.slot_status, cls: '' },
        maskPhone: t.phone ? String(t.phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '',
        cycle: (t.finished_cycle || 0) + 1,
        avatarChar: String(t.nickname || '生').slice(0, 1),
        // 补位次数显示（WXML 不支持函数调用，预计算字段）
        fillText: this.fillText(t),
      }))
      const sp = r.slotProgress || null
      this.setData({
        trainees: list,
        slotProgress: sp ? { ...sp, pctValue: Math.min(100, Math.round((sp.kept / Math.max(1, sp.slotLimit)) * 100)) } : null,
        loading: false,
      })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  // 发起补位（冻结待补位名额）
  onFillTap(e) {
    const id = Number(e.currentTarget.dataset.id)
    const t = this.data.trainees.find((x) => x.id === id)
    if (!t) return
    this.setData({ fillModal: true, activeTrainee: t })
  },

  onFillCancel() { this.setData({ fillModal: false, activeTrainee: null }) },

  async doFill() {
    const t = this.data.activeTrainee
    if (!t || this.data.filling) return
    this.setData({ filling: t.id, fillModal: false })
    try {
      const r = await api.post('/user/fill-reserve', { traineeId: t.id })
      util.success(r.msg)
      this.load()
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ filling: 0 })
    }
  },

  // 补位次数显示（补位次数与截止时间全部来自后端字段）
  fillText(t) {
    const n = t.reserve_count || 0
    const deadline = t.reserve_deadline
    let txt = `已补位 ${n} 次（上限2次）`
    if (t.slot_status === 'frozen' && deadline) txt += ` · 截止 ${util.formatDate(deadline)}`
    return txt
  },

  goHatch() {
    wx.navigateTo({ url: '/pages/hatch-progress/hatch-progress' })
  },
})
