// 登录注册：密码登录 / 短信验证码登录 / 新用户注册
const api = require('../../utils/api')
const util = require('../../utils/util')
const { setToken } = require('../../utils/auth')
const app = getApp()

Page({
  data: {
    tab: 'password',   // password / sms / register
    // 密码登录
    phone: '',
    password: '',
    // 验证码登录
    smsPhone: '',
    code: '',
    smsCountdown: 0,
    debugCode: '',
    // 注册
    regPhone: '',
    regNickname: '',
    regInvite: '',
    regPassword: '',
    submitting: false,
  },

  onUnload() { if (this.smsTimer) clearInterval(this.smsTimer) },

  onTabTap(e) {
    this.setData({ tab: e.currentTarget.dataset.tab })
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },

  // 登录成功后统一处理
  async onLoginSuccess(res) {
    setToken(res.data.token)
    app.globalData.token = res.data.token
    app.globalData.userInfo = null
    app.fetchUser(true)
    util.success('登录成功')
    setTimeout(() => wx.navigateBack(), 600)
  },

  // 密码登录
  async onPasswordLogin() {
    const { phone, password } = this.data
    if (!util.isValidPhone(phone)) { util.toast('请输入正确的手机号'); return }
    if (!password) { util.toast('请输入密码'); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const r = await api.post('/auth/login', { phone, password })
      await this.onLoginSuccess(r)
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 获取验证码
  async onSendCode() {
    const { smsPhone } = this.data
    if (!util.isValidPhone(smsPhone)) { util.toast('请输入正确的手机号'); return }
    if (this.data.smsCountdown > 0) return
    try {
      const r = await api.post('/auth/send-sms-code', { phone: smsPhone })
      util.toast(r.debugCode ? '验证码已发送' : r.msg || '验证码已发送')
      // 模拟模式：自动填充验证码便于测试（真实环境不会返回 debugCode）
      if (r.debugCode) {
        this.setData({ debugCode: r.debugCode, code: r.debugCode })
      }
      this.setData({ smsCountdown: 60 })
      this.smsTimer = setInterval(() => {
        const n = this.data.smsCountdown - 1
        if (n <= 0) { clearInterval(this.smsTimer); this.setData({ smsCountdown: 0 }) }
        else this.setData({ smsCountdown: n })
      }, 1000)
    } catch (e) {
      util.toast(e.message)
    }
  },

  // 验证码登录（未注册时自动注册，需填邀请码）
  async onSmsLogin() {
    const { smsPhone, code, regInvite } = this.data
    if (!util.isValidPhone(smsPhone)) { util.toast('请输入正确的手机号'); return }
    if (!code) { util.toast('请输入验证码'); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const r = await api.post('/auth/login-by-sms', { phone: smsPhone, code, inviteCode: regInvite || undefined })
      await this.onLoginSuccess(r)
    } catch (e) {
      if (e.needAdmin) {
        wx.showModal({
          title: '需要有效邀请码',
          content: e.message + '\n\n请联系管理员协助注册，或输入正确的邀请码后重试。',
          showCancel: false,
          confirmText: '知道了',
        })
      } else {
        util.toast(e.message)
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 注册
  async onRegister() {
    const { regPhone, regNickname, regInvite, regPassword } = this.data
    if (!util.isValidPhone(regPhone)) { util.toast('请输入正确的手机号'); return }
    if (!regNickname.trim()) { util.toast('请输入昵称'); return }
    if (!regInvite.trim()) { util.toast('请输入邀请码'); return }
    if (regPassword.length < 6) { util.toast('密码至少6位'); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const r = await api.post('/auth/register', {
        phone: regPhone,
        nickname: regNickname.trim(),
        inviteCode: regInvite.trim(),
        password: regPassword,
      })
      await this.onLoginSuccess(r)
    } catch (e) {
      if (e.needAdmin) {
        wx.showModal({
          title: '需要有效邀请码',
          content: e.message + '\n\n请联系管理员协助注册。',
          showCancel: false,
          confirmText: '知道了',
        })
      } else {
        util.toast(e.message)
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 微信绑定（登录后可选）
  async onBindWechat() {
    if (!app.isLogin()) { util.toast('请先登录'); return }
    try {
      const res = await wx.login()
      const r = await api.post('/wx/session', { code: res.code })
      util.success(r.msg)
    } catch (e) {
      util.toast(e.message)
    }
  },
})
