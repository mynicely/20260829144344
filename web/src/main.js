import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { installAdminRoutes } from './router'
import { installGlobalDialog } from './utils/dialog'
import './style.css'

async function boot() {
  installGlobalDialog()
  let prefix = 'admin'
  try {
    prefix = localStorage.getItem('admin_prefix') || 'admin'
    const r = await fetch('/api/public/admin-prefix').then(r => r.json())
    if (r && r.data && r.data.prefix) prefix = r.data.prefix
  } catch (e) {}
  window.__ADMIN_PREFIX__ = prefix
  localStorage.setItem('admin_prefix', prefix)
  installAdminRoutes(prefix)
  createApp(App).use(createPinia()).use(router).mount('#app')
}
boot()
