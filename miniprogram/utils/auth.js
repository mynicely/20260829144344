// token 存取统一封装
const TOKEN_KEY = 'hanmo_token'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function setToken(token) {
  if (!token) return
  wx.setStorageSync(TOKEN_KEY, token)
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY)
}

module.exports = { getToken, setToken, clearToken }
