// 发帖：标题、内容、图片（最多9张）、分类
const api = require('../../utils/api')
const util = require('../../utils/util')

Page({
  data: {
    title: '',
    content: '',
    images: [],
    categories: [],
    catIndex: 0,
    publishing: false,
  },

  onLoad() {
    api.get('/post-categories').then((r) => {
      const cats = r.data || []
      if (cats.length) this.setData({ categories: cats })
    }).catch(() => {})
  },

  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onContentInput(e) { this.setData({ content: e.detail.value }) },
  onCatChange(e) { this.setData({ catIndex: Number(e.detail.value) }) },

  // 选择图片（最多9张）
  async onChooseImages() {
    const remain = 9 - this.data.images.length
    if (remain <= 0) { util.toast('最多上传9张图片'); return }
    try {
      const res = await wx.chooseMedia({ count: remain, mediaType: ['image'], sizeType: ['compressed'] })
      util.toast('上传中...')
      const urls = []
      for (const f of res.tempFiles) {
        urls.push(await api.upload(f.tempFilePath))
      }
      this.setData({ images: this.data.images.concat(urls) })
    } catch (e) {
      if (!String(e && e.message || e).includes('cancel')) util.toast('图片上传失败')
    }
  },

  onRemoveImage(e) {
    const i = Number(e.currentTarget.dataset.index)
    const arr = this.data.images.slice()
    arr.splice(i, 1)
    this.setData({ images: arr })
  },

  async onPublish() {
    const title = this.data.title.trim()
    const content = this.data.content.trim()
    if (!title && !content) { util.toast('请填写标题或内容'); return }
    if (this.data.publishing) return
    this.setData({ publishing: true })
    try {
      const cat = this.data.categories[this.data.catIndex]
      await api.post('/community/posts', {
        title: title || '无标题',
        content,
        images: this.data.images,
        category: cat ? cat.value : 'works',
      })
      util.success('发布成功')
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ publishing: false })
    }
  },
})
