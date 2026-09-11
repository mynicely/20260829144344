<template>
  <div class="admin-nav">
    <router-link to="/admin/todo">待办<span v-if="todoTotal > 0" class="todo-badge">{{ todoTotal > 99 ? '99+' : todoTotal }}</span></router-link>
    <router-link to="/admin/dashboard">看板</router-link>
    <router-link to="/admin/trials">体验课</router-link>
    <router-link to="/admin/company">公司</router-link>
    <router-link to="/admin/goods">商品</router-link>
    <router-link to="/admin/ads">广告</router-link>
    <router-link to="/admin/learning">任务</router-link>
    <router-link to="/admin/posts">内容</router-link>
    <router-link to="/admin/fission">分享</router-link>
    <router-link to="/admin/trainees">管培生</router-link>
    <router-link to="/admin/bind">绑定</router-link>
    <router-link to="/admin/orders">订单</router-link>
    <router-link to="/admin/marketing">营销</router-link>
    <router-link to="/admin/reviews">评价</router-link>
    <router-link to="/admin/questions">题库</router-link>
    <router-link to="/admin/commissions">奖励</router-link>
    <router-link to="/admin/withdrawals">提现</router-link>
    <router-link to="/admin/pay">支付</router-link>
    <router-link to="/admin/settings">参数</router-link>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
const todoTotal = ref(0)
onMounted(async () => {
  try { const r = await api.get('/admin/todo-stats'); todoTotal.value = (r.data && r.data.total) || 0 } catch (e) {}
})
</script>

<style scoped>
.todo-badge {
  display: inline-block;
  background: #c62828;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  margin-left: 4px;
  vertical-align: 1px;
}
</style>
