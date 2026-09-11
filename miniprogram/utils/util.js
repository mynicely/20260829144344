// 通用工具：格式化、倒计时、提示
const pad = (n) => (n < 10 ? '0' + n : '' + n)

function formatTime(str) {
  if (!str) return ''
  const s = String(str).replace('T', ' ').slice(0, 19)
  return s
}

function formatDate(str) {
  if (!str) return ''
  return String(str).slice(0, 10)
}

// 金额显示
function money(n) {
  const v = Number(n || 0)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

// 倒计时：输入秒数 → '02天03:04:05' 或 '03:04:05'
function countdownText(seconds) {
  let s = Math.max(0, Math.floor(Number(seconds) || 0))
  if (s <= 0) return '已结束'
  const d = Math.floor(s / 86400)
  s %= 86400
  const h = Math.floor(s / 3600)
  s %= 3600
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (d > 0) return `${d}天${pad(h)}:${pad(m)}:${pad(sec)}`
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

// 距某时间点的剩余秒数（后端时间格式 'YYYY-MM-DD HH:mm:ss' 本地时区）
function remainSeconds(expireAt) {
  if (!expireAt) return 0
  const t = new Date(String(expireAt).replace('T', ' ').replace(' ', 'T')).getTime()
  return Math.max(0, Math.floor((t - Date.now()) / 1000))
}

function toast(title, icon = 'none') {
  wx.showToast({ title: String(title || '').slice(0, 40), icon })
}

function success(title) {
  wx.showToast({ title: String(title || '成功').slice(0, 40), icon: 'success' })
}

// 简单确认（非关键业务场景；关键业务使用自定义 gf-modal 组件）
function confirm(title, content, cb) {
  wx.showModal({
    title: title || '提示',
    content: content || '',
    confirmText: '确定',
    cancelText: '取消',
    success(r) {
      if (r.confirm && cb) cb()
    },
  })
}

// 校验手机号
function isValidPhone(p) {
  return /^1[3-9]\d{9}$/.test(String(p || '').trim())
}

// 订单/砍价等状态 → 印章标签文案
function statusLabel(status) {
  const map = {
    pending: '待付款',
    paid: '已支付',
    closed: '已关闭',
    refunded: '已退款',
    opening: '拼团中',
    success: '已成功',
    failed: '已失败',
    active: '砍价中',
    expired: '已过期',
    approved: '已通过',
    rejected: '已驳回',
    qualified: '合格',
    probation: '见习',
    invalid: '失效',
    frozen: '冻结待补位',
    void: '永久作废',
    normal: '正常在岗',
  }
  return map[status] || status || ''
}

module.exports = {
  formatTime,
  formatDate,
  money,
  countdownText,
  remainSeconds,
  toast,
  success,
  confirm,
  isValidPhone,
  statusLabel,
}
