// 个人中心：纯学习/分享推广模式切换（仅前端视图，不改后端身份）+ 钱包双资产 + 功能入口
const api = require('../../utils/api')
const util = require('../../utils/util')
const { COMPLIANCE } = require('../../utils/constants')
const app = getApp()

Page({
  data: {
    user: null,
    isLogin: false,
    isShareMode: false,
    withdrawable: 0,
    couponBalance: 0,
    compliance: COMPLIANCE.mineBottom,
    menu: [
      { key: 'orders', icon: '单', label: '我的订单', url: '/pages/orders/orders' },
      { key: 'withdrawals', icon: '提', label: '提现记录', url: '/pages/withdrawals/withdrawals' },
      { key: 'coupon', icon: '抵', label: '抵现金流水', url: '/pages/coupon-flows/coupon-flows' },
      { key: 'lesson', icon: '课', label: '我的课程', url: '/pages/lesson/lesson' },
      { key: 'task', icon: '任', label: '学习任务', url: '/pages/task/task' },
      { key: 'homework', icon: '作', label: '我的作业', url: '/pages/my-homework/my-homework' },
      { key: 'practice', icon: '题', label: '题库练习', url: '/pages/practice/practice' },
      { key: 'checkins', icon: '卡', label: '打卡记录', url: '/pages/checkins/checkins' },
      { key: 'income', icon: '益', label: '收益明细', url: '/pages/income-list/income-list' },
      { key: 'trainee', icon: '培', label: '管培生状态', url: '/pages/trainee-status/trainee-status' },
      { key: 'hatch', icon: '孵', label: '孵化任务', url: '/pages/hatch-progress/hatch-progress' },
      { key: 'invite', icon: '邀', label: '邀请好友', url: '/pages/invite/invite' },
      { key: 'reserve', icon: '约', label: '体验课预约', url: '/pages/reserve/reserve' },
      { key: 'rules', icon: '规', label: '平台规则公示', url: '/pages/rules/rules' },
    ],
  },

  onShow() {
    this.setData({ isShareMode: app.isShareMode() })
    if (!app.isLogin()) {
      this.setData({ isLogin: false, user: null, withdrawable: 0, couponBalance: 0 })
      return
    }
    this.setData({ isLogin: true })
    this.load()
  },

  async load() {
    const me = await app.fetchUser(true)
    if (!me) {
      this.setData({ isLogin: false, user: null })
      return
    }
    this.setData({
      user: { ...me, avatarChar: String(me.nickname || '书').slice(0, 1) },
      couponBalance: me.couponBalance || 0,
    })
    api.get('/user/wallet').then((r) => {
      if (r.data) this.setData({ withdrawable: r.data.withdrawable || 0 })
    }).catch(() => {})
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onCopyCode() {
    if (!this.data.user || !this.data.user.invite_code) return
    wx.setClipboardData({ data: this.data.user.invite_code })
  },

  // 纯学习/分享推广模式切换（仅前端视图控制，绝不修改后端身份字段）
  onModeSwitch(e) {
    const mode = e.detail.value ? 'share' : 'learn'
    app.setMode(mode)
    this.setData({ isShareMode: mode === 'share' })
    util.toast(mode === 'share' ? '已开启分享推广模式' : '已切换为纯学习模式')
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key
    const item = this.data.menu.find((m) => m.key === key)
    if (!item) return
    if (key === 'invite' && !this.data.isShareMode) {
      util.toast('当前为纯学习模式，开启分享推广后可使用')
      return
    }
    wx.navigateTo({ url: item.url })
  },

  goIncome() {
    wx.navigateTo({ url: '/pages/income-list/income-list' })
  },

  onLogout() {
    util.confirm('退出登录', '确定退出当前账号？', () => {
      app.logout()
      this.setData({ isLogin: false, user: null })
      util.success('已退出')
    })
  },
})
