// 国风自定义底部导航（不使用原生 tabBar，图标为纯 CSS 印章字）
Component({
  properties: {
    current: { type: Number, value: 0 }, // 0首页 1学习 2社区 3我的
  },
  data: {
    tabs: [
      { index: 0, url: '/pages/home/home', icon: '堂', label: '首页' },
      { index: 1, url: '/pages/lesson/lesson', icon: '学', label: '学习' },
      { index: 2, url: '/pages/posts/posts', icon: '社', label: '社区' },
      { index: 3, url: '/pages/mine/mine', icon: '我', label: '我的' },
    ],
  },
  methods: {
    onTap(e) {
      const idx = Number(e.currentTarget.dataset.index)
      if (idx === this.properties.current) return
      const tab = this.data.tabs[idx]
      // 底部主导航使用 reLaunch 重置页面栈，避免堆叠
      wx.reLaunch({ url: tab.url })
    },
  },
})
