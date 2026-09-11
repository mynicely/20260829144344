import api from './api'

// 调起微信支付（小程序环境走 wx.requestPayment；H5/浏览器环境无法调起时给出引导提示）
export function requestWxPay(payParams, orderNo) {
  return new Promise((resolve, reject) => {
    if (typeof wx !== 'undefined' && wx.requestPayment) {
      wx.requestPayment({
        ...payParams,
        success: resolve,
        fail: (err) => reject(new Error(err.errMsg || '支付取消')),
      })
    } else {
      // eslint-disable-next-line no-unused-vars
      void orderNo
      reject(new Error('当前环境无法调起微信支付，请在小程序内完成支付'))
    }
  })
}

// 支付后轮询订单状态，直到已支付或超时
export async function waitOrderPaid(orderNo, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await api.get('/order/' + orderNo)
      if (r.data && r.data.status === 'paid') return r.data
    } catch (e) { /* 继续轮询 */ }
    await new Promise(res => setTimeout(res, 1200))
  }
  return null
}
