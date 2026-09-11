<template>
  <div class="page">
    <div class="card">
      <button class="btn btn-outline" @click="$router.back()">← 返回</button>
    </div>

    <div class="wallet-hero" v-if="w">
      <span class="wh-coin">¥</span>
      <span class="wh-grain">富</span>
      <div class="wh-label">可提现余额（分享收益）</div>
      <p class="wallet-balance">
        <CountUp :value="Number(w.withdrawable) || 0" :decimals="2" prefix="¥" />
      </p>
      <div class="wh-sub">
        <span>提现中 <b>¥{{ fmtMoney(w.applied) }}</b></span>
        <span class="wh-dot">·</span>
        <span>已提现 <b>¥{{ fmtMoney(w.withdrawn) }}</b></span>
      </div>
      <p v-if="w.frozen" class="wh-freeze">⚠️ {{ w.freezeMsg }}</p>
    </div>

    <div class="card" v-if="w">
      <h2>收益构成</h2>
      <div class="earn-row"><span>分享奖励</span><b class="price">¥{{ fmtMoney(w.breakdown.direct) }}</b></div>
      <div class="earn-row"><span>主理人待遇(其奖励收入10%)</span><b class="price">¥{{ fmtMoney(w.breakdown.allowance) }}</b></div>
      <div class="earn-row"><span>培育奖</span><b class="price">¥{{ fmtMoney(w.breakdown.help) }}</b></div>
      <div class="earn-row"><span>主理人培育奖</span><b class="price">¥{{ fmtMoney(w.breakdown.helpBonus) }}</b></div>
      <p class="muted mt" style="font-size:12px;">抵用券余额为学习抵现金（打卡/任务所得），禁止提现、退款、折现，仅可抵扣课程续费、升级、线下活动、学习物料。</p>
    </div>

    <div class="card" v-if="w">
      <h2>发起提现</h2>
      <label class="label">提现金额（单笔最低 ¥{{ fmtMoney(w.minWithdraw) }}）</label>
      <input class="input" type="number" step="0.01" v-model.number="form.amount" placeholder="输入金额" />
      <button v-if="w.withdrawable > 0" class="btn btn-outline" style="margin:6px 0;font-size:12px;" @click="form.amount = Number(w.withdrawable.toFixed(2))">全部提现 ¥{{ fmtMoney(w.withdrawable) }}</button>
      <label class="label">收款方式</label>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <button v-for="p in payTypes" :key="p.k" class="pay-type" :class="{ on: form.payType === p.k }" @click="form.payType = p.k">{{ p.label }}</button>
      </div>
      <label class="label">收款账号</label>
      <input class="input" v-model="form.account" :placeholder="form.payType === 'bank' ? '银行卡号' : form.payType === 'alipay' ? '支付宝账号' : '微信号'" />
      <label class="label">收款人姓名</label>
      <input class="input" v-model="form.realName" placeholder="真实姓名（须与收款账户一致）" />
      <button class="btn btn-block mt" :disabled="submitting" @click="submit">提交提现申请</button>
    </div>

    <div class="card">
      <h2>提现记录</h2>
      <div v-for="r in records" :key="r.id" class="trial-item">
        <p style="display:flex;justify-content:space-between;align-items:center;">
          <b class="price">¥{{ fmtMoney(r.amount) }}</b>
          <span class="tag" :style="tagStyle(r.status)">{{ statusText(r.status) }}</span>
        </p>
        <p class="muted">{{ payTypeText(r.pay_type) }}｜{{ r.account }}（{{ r.real_name }}）｜{{ r.created_at }}</p>
        <p v-if="r.admin_remark" class="muted">审核备注：{{ r.admin_remark }}</p>
      </div>
      <p v-if="!records.length" class="muted">暂无提现记录，获得分享收益后可在这里提现</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useUserStore } from '../store'
import { dialog } from '../utils/dialog'
import { fmtMoney } from '../utils/fmt'
import CountUp from '../components/CountUp.vue'

const router = useRouter()
const store = useUserStore()
const w = ref(null)
const records = ref([])
const submitting = ref(false)
const form = ref({ amount: null, payType: 'wechat', account: '', realName: '' })
const payTypes = [
  { k: 'wechat', label: '微信' },
  { k: 'alipay', label: '支付宝' },
  { k: 'bank', label: '银行卡' },
]

onMounted(async () => {
  if (!store.token) { router.push('/login'); return }
  load()
})

async function load() {
  try { w.value = (await api.get('/user/wallet')).data } catch (e) {}
  try { records.value = (await api.get('/user/withdrawals')).data } catch (e) {}
}

async function submit() {
  const amount = Number(form.value.amount)
  if (!amount || amount <= 0) return alert('请输入有效金额')
  // 金额仅保留两位小数（资金精度：分）
  if (!Number.isInteger(Math.round(amount * 100)) || Math.round(amount * 100) !== amount * 100) return alert('金额最多保留两位小数')
  if (amount < w.value.minWithdraw) return alert(`单笔提现最低 ¥${fmtMoney(w.value.minWithdraw)}`)
  if (amount > w.value.withdrawable) return alert(`可提现余额不足，当前 ¥${fmtMoney(w.value.withdrawable)}`)
  if (!form.value.account || !form.value.realName) return alert('请填写收款账号与收款人姓名')
  if (form.value.payType === 'bank' && !/^\d{12,19}$/.test(String(form.value.account).trim())) return alert('银行卡号格式不正确')
  if (form.value.payType === 'alipay' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$|^1[3-9]\d{9}$/.test(String(form.value.account).trim())) return alert('支付宝账号格式不正确（邮箱或手机号）')
  if (!(await dialog.confirm(`确认提交提现申请 ¥${fmtMoney(amount)}？`))) return
  submitting.value = true
  try {
    const r = await api.post('/user/withdraw', { ...form.value, amount })
    alert(r.msg)
    form.value = { amount: null, payType: 'wechat', account: '', realName: '' }
    load()
  } catch (e) { alert(e.message) } finally { submitting.value = false }
}

function statusText(s) { return { pending: '待审核', approved: '待打款', paid: '已打款', rejected: '已驳回' }[s] || s }
function payTypeText(s) { return { wechat: '微信', alipay: '支付宝', bank: '银行卡' }[s] || s }
function tagStyle(s) {
  return {
    pending: 'background:#f57c00;',
    approved: 'background:#1976d2;',
    paid: 'background:#2e7d32;',
    rejected: 'background:#d32f2f;',
  }[s] || ''
}
</script>

<style scoped>
.wallet-hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #f3d78a 0%, #e2b54a 30%, #c9972a 62%, #a87c1d 100%);
  border-radius: 20px;
  padding: 24px 22px;
  margin-bottom: 12px;
  text-align: center;
  color: #4a3209;
  box-shadow: 0 14px 34px rgba(180, 132, 24, .35);
}
.wallet-hero::after {
  content: '';
  position: absolute; left: -40px; top: -46px;
  width: 160px; height: 160px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, .35);
  background: radial-gradient(circle, rgba(255,255,255,.28) 0%, transparent 60%);
}
.wh-coin {
  position: absolute; right: 14px; top: 6px;
  font-size: 84px; font-weight: 900;
  color: rgba(255, 246, 214, .30);
  line-height: 1; pointer-events: none;
}
.wh-grain {
  position: absolute; left: 8px; bottom: -18px;
  font-size: 108px; font-weight: 900;
  color: rgba(122, 88, 12, .12);
  line-height: 1; pointer-events: none; user-select: none;
}
.wh-label { font-size: 13px; font-weight: 600; color: rgba(74, 50, 9, .75); position: relative; }
.wallet-balance {
  position: relative;
  font-size: 42px; font-weight: 900;
  margin: 6px 0 2px;
  letter-spacing: .5px;
  text-shadow: 0 2px 0 rgba(255, 255, 255, .4);
}
.wh-sub { font-size: 12.5px; color: rgba(74, 50, 9, .78); font-weight: 500; position: relative; }
.wh-sub b { font-size: 13px; }
.wh-dot { margin: 0 8px; opacity: .55; }
.wh-freeze {
  margin-top: 10px; padding: 8px 10px;
  border-radius: 8px;
  background: rgba(140, 22, 22, .16);
  color: #7a1414;
  font-size: 12px; font-weight: 600;
  border: 1px solid rgba(140, 22, 22, .25);
}
.wallet-balance :deep(.count-up) { font-variant-numeric: tabular-nums; }
.earn-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed #eee; font-size: 14px; }
.earn-row:last-child { border-bottom: none; }
.pay-type { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 8px; background: #fff; color: #666; cursor: pointer; font-size: 13px; }
.pay-type.on { border-color: #8b4513; background: #8b4513; color: #fff; }
</style>
