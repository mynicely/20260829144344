<template>
  <div class="page admin-page">
    <h1>支付配置</h1>
    <AdminNav />

    <div class="card">
      <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;align-items:center;">
        <span style="font-weight:bold;">当前模式：</span>
        <span class="tag" :style="{ background: modeColor(cfg._mode) }">{{ modeText(cfg._mode) }}</span>
        <span class="tag" :style="{ background: cfg._configured ? '#2e7d32' : '#d32f2f' }">
          {{ cfg._configured ? '微信支付参数完整' : '微信支付参数未完整' }}
        </span>
      </div>

      <p class="muted" style="line-height:1.8;font-size:13px;">
        <b>线下确认收款（推荐，未开通微信商户收款前使用）</b>：客户下单后弹出您配置的收款码/账号，线下转账完成后由您在「订单管理」中点击「确认收款」，系统才会开通课程并结算奖励/名额。<br/>
        <b>模拟支付</b>：下单即支付成功，仅用于本地演示/验收。<br/>
        <b>微信支付</b>：真实微信商户收款，需填齐下方商户参数。
      </p>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn" :style="form.pay_mode === 'manual' ? 'background:#8b4513;color:#fff;' : ''" @click="form.pay_mode = 'manual'">线下确认收款</button>
        <button class="btn" :style="form.pay_mode === 'mock' ? 'background:#f57c00;color:#fff;' : ''" @click="form.pay_mode = 'mock'">模拟支付</button>
        <button class="btn" :style="form.pay_mode === 'wxpay' ? 'background:#2e7d32;color:#fff;' : ''" @click="form.pay_mode = 'wxpay'">微信支付（真实收款）</button>
      </div>

      <!-- 线下收款信息 -->
      <template v-if="form.pay_mode === 'manual'">
        <h2 style="margin:14px 0 6px;">线下收款信息（展示给客户的收款方式）</h2>
        <p class="muted" style="font-size:12px;line-height:1.8;">收款码图片支持图片URL或Base64（可先用 /api/upload 上传后填入返回的URL）。至少配置一种收款方式，否则客户下单后看不到收款码。</p>

        <label class="label">微信收款码图片（pay_receive_wechat_qr）</label>
        <input class="input" v-model="form.pay_receive_wechat_qr" placeholder="/uploads/xxx.png 或 https://..." />
        <div v-if="form.pay_receive_wechat_qr" style="margin:6px 0;"><img :src="form.pay_receive_wechat_qr" style="width:100px;height:100px;object-fit:contain;border:1px solid #eee;border-radius:8px;" /></div>

        <label class="label">微信收款账号/微信号（pay_receive_wechat_account）</label>
        <input class="input" v-model="form.pay_receive_wechat_account" placeholder="微信号" />

        <label class="label">支付宝收款码图片（pay_receive_alipay_qr）</label>
        <input class="input" v-model="form.pay_receive_alipay_qr" placeholder="/uploads/xxx.png 或 https://..." />
        <div v-if="form.pay_receive_alipay_qr" style="margin:6px 0;"><img :src="form.pay_receive_alipay_qr" style="width:100px;height:100px;object-fit:contain;border:1px solid #eee;border-radius:8px;" /></div>

        <label class="label">支付宝收款账号（pay_receive_alipay_account）</label>
        <input class="input" v-model="form.pay_receive_alipay_account" placeholder="支付宝账号" />

        <label class="label">银行户名（pay_receive_bank_holder）</label>
        <input class="input" v-model="form.pay_receive_bank_holder" placeholder="收款人姓名" />

        <label class="label">银行名称（pay_receive_bank_name）</label>
        <input class="input" v-model="form.pay_receive_bank_name" placeholder="如：中国工商银行" />

        <label class="label">银行账号（pay_receive_bank_account）</label>
        <input class="input" v-model="form.pay_receive_bank_account" placeholder="银行卡号" />

        <label class="label">付款提示文案（pay_receive_notice，选填）</label>
        <textarea class="input" rows="2" v-model="form.pay_receive_notice" placeholder="如：请转账时备注您的手机号，便于核对到账"></textarea>
      </template>

      <!-- 微信支付参数 -->
      <template v-else>
        <label class="label">微信小程序 AppID（wxpay_appid）</label>
        <input class="input" v-model="form.wxpay_appid" placeholder="wx1234567890abcdef" />

        <label class="label">微信小程序 AppSecret（仅用于 wx.login 换 openid）</label>
        <input class="input" type="password" v-model="form.wxpay_appsecret" :placeholder="filled.wxpay_appsecret ? '已填写（留空保持不变）' : '小程序后台获取'" />

        <label class="label">微信支付商户号（wxpay_mchid）</label>
        <input class="input" v-model="form.wxpay_mchid" placeholder="10位商户号" />

        <label class="label">APIv3 密钥（wxpay_api_v3_key）</label>
        <input class="input" type="password" v-model="form.wxpay_api_v3_key" :placeholder="filled.wxpay_api_v3_key ? '已填写（留空保持不变）' : '32位字符串'" />

        <label class="label">商户API证书序列号（wxpay_apiclient_serial）</label>
        <input class="input" v-model="form.wxpay_apiclient_serial" placeholder="证书序列号" />

        <label class="label">商户API私钥（wxpay_apiclient_key，apiclient_key.pem 内容）</label>
        <textarea class="input" rows="4" v-model="form.wxpay_apiclient_key" :placeholder="filled.wxpay_apiclient_key ? '已填写（留空保持不变）' : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'"></textarea>

        <label class="label">支付回调地址（wxpay_notify_url，需公网可访问 https 域名）</label>
        <input class="input" v-model="form.wxpay_notify_url" placeholder="https://你的域名/api/pay/notify" />

        <label class="label">微信支付平台证书公钥（wxpay_platform_pub，用于回调验签）</label>
        <textarea class="input" rows="4" v-model="form.wxpay_platform_pub" :placeholder="filled.wxpay_platform_pub ? '已填写（留空保持不变）' : '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'"></textarea>
      </template>

      <button class="btn btn-block mt" @click="save">💾 保存支付配置</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const cfg = ref({ _mode: 'manual', _configured: false })
const form = reactive({
  pay_mode: 'manual',
  pay_receive_wechat_qr: '', pay_receive_wechat_account: '',
  pay_receive_alipay_qr: '', pay_receive_alipay_account: '',
  pay_receive_bank_name: '', pay_receive_bank_account: '', pay_receive_bank_holder: '',
  pay_receive_notice: '',
  wxpay_appid: '', wxpay_appsecret: '', wxpay_mchid: '',
  wxpay_api_v3_key: '', wxpay_apiclient_serial: '', wxpay_apiclient_key: '',
  wxpay_notify_url: '', wxpay_platform_pub: '',
})
const filled = reactive({})

function modeText(m) { return { manual: '线下确认收款', mock: '模拟支付', wxpay: '微信支付（真实）' }[m] || m }
function modeColor(m) { return { manual: '#8b4513', mock: '#f57c00', wxpay: '#2e7d32' }[m] || '#666' }

onMounted(async () => {
  try {
    const d = (await api.get('/admin/pay-config')).data
    cfg.value = d
    form.pay_mode = d.pay_mode?.value || 'manual'
    form.pay_receive_wechat_qr = d.pay_receive_wechat_qr?.value || ''
    form.pay_receive_wechat_account = d.pay_receive_wechat_account?.value || ''
    form.pay_receive_alipay_qr = d.pay_receive_alipay_qr?.value || ''
    form.pay_receive_alipay_account = d.pay_receive_alipay_account?.value || ''
    form.pay_receive_bank_name = d.pay_receive_bank_name?.value || ''
    form.pay_receive_bank_account = d.pay_receive_bank_account?.value || ''
    form.pay_receive_bank_holder = d.pay_receive_bank_holder?.value || ''
    form.pay_receive_notice = d.pay_receive_notice?.value || ''
    form.wxpay_appid = d.wxpay_appid?.value || ''
    form.wxpay_appsecret = ''
    form.wxpay_mchid = d.wxpay_mchid?.value || ''
    form.wxpay_api_v3_key = ''
    form.wxpay_apiclient_serial = d.wxpay_apiclient_serial?.value || ''
    form.wxpay_apiclient_key = ''
    form.wxpay_notify_url = d.wxpay_notify_url?.value || ''
    form.wxpay_platform_pub = ''
    for (const k of ['wxpay_appsecret', 'wxpay_api_v3_key', 'wxpay_apiclient_key', 'wxpay_platform_pub']) {
      filled[k] = !!d[k]?.filled
    }
  } catch (e) { alert(e.message) }
})

async function save() {
  try {
    const r = await api.post('/admin/pay-config', { ...form })
    alert(r.msg)
    const d = (await api.get('/admin/pay-config')).data
    cfg.value = d
    form.pay_mode = d.pay_mode?.value || 'manual'
    for (const k of ['wxpay_appsecret', 'wxpay_api_v3_key', 'wxpay_apiclient_key', 'wxpay_platform_pub']) {
      filled[k] = !!d[k]?.filled
    }
  } catch (e) { alert(e.message) }
}
</script>
