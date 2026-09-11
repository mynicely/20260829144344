// 提现：可提现金额、提现申请、提现记录
const api = require('../../utils/api')
const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    wallet: null,
    minWithdraw: 100,
    amount: '',
    payTypes: ['微信', '支付宝', '银行卡'],
    payTypeIndex: 0,
    account: '',
    realName: '',
    submitting: false,
    records: [],
  },

  onShow() {
    if (!app.isLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return }
    this.load()
  },

  async load() {
    try {
      const w = await api.get('/user/wallet')
      const r = await api.get('/user/withdrawals')
      this.setData({
        wallet: w.data,
        minWithdraw: w.data.minWithdraw || 100,
        records: r.data || [],
      })
    } catch (e) {
      util.toast(e.message)
    }
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },

  onPayTypeChange(e) {
    this.setData({ payTypeIndex: Number(e.detail.value) })
  },

  onAll() {
    const avail = this.data.wallet ? this.data.wallet.withdrawable : 0
    this.setData({ amount: String(avail) })
  },

  async onSubmit() {
    const { amount, payTypes, payTypeIndex, account, realName, minWithdraw } = this.data
    const a = Math.floor(Number(amount))
    if (!a || a <= 0) { util.toast('请输入有效金额'); return }
    if (a < minWithdraw) { util.toast(`单笔提现最低 ${minWithdraw} 元`); return }
    if (!account.trim()) { util.toast('请填写收款账号'); return }
    if (!realName.trim()) { util.toast('请填写收款人姓名'); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const r = await api.post('/user/withdraw', {
        amount: a,
        payType: payTypes[payTypeIndex],
        account: account.trim(),
        realName: realName.trim(),
      })
      util.success(r.msg)
      this.setData({ amount: '', account: '', realName: '' })
      this.load()
    } catch (e) {
      util.toast(e.message)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
