// 帖子详情：点赞、评论、我的帖子管理（隐藏/撤回）
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    id: null,
    post: null,
    comments: [],
    comment: '',
    commenting: false,
    liking: false,
    commentFocus: false,
    isMine: false,
  },

  onLoad(options) {
    this.setData({ id: Number(options.id) })
    this.load()
  },

  async load() {
    try {
      const r = await api.get('/community/posts/' + this.data.id)
      const p = r.data
      const me = app.globalData.userInfo || null
      this.setData({
        post: { ...p, avatarChar: String(p.nickname || '学').slice(0, 1) },
        isMine: !!(me && p.user_id === me.id),
        comments: (p.comments || []).map((c) => ({
          ...c,
          avatarChar: String(c.nickname || '学').slice(0, 1),
        })),
      })
    } catch (e) {
      util.toast(e.message)
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  onLike() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    if (this.data.liking) return
    this.setData({ liking: true })
    api.post('/community/posts/' + this.data.id + '/like')
      .then((r) => {
        this.load()
      })
      .catch((e) => util.toast(e.message))
      .finally(() => this.setData({ liking: false }))
  },

  onCommentInput(e) { this.setData({ comment: e.detail.value }) },

  async onSendComment() {
    if (!app.isLogin()) { util.toast('请先登录'); wx.navigateTo({ url: '/pages/login/login' }); return }
    const c = this.data.comment.trim()
    if (!c) { util.toast('请输入评论内容'); return }
    if (this.data.commenting) return
    this.setData({ commenting: true })
    try {
      await api.post('/community/posts/' + this.data.id + '/comment', { content: c })
      util.success('评论成功')
      this.setData({ comment: '' })
      this.load()
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ commenting: false })
    }
  },

  // 我的帖子：管理
  onManage() {
    if (!this.data.isMine) return
    wx.showActionSheet({
      itemList: ['隐藏此帖', '撤回此帖'],
      success: (r) => {
        if (r.tapIndex === 0) {
          api.post('/community/posts/' + this.data.id + '/hide', { hidden: true })
            .then(() => { util.success('已隐藏'); this.load() })
            .catch((e) => util.toast(e.message))
        } else if (r.tapIndex === 1) {
          util.confirm('撤回帖子', '撤回后帖子将不再展示，确认撤回？', () => {
            api.post('/community/posts/' + this.data.id + '/retract')
              .then(() => { util.success('已撤回'); setTimeout(() => wx.navigateBack(), 600) })
              .catch((e) => util.toast(e.message))
          })
        }
      },
    })
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url
    const urls = (this.data.post.images || []).map((x) => x)
    wx.previewImage({ urls, current: url })
  },
})
