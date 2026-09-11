// 统一请求封装：自动携带 token、统一错误处理、401 自动跳登录
const config = require('./config')
const { getToken, clearToken } = require('./auth')

function request(method, url, data, options = {}) {
  const token = getToken()
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(options.header || {}),
      },
      timeout: 15000,
      success(res) {
        const body = res.data || {}
        if (res.statusCode === 200 && body.ok) {
          resolve(body)
        } else if (res.statusCode === 401) {
          clearToken()
          const pages = getCurrentPages()
          const current = pages.length ? pages[pages.length - 1].route : ''
          // 登录页无需重复跳转
          if (current && !current.includes('/login/')) {
            wx.showToast({ title: '请先登录', icon: 'none' })
            setTimeout(() => {
              wx.navigateTo({ url: '/pages/login/login' })
            }, 600)
          }
          reject(Object.assign(new Error(body.msg || '未登录'), { statusCode: 401, ...body }))
        } else {
          const err = new Error(body.msg || '网络错误')
          // 透传后端业务标记（needRebind 等）
          Object.keys(body).forEach((k) => { if (k !== 'ok' && k !== 'msg') err[k] = body[k] })
          err.statusCode = res.statusCode
          reject(err)
        }
      },
      fail(err) {
        reject(Object.assign(new Error('网络连接失败，请检查网络'), { statusCode: 0 }))
      },
    })
  })
}

module.exports = {
  get(url, data, options) { return request('GET', url, data, options) },
  post(url, data, options) { return request('POST', url, data, options) },
  put(url, data, options) { return request('PUT', url, data, options) },

  // 图片上传（后端 /api/upload 接收 base64 data）
  upload(filePath) {
    const token = getToken()
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success(r) {
          // 按扩展名区分 mime，避免 png 被存成 jpg 导致显示异常
          const ext = String(filePath).split('.').pop().toLowerCase()
          const mime = ext === 'png' ? 'image/png' : (ext === 'gif' ? 'image/gif' : 'image/jpeg')
          const data = 'data:' + mime + ';base64,' + r.data
          request('POST', '/upload', { data })
            .then((res) => resolve(res.url))
            .catch(reject)
        },
        fail: () => reject(new Error('图片读取失败')),
      })
    })
  },
}
