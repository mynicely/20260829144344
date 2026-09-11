// 金额/数字格式化工具：全站金额展示统一保留两位小数
// 用法：fmtMoney(499) -> "499.00"
export function fmtMoney(n) {
  const num = Number(n)
  if (!isFinite(num)) return '0.00'
  return num.toFixed(2)
}

// 带 ¥ 前缀：fmtMoneyWithSign(499) -> "¥499.00"
export function fmtMoneyWithSign(n) {
  return '¥' + fmtMoney(n)
}

// 整数金额（两位小数时去掉无意义的 .00）：fmtPrice(499) -> "499"，fmtPrice(99.9) -> "99.9"
export function fmtPrice(n) {
  const num = Number(n)
  if (!isFinite(num)) return String(n ?? '')
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

export default { fmtMoney, fmtMoneyWithSign, fmtPrice }
