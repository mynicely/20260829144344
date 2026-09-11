<template>
  <div class="page">
    <h1>管理后台登录</h1>
    <div class="card">
      <label class="label">账号</label>
      <input class="input" v-model="username" placeholder="请输入管理员账号" />
      <label class="label">密码</label>
      <input class="input" type="password" v-model="password" placeholder="请输入密码" @keyup.enter="login" />
      <button class="btn btn-block" :disabled="submitting" @click="login">{{ submitting ? '登录中…' : '登录' }}</button>
      <p class="muted mt" style="text-align:center;">连续输错多次将临时锁定，请谨慎输入</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../api'
import { useAdminStore } from '../../store'
import { adminPrefix } from '../../router'
const router = useRouter()
const store = useAdminStore()
const username = ref('')
const password = ref('')
const submitting = ref(false)
async function login() {
  if (!username.value || !password.value) return alert('请输入账号和密码')
  if (submitting.value) return
  submitting.value = true
  try {
    const r = await api.post('/admin/login', { username: username.value, password: password.value })
    store.setToken(r.data.token)
    router.push('/' + adminPrefix() + '/dashboard')
  } catch (e) { alert(e.message) } finally { submitting.value = false }
}
</script>
