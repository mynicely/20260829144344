const config = require('./utils/config')
const { getToken, clearToken } = require('./utils/auth')

App({
  globalData: {
    baseUrl: config.baseUrl,
    userInfo: null,
    token: '',
    // 纯学习模式 / 分享推广模式：仅前端视图控制，绝不调用接口修改后端 identity 字段
    mode: 'learn',
  },

  onLaunch() {
    // 恢复登录态
    this.globalData.token = getToken() || ''
    this.globalData.mode = wx.getStorageSync('mode') || 'learn'
  },

  // 登录态判断
  isLogin() {
    return !!this.globalData.token
  },

  // 纯学习 / 分享推广模式切换（仅前端视图，不修改后端身份）
  setMode(mode) {
    if (mode !== 'learn' && mode !== 'share') return
    this.globalData.mode = mode
    wx.setStorageSync('mode', mode)
  },

  // 分享推广模式是否开启
  isShareMode() {
    return this.globalData.mode === 'share'
  },

  // 退出登录
  logout() {
    this.globalData.token = ''
    this.globalData.userInfo = null
    clearToken()
  },

  // 拉取当前用户信息（统一入口，带缓存）
  async fetchUser(force) {
    if (!this.isLogin()) return null
    if (this.globalData.userInfo && !force) return this.globalData.userInfo
    try {
      const api = require('./utils/api')
      const res = await api.get('/user/me')
      this.globalData.userInfo = res.data
      return res.data
    } catch (e) {
      if (e.statusCode === 401) {
        this.logout()
      }
      return null
    }
  },
})
