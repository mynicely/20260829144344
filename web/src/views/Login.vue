<template>
  <div class="login-wrap">
    <div class="login-bg"></div>

    <!-- 品牌区 -->
    <div class="login-brand">
      <div class="login-seal">翰</div>
      <h1>翰墨书院</h1>
      <p>在线学书法 · 天天练好字</p>
    </div>

    <div class="login-card">
      <!-- 模式切换 -->
      <div style="display:flex;gap:10px;margin-bottom:16px;background:#f5efe4;border-radius:12px;padding:4px;">
        <button class="btn" style="flex:1;padding:9px 0;border-radius:9px;" :class="{ 'btn-primary': !isRegister, 'btn-ghost': isRegister }" @click="isRegister = false">登 录</button>
        <button class="btn" style="flex:1;padding:9px 0;border-radius:9px;" :class="{ 'btn-primary': isRegister, 'btn-ghost': !isRegister }" @click="isRegister = true">注 册</button>
      </div>

      <!-- 浏览器自动填充陷阱 -->
      <input type="text" style="position:absolute;opacity:0;height:0;width:0;pointer-events:none;" autocomplete="username" />
      <input type="password" style="position:absolute;opacity:0;height:0;width:0;pointer-events:none;" autocomplete="current-password" />

      <!-- 注册：手机号 + 邀请码 + 昵称 + 密码(选填)/短信验证码 -->
      <template v-if="isRegister">
        <label class="label">手机号</label>
        <input class="input" v-model="phone" placeholder="请输入手机号" autocomplete="tel" inputmode="tel" />
        <label class="label">邀请码 <b style="color:#d32f2f;">*</b></label>
        <input class="input" v-model="inviteCode" placeholder="填写邀请你的朋友的邀请码" autocomplete="off" @keyup.enter="register" />
        <p v-if="adminContact" class="muted" style="font-size:12px;margin:-6px 0 10px;line-height:1.6;">
          没有邀请码？<a @click="openContact" style="color:var(--brand);cursor:pointer;">联系管理员协助注册</a>
        </p>
        <label class="label">昵称</label>
        <input class="input" v-model="nickname" placeholder="昵称（选填）" autocomplete="off" />
        <label class="label">设置登录密码（选填）</label>
        <input class="input" type="password" v-model="password" placeholder="设置后可直接用密码登录" autocomplete="new-password" />
        <template v-if="!password">
          <label class="label">短信验证码</label>
          <div style="display:flex;gap:8px;">
            <input class="input" v-model="smsCode" placeholder="6位验证码" style="flex:1;" autocomplete="one-time-code" inputmode="numeric" />
            <button class="btn btn-ghost btn-sm" style="height:44px;margin-bottom:10px;white-space:nowrap;" @click="sendCode" :disabled="countdown > 0">{{ countdown > 0 ? countdown + 's 后重发' : '获取验证码' }}</button>
          </div>
        </template>
        <button class="btn btn-primary btn-block mt" @click="register">注册并登录</button>
        <p class="muted" style="text-align:center;margin-top:10px;font-size:12px;line-height:1.7;">
          邀请码为邀请您的朋友分享的专属码，注册后将自动绑定邀请关系<br/>没有邀请码请联系管理员协助注册
        </p>
      </template>

      <!-- 登录 -->
      <template v-else>
        <div class="tab-bar" style="margin-bottom:14px;">
          <span class="tab" :class="{ active: loginMode === 'pwd' }" @click="loginMode = 'pwd'">密码登录</span>
          <span class="tab" :class="{ active: loginMode === 'sms' }" @click="loginMode = 'sms'">短信登录</span>
        </div>
        <label class="label">手机号</label>
        <input class="input" v-model="phone" placeholder="请输入手机号" autocomplete="tel" inputmode="tel" />
        <template v-if="loginMode === 'pwd'">
          <label class="label">登录密码</label>
          <input class="input" type="password" v-model="password" placeholder="请输入密码" autocomplete="current-password" @keyup.enter="submit" />
          <button class="btn btn-primary btn-block" @click="submit">登 录</button>
        </template>
        <template v-else>
          <label class="label">短信验证码</label>
          <div style="display:flex;gap:8px;">
            <input class="input" v-model="smsCode" placeholder="6位验证码" style="flex:1;" autocomplete="one-time-code" inputmode="numeric" />
            <button class="btn btn-ghost btn-sm" style="height:44px;margin-bottom:10px;" @click="sendCode" :disabled="countdown > 0">{{ countdown > 0 ? countdown + 's 后重发' : '获取验证码' }}</button>
          </div>
          <button class="btn btn-primary btn-block" @click="loginBySms">短信登录</button>
        </template>
        <p style="text-align:center;margin-top:10px;font-size:13px;">
          <a @click="openContact" style="color:var(--brand);cursor:pointer;">无法登录？联系管理员</a>
        </p>

        <!-- 微信登录 -->
        <div class="wx-row">
          <button v-if="wechatEnabled" class="btn btn-block btn-wx" @click="wechatLogin">
            <span class="wx-ico">微</span> 微信一键登录
          </button>
          <p v-else class="muted" style="text-align:center;font-size:12px;line-height:1.7;">
            微信登录未开通，可使用密码 / 短信登录<br/><span style="color:#c0b5a6;">（管理员在后台「参数配置」填写公众号 AppID / AppSecret 后自动开启）</span>
          </p>
        </div>
      </template>
    </div>

    <!-- 创业合作 -->
    <div class="login-card" style="margin-top:0;">
      <div style="display:flex;gap:12px;align-items:center;">
        <div style="font-size:30px;">🤝</div>
        <div style="flex:1;">
          <b>创业推广合作</b>
          <p class="muted" style="margin-top:2px;">转介绍学员获奖励，组建学习圈拿待遇</p>
        </div>
        <router-link to="/rules" class="btn btn-outline btn-sm">查看规则</router-link>
      </div>
    </div>

    <!-- 联系管理员弹窗 -->
    <div v-if="showContact" class="mask" @click.self="showContact = false">
      <div class="modal">
        <h2>联系管理员</h2>
        <p class="muted" style="line-height:1.8;font-size:13px;">无法登录或账号异常（如未设置密码、忘记密码）时，可联系管理员重置密码或协助处理：</p>
        <div v-if="adminContact" style="background:#f7f3ea;border-radius:10px;padding:12px;margin:10px 0;word-break:break-all;white-space:pre-wrap;font-size:14px;">{{ adminContact }}</div>
        <p v-else class="muted" style="line-height:1.8;font-size:13px;">
          管理员暂未公开联系方式。您也可以：<br/>
          ① 请您的推荐老师帮忙联系运营后台处理；<br/>
          ② 管理员可在后台「数据看板 → 最近用户 → 设置密码」一键为您重置登录密码。
        </p>
        <button class="btn btn-block mt" @click="showContact = false">我知道了</button>
      </div>
    </div>

    <!-- 微信登录·绑定手机号弹窗 -->
    <div v-if="showWxBind" class="mask" @click.self="showWxBind = false">
      <div class="modal">
        <h2>微信登录 · 绑定手机号</h2>
        <p class="muted" style="font-size:13px;line-height:1.7;">首次使用微信登录，请绑定手机号完成注册/登录（未注册的手机号将自动创建账号）：</p>
        <label class="label">手机号</label>
        <input class="input" v-model="phone" placeholder="请输入手机号" autocomplete="tel" inputmode="tel" />
        <label class="label">短信验证码</label>
        <div style="display:flex;gap:8px;">
          <input class="input" v-model="smsCode" placeholder="6位验证码" style="flex:1;" autocomplete="one-time-code" inputmode="numeric" />
          <button class="btn btn-ghost btn-sm" style="height:44px;margin-bottom:10px;" @click="sendCode" :disabled="countdown > 0">{{ countdown > 0 ? countdown + 's 后重发' : '获取验证码' }}</button>
        </div>
        <label class="label">邀请码 <b style="color:#d32f2f;">*</b></label>
        <input class="input" v-model="inviteCode" placeholder="填写邀请你的朋友的邀请码（新用户必填）" autocomplete="off" />
        <label class="label">设置登录密码（选填）</label>
        <input class="input" type="password" v-model="password" placeholder="设置后可直接用密码登录" autocomplete="new-password" />
        <button class="btn btn-block mt" @click="wechatBind">绑定并登录</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { toast } from '../utils/toast'

const router = useRouter()
const route = useRoute()
const store = useUserStore()
const isRegister = ref(true)
const loginMode = ref('pwd')
const phone = ref('')
const nickname = ref('')
const password = ref('')
// 邀请码：优先 ?invite=码（字母数字），兼容旧分享链接 ?ref=用户ID
const inviteCode = ref(route.query.invite || route.query.ref || '')
const smsCode = ref('')
const countdown = ref(0)
let timer = null
const showContact = ref(false)
const adminContact = ref('')
const wechatEnabled = ref(false)
const showWxBind = ref(false)
const wxCode = ref(route.query.wx || '')

onMounted(async () => {
  try {
    const d = (await api.get('/public/login-options')).data
    adminContact.value = d.adminContact || ''
    wechatEnabled.value = !!d.wechatEnabled
    if (!d.smsLoginEnabled) loginMode.value = 'pwd'
  } catch (e) { /* 配置加载失败不影响登录 */ }
  if (route.query.wx) {
    isRegister.value = false
    await tryWechatLogin(route.query.wx)
  } else if (route.query.wx_err) {
    toast('微信登录失败，请重试或改用其他方式登录', 'error')
  }
})

function toggleMode() {
  isRegister.value = !isRegister.value
  password.value = ''
  smsCode.value = ''
}
// 中国大陆手机号校验
function checkPhone() {
  const p = String(phone.value).trim()
  if (!p) return '请输入手机号'
  if (!/^1[3-9]\d{9}$/.test(p)) return '手机号格式不正确，请输入 11 位大陆手机号'
  return ''
}
function openContact() { showContact.value = true }
function enter(r) {
  store.setToken(r.data.token)
  store.setUser(r.data.user)
  toast('欢迎，' + (r.data.user.nickname || '学员'))
  const redirect = route.query.redirect
  router.replace(redirect && !redirect.startsWith('/login') ? redirect : '/mine')
}

function register() {
  const phoneErr = checkPhone()
  if (phoneErr) return toast(phoneErr, 'warn')
  if (password.value) {
    if (password.value.length < 6) return toast('密码至少6位', 'warn')
    api.post('/auth/register', { phone: phone.value, nickname: nickname.value, password: password.value, inviteCode: inviteCode.value || null })
      .then(enter).catch(e => { if (e.needAdmin) openContact(); toast(e.message, 'error') })
  } else {
    if (!smsCode.value) return toast('未设置密码，请填写短信验证码完成注册', 'warn')
    api.post('/auth/login-by-sms', { phone: phone.value, code: smsCode.value, nickname: nickname.value || undefined, inviteCode: inviteCode.value || null })
      .then(enter).catch(e => { if (e.needAdmin) openContact(); toast(e.message, 'error') })
  }
}

async function submit() {
  const phoneErr = checkPhone()
  if (phoneErr) return toast(phoneErr, 'warn')
  if (!password.value) return toast('请输入密码', 'warn')
  try {
    const r = await api.post('/auth/login', { phone: phone.value, password: password.value })
    enter(r)
  } catch (e) { toast(e.message, 'error') }
}

async function sendCode() {
  const phoneErr = checkPhone()
  if (phoneErr) return toast(phoneErr, 'warn')
  try {
    const r = await api.post('/auth/send-sms-code', { phone: phone.value })
    toast(r.debugCode ? ('测试模式验证码：' + r.debugCode) : (r.msg || '验证码已发送'), 'info')
    countdown.value = 60
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (e) { toast(e.message, 'error') }
}

async function loginBySms() {
  const phoneErr = checkPhone()
  if (phoneErr) return toast(phoneErr, 'warn')
  if (!smsCode.value) return toast('请输入验证码', 'warn')
  try {
    const r = await api.post('/auth/login-by-sms', { phone: phone.value, code: smsCode.value, inviteCode: inviteCode.value || null })
    enter(r)
  } catch (e) { if (e.needAdmin) openContact(); toast(e.message, 'error') }
}

function wechatLogin() {
  window.location.href = '/api/auth/wechat-login'
}
async function tryWechatLogin(wx) {
  try {
    const r = await api.post('/auth/wechat-login', { wxCode: wx })
    if (r.data.needBind) { showWxBind.value = true }
    else enter(r)
  } catch (e) { toast(e.message, 'error') }
}
async function wechatBind() {
  if (!wxCode.value) return toast('微信登录已过期，请重新发起', 'warn')
  const phoneErr = checkPhone()
  if (phoneErr) return toast(phoneErr, 'warn')
  if (!smsCode.value) return toast('请输入验证码', 'warn')
  try {
    const r = await api.post('/auth/wechat-bind', {
      wxCode: wxCode.value,
      phone: phone.value,
      code: smsCode.value,
      password: password.value || undefined,
      nickname: nickname.value || undefined,
      inviteCode: inviteCode.value || null,
    })
    enter(r)
  } catch (e) { if (e.needAdmin) openContact(); toast(e.message, 'error') }
}
</script>

<style scoped>
.tab-bar { display: flex; border-bottom: 2px solid #f0ead8; margin-bottom: 14px; }
.tab { flex: 1; text-align: center; padding: 8px 0; cursor: pointer; color: #999; font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color .2s; }
.tab.active { color: var(--brand); font-weight: 600; border-bottom-color: var(--brand); }
.wx-row { margin-top: 16px; padding-top: 14px; border-top: 1px dashed #efe5d5; }
.btn-wx { background: #07c160; border-color: #07c160; color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(7,193,96,.25); }
.btn-wx:hover { background: #06ad56; }
.wx-ico { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: #fff; color: #07c160; font-size: 13px; font-weight: 700; align-items: center; justify-content: center; }
</style>
