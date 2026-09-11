<template>
  <nav class="nav-bar" v-if="show">
    <router-link to="/" :class="{ active: isActive('/') }" @click="onNav('/')">
      <span class="ico"><svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-10.5z"/></svg></span>
      首页
    </router-link>
    <router-link to="/courses" :class="{ active: isActive('/courses') }" @click="onNav('/courses')">
      <span class="ico"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg></span>
      分享
    </router-link>
    <router-link to="/tasks" :class="{ active: isActive('/tasks') }" @click="onNav('/tasks')">
      <span class="ico"><svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z"/></svg></span>
      任务
    </router-link>
    <router-link to="/community" :class="{ active: isActive('/community') }" @click="onNav('/community')">
      <span class="ico"><svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4l4 4 4-4h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14h-4.6L12 19.4 8.6 16H4V4h16v12z"/></svg></span>
      互动
    </router-link>
    <router-link to="/mine" :class="{ active: isActive('/mine') }" @click="onNav('/mine')">
      <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z"/></svg></span>
      我的
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
const show = computed(() => {
  const prefix = (window.__ADMIN_PREFIX__ || localStorage.getItem('admin_prefix') || 'admin').replace(/^\/+|\/+$/g, '')
  const isAdminPage = route.path.startsWith('/admin') || route.path === '/' + prefix || route.path.startsWith('/' + prefix + '/')
  return !isAdminPage
})
function isActive(p) {
  if (p === '/') return route.path === '/'
  return route.path.startsWith(p)
}
function onNav(p) {
  // 已在目标页时无需处理（router-link 自带）
  void p
}
</script>
