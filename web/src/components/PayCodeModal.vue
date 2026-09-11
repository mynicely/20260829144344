<template>
  <div class="modal-mask" v-if="visible">
    <div class="modal">
      <h2 style="margin-bottom:6px;">💳 请完成转账</h2>
      <p class="muted" style="font-size:13px;">订单号：{{ orderNo }}</p>
      <p class="pay-amount">应付金额 <b class="price" style="font-size:26px;">¥{{ fmtMoney(pay) }}</b></p>

      <div class="receive-block" v-if="receiveInfo.wechatQr || receiveInfo.wechatAccount">
        <p class="receive-title">📱 微信转账</p>
        <img v-if="receiveInfo.wechatQr" :src="receiveInfo.wechatQr" class="qr-img" alt="微信收款码" />
        <p v-if="receiveInfo.wechatAccount" class="muted">微信号：{{ receiveInfo.wechatAccount }} <button class="copy-btn" @click="copy(receiveInfo.wechatAccount)">复制</button></p>
      </div>

      <div class="receive-block" v-if="receiveInfo.alipayQr || receiveInfo.alipayAccount">
        <p class="receive-title">💙 支付宝转账</p>
        <img v-if="receiveInfo.alipayQr" :src="receiveInfo.alipayQr" class="qr-img" alt="支付宝收款码" />
        <p v-if="receiveInfo.alipayAccount" class="muted">支付宝：{{ receiveInfo.alipayAccount }} <button class="copy-btn" @click="copy(receiveInfo.alipayAccount)">复制</button></p>
      </div>

      <div class="receive-block" v-if="receiveInfo.bankAccount">
        <p class="receive-title">🏦 银行转账</p>
        <p class="muted">户名：{{ receiveInfo.bankHolder || '-' }}</p>
        <p class="muted">银行：{{ receiveInfo.bankName || '-' }}｜账号：{{ receiveInfo.bankAccount }} <button class="copy-btn" @click="copy(receiveInfo.bankAccount)">复制</button></p>
      </div>

      <p v-if="!receiveInfo.wechatQr && !receiveInfo.wechatAccount && !receiveInfo.alipayQr && !receiveInfo.alipayAccount && !receiveInfo.bankAccount" class="muted" style="text-align:center;padding:12px;">
        收款方式暂未配置，请联系管理员（当前仅提交了订单，尚未开通）
      </p>

      <div class="notice-box" v-if="receiveInfo.notice">{{ receiveInfo.notice }}</div>

      <p class="muted" style="font-size:12px;margin-top:10px;line-height:1.8;">
        转账完成后请耐心等待，管理员在后台确认到账后会自动为您开通课程并结算相关奖励/收益。您也可到「我的」-「我的课程」查看开通进度。
      </p>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-block" @click="$emit('close')">我已转账，知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toRefs } from 'vue'
import { fmtMoney } from '../utils/fmt'

const props = defineProps({
  visible: Boolean,
  receiveInfo: { type: Object, default: () => ({}) },
  orderNo: String,
  pay: [Number, String],
})
defineEmits(['close'])
const { receiveInfo, orderNo, pay } = toRefs(props)

function copy(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(String(text || ''))
  const fake = document.createElement('textarea')
  fake.value = String(text || '')
  document.body.appendChild(fake)
  fake.select()
  try { document.execCommand('copy') } catch (e) {}
  fake.remove()
  alert('收款账号已复制')
}
</script>

<style scoped>
.pay-amount { margin: 8px 0; display: flex; align-items: baseline; gap: 6px; }
.receive-block { border: 1px solid #eee; border-radius: 8px; padding: 10px; margin-top: 8px; }
.receive-title { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
.qr-img { width: 120px; height: 120px; object-fit: contain; display: block; margin: 6px auto; border: 1px solid #eee; border-radius: 8px; background: #fff; }
.copy-btn { margin-left: 4px; padding: 1px 8px; font-size: 11px; border: 1px solid #8b4513; color: #8b4513; border-radius: 4px; background: #fff; cursor: pointer; }
.notice-box { margin-top: 10px; background: #fff8e1; border: 1px solid #ffe082; color: #795548; border-radius: 8px; padding: 8px 10px; font-size: 12px; line-height: 1.8; }
</style>
