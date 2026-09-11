import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('./views/Home.vue'), meta: { title: '首页' } },
  { path: '/courses', component: () => import('./views/Courses.vue'), meta: { title: '爱心分享' } },
  { path: '/course/:id', component: () => import('./views/CourseDetail.vue'), meta: { title: '商品详情' } },
  { path: '/bargain/:id', component: () => import('./views/Bargain.vue'), meta: { title: '砍价' } },
  { path: '/tasks', component: () => import('./views/Tasks.vue'), meta: { title: '任务中心' } },
  { path: '/login', component: () => import('./views/Login.vue'), meta: { title: '登录' } },
  { path: '/mine', component: () => import('./views/Mine.vue'), meta: { title: '我的', auth: true } },
  { path: '/team', component: () => import('./views/Team.vue'), meta: { title: '我的学习圈', auth: true } },
  { path: '/community', component: () => import('./views/Community.vue'), meta: { title: '翰墨互动' } },
  { path: '/post/:id', component: () => import('./views/PostDetail.vue'), meta: { title: '动态详情' } },
  { path: '/community/my-posts', component: () => import('./views/MyPosts.vue'), meta: { title: '我的动态', auth: true } },
  { path: '/invite', component: () => import('./views/Invite.vue'), meta: { title: '邀请好友', auth: true } },
  { path: '/notifications', component: () => import('./views/Notifications.vue'), meta: { title: '消息通知', auth: true } },
  { path: '/my-courses', component: () => import('./views/MyCourses.vue'), meta: { title: '我的课程', auth: true } },
  { path: '/practice', component: () => import('./views/Practice.vue'), meta: { title: '在线练习', auth: true } },
  { path: '/practice/quiz', component: () => import('./views/PracticeQuiz.vue'), meta: { title: '答题', auth: true } },
  { path: '/practice/result', component: () => import('./views/PracticeResult.vue'), meta: { title: '练习成绩', auth: true } },
  { path: '/practice/wrong', component: () => import('./views/PracticeWrong.vue'), meta: { title: '错题本', auth: true } },
  { path: '/wallet', component: () => import('./views/Wallet.vue'), meta: { title: '我的钱包', auth: true } },
  { path: '/coupon-flows', component: () => import('./views/CouponFlows.vue'), meta: { title: '抵用券明细', auth: true } },
  { path: '/rules', component: () => import('./views/Rules.vue'), meta: { title: '规则公示' } },
  { path: '/about', component: () => import('./views/About.vue'), meta: { title: '关于我们' } },
  { path: '/group', component: () => import('./views/Group.vue'), meta: { title: '拼团购课' } },
  { path: '/group/:id', component: () => import('./views/GroupDetail.vue'), meta: { title: '拼团详情' } },
  { path: '/:pathMatch(.*)*', component: () => import('./views/NotFound.vue'), meta: { title: '页面不存在' } },
]

// 管理后台路由（路径前缀可配置，默认 /admin，可在后台「参数配置」中修改以防破解）
const adminRoutes = [
  { path: 'login', component: () => import('./views/admin/AdminLogin.vue'), meta: { title: '管理后台登录' } },
  { path: 'todo', component: () => import('./views/admin/TodoAdmin.vue'), meta: { title: '待办中心', admin: true } },
  { path: 'dashboard', component: () => import('./views/admin/Dashboard.vue'), meta: { title: '数据看板', admin: true } },
  { path: 'trials', component: () => import('./views/admin/TrialAdmin.vue'), meta: { title: '体验课管理', admin: true } },
  { path: 'company', component: () => import('./views/admin/CompanyAdmin.vue'), meta: { title: '公司介绍', admin: true } },
  { path: 'goods', component: () => import('./views/admin/GoodsAdmin.vue'), meta: { title: '商品管理', admin: true } },
  { path: 'ads', component: () => import('./views/admin/AdsAdmin.vue'), meta: { title: '广告管理', admin: true } },
  { path: 'learning', component: () => import('./views/admin/LearningAdmin.vue'), meta: { title: '学习任务', admin: true } },
  { path: 'posts', component: () => import('./views/admin/PostsAdmin.vue'), meta: { title: '内容审核', admin: true } },
  { path: 'reviews', component: () => import('./views/admin/ReviewsAdmin.vue'), meta: { title: '课程评价管理', admin: true } },
  { path: 'fission', component: () => import('./views/admin/FissionAdmin.vue'), meta: { title: '分享分析', admin: true } },
  { path: 'settings', component: () => import('./views/admin/Settings.vue'), meta: { title: '参数配置', admin: true } },
  { path: 'trainees', component: () => import('./views/admin/Trainees.vue'), meta: { title: '管培生管理', admin: true } },
  { path: 'bind', component: () => import('./views/admin/BindAdmin.vue'), meta: { title: '绑定关系管理', admin: true } },
  { path: 'orders', component: () => import('./views/admin/OrdersAdmin.vue'), meta: { title: '订单管理', admin: true } },
  { path: 'marketing', component: () => import('./views/admin/MarketingAdmin.vue'), meta: { title: '营销活动管理', admin: true } },
  { path: 'marketing-config', component: () => import('./views/admin/MarketingConfig.vue'), meta: { title: '营销参数', admin: true } },
  { path: 'commissions', component: () => import('./views/admin/CommissionsAdmin.vue'), meta: { title: '奖励流水管理', admin: true } },
  { path: 'withdrawals', component: () => import('./views/admin/WithdrawalsAdmin.vue'), meta: { title: '提现审核', admin: true } },
  { path: 'pay', component: () => import('./views/admin/PayConfig.vue'), meta: { title: '支付配置', admin: true } },
  { path: 'questions', component: () => import('./views/admin/QuestionsAdmin.vue'), meta: { title: '题库管理', admin: true } },
]

export function adminPrefix() {
  return (window.__ADMIN_PREFIX__ || localStorage.getItem('admin_prefix') || 'admin').replace(/^\/+|\/+$/g, '')
}

export function installAdminRoutes(prefix) {
  const p = String(prefix || 'admin').replace(/^\/+|\/+$/g, '')
  for (const r of adminRoutes) {
    router.addRoute({ ...r, path: '/' + p + '/' + r.path })
  }
  router.addRoute({ path: '/' + p, redirect: '/' + p + '/login' })
}

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  document.title = (to.meta.title ? to.meta.title + ' · ' : '') + '翰墨书院'

  const userToken = localStorage.getItem('token')
  const adminToken = localStorage.getItem('admin_token')
  const prefix = adminPrefix()

  // 隐藏默认后台路径：访问 /admin/* 时重定向到配置的新前缀（前缀为 admin 时不重定向）
  if (prefix !== 'admin' && (to.path === '/admin' || to.path.startsWith('/admin/'))) {
    return next('/' + prefix + to.path.slice(6))
  }

  if (to.meta.auth && !userToken) {
    return next('/login')
  }

  if (to.meta.admin && !adminToken) {
    return next('/' + prefix + '/login')
  }

  next()
})

export default router
