<template>
  <div class="page admin-page">
    <h1>营销参数</h1>
    <AdminNav />

    <div v-if="groups.length" class="card">
      <p class="muted" style="line-height:1.8;">
        分享奖励、管培生考核、名额补位、拼团砍价等营销规则集中在此配置，保存后<b style="color:#2e7d32;">实时生效</b>，无需改代码。
        修改介绍奖/待遇比例后，新订单按新规则结算；历史数据不受影响。
      </p>

      <div v-for="g in groups" :key="g.group" class="mt" style="border:1px solid #eee;border-radius:8px;padding:14px;margin-top:16px;">
        <h3 style="margin:0 0 4px;color:#333;">{{ g.label }}</h3>
        <div v-for="f in g.fields" :key="f.key" style="margin-top:12px;">
          <label class="label">
            {{ f.label }}
            <span v-if="f.unit" class="muted" style="font-weight:normal;">（{{ f.unit }}）</span>
          </label>
          <input
            v-if="f.type !== 'switch' && f.type !== 'array'"
            class="input"
            :type="f.type === 'number' || f.type === 'percent' ? 'number' : 'text'"
            :step="f.type === 'percent' ? '0.01' : '1'"
            v-model="form[f.key]"
            :placeholder="String(f.value ?? '')"
          />
          <input
            v-else-if="f.type === 'array'"
            class="input"
            v-model="form[f.key]"
            :placeholder="String(f.value ?? '').replace(/,/g, '，')"
          />
          <div v-else class="switch" @click="toggle(f.key)">
            <span class="sw" :class="{ on: form[f.key] == 1 }"></span>
            <span>{{ form[f.key] == 1 ? '开启' : '关闭' }}</span>
          </div>
          <p v-if="f.hint" class="muted" style="margin:4px 0 0;font-size:12px;">{{ f.hint }}</p>
        </div>
      </div>

      <button class="btn btn-block mt" style="margin-top:20px;" @click="save">💾 保存全部营销参数</button>
      <p class="muted" style="margin-top:10px;font-size:12px;">保存成功后提示「实时生效」即表示所有结算、考核、拼团砍价逻辑已按新参数运行。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const groups = ref([])
const form = reactive({})

onMounted(async () => {
  try {
    const d = (await api.get('/admin/marketing-config')).data
    groups.value = d
    for (const g of d) {
      for (const f of g.fields) {
        if (f.type === 'array') {
          form[f.key] = Array.isArray(f.value) ? f.value.join('，') : (f.value ?? '')
        } else {
          form[f.key] = f.value ?? ''
        }
      }
    }
  } catch (e) { alert(e.message) }
})

function toggle(key) {
  form[key] = form[key] == 1 ? 0 : 1
}

async function save() {
  try {
    const r = await api.post('/admin/marketing-config', { ...form })
    alert(r.msg)
  } catch (e) { alert(e.message) }
}
</script>
