<template>
  <div class="page admin-page">
    <h1>分享分析</h1>
    <AdminNav />

    <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
      <h2 style="margin-bottom:0;">分享总览</h2>
      <router-link to="/admin/bind" class="btn btn-outline" style="font-size:13px;padding:6px 12px;">🔗 绑定关系管理</router-link>
    </div>
    <div class="card">
      <p>总用户：<b>{{ stats.totalUsers }}</b>｜推广用户：<b>{{ stats.promoters }}</b>｜已付费：<b>{{ stats.paid }}</b></p>
      <p>介绍关系总数：<b>{{ stats.referralCount }}</b>｜累计发放介绍奖：<b class="price">¥{{ stats.totalDirect }}</b></p>
      <p>主理人待遇累计：<b class="price">¥{{ stats.totalAllowance }}</b>｜培育奖累计：<b class="price">¥{{ stats.totalHelp }}</b></p>
    </div>

    <div class="card">
      <h2>推广排行榜（介绍Top）</h2>
      <table class="table">
        <tr><th>排名</th><th>用户</th><th>介绍人数</th><th>付费</th></tr>
        <tr v-for="(u,i) in rank" :key="u.id">
          <td>{{ i + 1 }}</td><td>{{ u.nickname }}</td><td>{{ u.direct }}</td>
          <td>{{ u.is_paid ? '¥' + u.product_type : '否' }}</td>
        </tr>
        <tr v-if="!rank.length"><td colspan="4" class="muted">暂无数据</td></tr>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const stats = ref(null)
const rank = ref([])

onMounted(async () => {
  try {
    stats.value = (await api.get('/admin/fission')).data
  } catch (e) {}
  try {
    rank.value = (await api.get('/fission/rank')).data
  } catch (e) {}
})
</script>
