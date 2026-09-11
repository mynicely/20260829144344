import { defineStore } from 'pinia'
import api from './api'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null,
  }),
  actions: {
    setToken(t) { this.token = t; localStorage.setItem('token', t) },
    setUser(u) { this.user = u },
    async fetchMe() {
      if (!this.token) return null
      try {
        const r = await api.get('/user/me')
        this.user = r.data
        return r.data
      } catch (e) {
        // token 失效：同步清理内存登录态，避免残留
        if (e.status === 401) { this.token = ''; this.user = null }
        return null
      }
    },
    logout() { this.token = ''; this.user = null; localStorage.removeItem('token') }
  }
})

export const useAdminStore = defineStore('admin', {
  state: () => ({ token: localStorage.getItem('admin_token') || '' }),
  actions: {
    setToken(t) { this.token = t; localStorage.setItem('admin_token', t) },
    logout() { this.token = ''; localStorage.removeItem('admin_token') }
  }
})
