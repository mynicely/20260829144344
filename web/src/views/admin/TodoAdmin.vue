<template>
  <div class="page admin-page">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>待办中心</h1>
      <button class="btn btn-outline" @click="load">🔄 刷新</button>
    </div>
    <AdminNav />

    <div class="card todo-summary">
      <p v-if="loading" class="muted">加载中...</p>
      <template v-else>
        <span class="tag" :style="todo.total > 0 ? 'background:#c62828;' : 'background:#2e7d32;'">
          {{ todo.total > 0 ? `共 ${todo.total} 项待处理` : '全部已处理，没有待办 🎉' }}
        </span>
        <span class="muted" style="margin-left:8px;">所有需要处理的事项汇总在这里，点击卡片直接进入处理，不用再到各栏目里翻找。</span>
      </template>
    </div>

    <div class="todo-grid" v-if="!loading">
      <div
        v-for="it in items"
        :key="it.key"
        class="todo-card"
        :class="{ done: it.count === 0 }"
        @click="go(it.to)"
      >
        <div class="todo-icon">{{ it.icon }}</div>
        <div class="todo-info">
          <div class="todo-title">
            {{ it.title }}
            <span v-if="it.count > 0" class="todo-num">{{ it.count > 99 ? '99+' : it.count }}</span>
          </div>
          <div class="todo-desc">{{ it.desc }}</div>
        </div>
        <div class="todo-arrow">{{ it.count > 0 ? '→' : '✓' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../api'
import AdminNav from './AdminNav.vue'

const router = useRouter()
const todo = ref({ total: 0 })
const loading = ref(true)

const items = computed(() => [
  { key: 'posts', icon: '📝', title: '客户发表文章', desc: '待管理员审核通过后展示', count: todo.value.posts || 0, to: '/admin/posts?status=pending' },
  { key: 'comments', icon: '💬', title: '评论审核', desc: '学员评论待审核', count: todo.value.comments || 0, to: '/admin/posts?cstatus=pending' },
  { key: 'orders', icon: '🧾', title: '订单确认收款', desc: '待确认收款订单', count: todo.value.orders || 0, to: '/admin/orders?status=pending' },
  { key: 'withdrawals', icon: '💰', title: '提现审核', desc: '提现申请待审核', count: todo.value.withdrawals || 0, to: '/admin/withdrawals?status=pending' },
  { key: 'withdrawalsPay', icon: '🏦', title: '提现打款', desc: '已通过待打款', count: todo.value.withdrawalsPay || 0, to: '/admin/withdrawals?status=approved' },
  { key: 'trials', icon: '🎓', title: '体验课预约', desc: '已预约待联系客户', count: todo.value.trials || 0, to: '/admin/trials?status=booked' },
  { key: 'learningTasks', icon: '📚', title: '作业待点评', desc: '学员已提交作业', count: todo.value.learningTasks || 0, to: '/admin/learning' },
  { key: 'groups', icon: '👥', title: '拼团收款确认', desc: '拼团订单待确认', count: todo.value.groups || 0, to: '/admin/marketing?tab=group&status=pending' },
  { key: 'bargains', icon: '🔪', title: '砍价收款确认', desc: '砍价订单待确认', count: todo.value.bargains || 0, to: '/admin/marketing?tab=bargain&status=pending' },
  { key: 'helpRewards', icon: '🎓', title: '培育奖发放', desc: '已达标待发放', count: todo.value.helpRewards || 0, to: '/admin/commissions?tab=help' },
  { key: 'fills', icon: '🔁', title: '管培生补位', desc: '名额冻结待补位', count: todo.value.fills || 0, to: '/admin/trainees' },
])

onMounted(load)
async function load() {
  loading.value = true
  try { const r = await api.get('/admin/todo-stats'); todo.value = r.data || {} } catch (e) { alert(e.message) }
  loading.value = false
}
function go(to) { router.push(to) }
</script>

<style scoped>
.todo-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.todo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.todo-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all .15s;
}
.todo-card:hover { border-color: #c62828; box-shadow: 0 2px 10px rgba(0,0,0,.08); transform: translateY(-1px); }
.todo-card.done { opacity: .5; }
.todo-card.done:hover { border-color: #2e7d32; }
.todo-icon { font-size: 26px; }
.todo-info { flex: 1; min-width: 0; }
.todo-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.todo-num {
  background: #c62828;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  padding: 0 7px;
  line-height: 18px;
}
.todo-desc { font-size: 12px; color: #999; margin-top: 3px; }
.todo-arrow { font-size: 18px; color: #c62828; }
.todo-card.done .todo-arrow { color: #2e7d32; }
</style>
