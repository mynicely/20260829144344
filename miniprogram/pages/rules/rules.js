// 规则公示：简易版 / 完整版 双 Tab（内容全部来自后端 /api/rules/:version）
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    tab: 'simple',
    content: '',
    updatedAt: '',
    loading: true,
  },

  onLoad() {
    this.load('simple')
  },

  async load(version) {
    this.setData({ loading: true, tab: version })
    try {
      const r = await api.get('/rules/' + version)
      // 以换行分段渲染
      const lines = (r.data || '').split('\n').map((t) => t.trim()).filter(Boolean)
      this.setData({ content: lines.join('\n'), loading: false })
      // 尝试取版本更新时间
      api.get('/rules').then((rr) => {
        if (rr.data && rr.data.updated_at) this.setData({ updatedAt: util.formatTime(rr.data.updated_at) })
      }).catch(() => {})
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  onTabTap(e) {
    const v = e.currentTarget.dataset.version
    if (v === this.data.tab) return
    this.load(v)
  },
})
