// 练习成绩：得分、正确率、逐题解析
Page({
  data: {
    result: null,
    detail: [],
  },

  onLoad() {
    const r = wx.getStorageSync('practice_result')
    if (!r) {
      wx.showToast({ title: '暂无成绩数据', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this.setData({ result: r, detail: r.detail || [] })
  },

  again() {
    wx.redirectTo({ url: '/pages/practice-quiz/practice-quiz' })
  },

  goWrong() {
    wx.redirectTo({ url: '/pages/practice-wrong/practice-wrong' })
  },

  goHome() {
    wx.navigateBack({ delta: 2 })
  },
})
