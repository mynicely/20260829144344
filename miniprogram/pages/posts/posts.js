// 学员社区：分类浏览、作品展示、发帖入口
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    categories: [],
    activeCat: 'all',
    posts: [],
    loading: true,
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const cats = ((await api.get('/post-categories').catch(() => ({ data: [] }))).data || []).map((c) => ({
        value: c.value,
        label: c.name,
      }))
      const activeCat = this.data.activeCat
      const q = activeCat && activeCat !== 'all' ? { category: activeCat } : {}
      const posts = ((await api.get('/community/posts', q)).data || []).map((p) => ({
        ...p,
        // 头像首字预计算（WXML 不支持 slice() 调用）
        avatarChar: String(p.nickname || '学').slice(0, 1),
        // 分类名预计算（后端只返回 category 值，映射为展示名）
        category_label: (cats.find((c) => c.value === p.category) || {}).label || '',
      }))
      this.setData({ categories: cats, posts, loading: false })
    } catch (e) {
      util.toast(e.message)
      this.setData({ loading: false })
    }
  },

  onCatTap(e) {
    this.setData({ activeCat: e.currentTarget.dataset.key }, () => this.load())
  },

  onPostTap(e) {
    wx.navigateTo({ url: '/pages/post-detail/post-detail?id=' + e.currentTarget.dataset.id })
  },

  onPostLongPress(e) {
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['复制标题'],
      success: (r) => {
        if (r.tapIndex === 0) {
          const p = this.data.posts.find((x) => x.id === id)
          if (p) wx.setClipboardData({ data: p.title || p.content || '' })
        }
      },
    })
  },

  goPublish() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    wx.navigateTo({ url: '/pages/post-edit/post-edit' })
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },
})
