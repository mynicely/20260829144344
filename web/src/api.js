import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 15000 })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  const adminToken = localStorage.getItem('admin_token')
  // 管理后台 API 统一前缀（可在后台修改，防破解）；默认 /admin
  const isAdminApi = !!config.url?.startsWith('/admin')
  config._isAdmin = isAdminApi
  if (isAdminApi && adminToken) {
    config.headers.Authorization = 'Bearer ' + adminToken
  } else if (token) {
    config.headers.Authorization = 'Bearer ' + token
  }
  if (isAdminApi) {
    const prefix = (window.__ADMIN_PREFIX__ || localStorage.getItem('admin_prefix') || 'admin').replace(/^\/+|\/+$/g, '')
    config.url = '/' + prefix + config.url.slice(6)
  }
  return config
})

api.interceptors.response.use(
  (r) => r.data,
  (e) => {
    const data = e.response?.data || {}
    const status = e.response?.status
    const msg = data.msg || '网络错误'
    const err = new Error(msg)
    err.status = status || 0
    // 透传后端返回的业务标记字段（如 needRebind）
    Object.keys(data).forEach(k => { if (k !== 'msg' && k !== 'ok') err[k] = data[k] })
    // 401：token 失效/未登录，清除本地 token 并跳转对应登录页
    if (status === 401) {
      const isAdmin = !!e.config?._isAdmin
      localStorage.removeItem(isAdmin ? 'admin_token' : 'token')
      const prefix = (window.__ADMIN_PREFIX__ || localStorage.getItem('admin_prefix') || 'admin').replace(/^\/+|\/+$/g, '')
      const target = isAdmin ? '/' + prefix + '/login' : '/login'
      if (!window.location.pathname.includes('/login')) {
        window.location.href = target
      }
    }
    return Promise.reject(err)
  }
)

export default api
