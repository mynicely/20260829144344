// 全局合规文案（评审要求多处埋入，不允许删除）
const COMPLIANCE = {
  homeTop: '付费均为教学服务费，分享推广权益为平台赠与',
  courseBottom: '付费为教学服务费，分享推广权益为平台赠与，非加盟收费',
  mineBottom: '推广权益为平台赠与，零业绩零收益',
  taskBottom: '任务获取抵现金存在每日上限，抵现金仅抵扣学费，不支持提现',
  invitePure: '当前为纯学习模式，开启后才可使用分享推广相关能力',
}

// 印章风格状态标签（合格｜见习｜失效｜冻结待补位｜永久作废｜待审核｜已退款｜拼团中｜砍价中等）
const SEAL_STATUS = {
  qualified: { text: '合格', cls: 'seal-qualified' },
  probation: { text: '见习', cls: 'seal-probation' },
  invalid: { text: '失效', cls: 'seal-invalid' },
  frozen: { text: '冻结待补位', cls: 'seal-frozen' },
  void: { text: '永久作废', cls: 'seal-void' },
  pending: { text: '待审核', cls: 'seal-pending' },
  approved: { text: '已通过', cls: 'seal-approved' },
  rejected: { text: '已驳回', cls: 'seal-rejected' },
  refunded: { text: '已退款', cls: 'seal-refunded' },
  opening: { text: '拼团中', cls: 'seal-opening' },
  active: { text: '砍价中', cls: 'seal-active' },
  success: { text: '已成功', cls: 'seal-success' },
  expired: { text: '已过期', cls: 'seal-expired' },
  normal: { text: '正常在岗', cls: 'seal-qualified' },
}

// 课程档位 → 印章角标
const COURSE_LEVEL = {
  '499': { text: '基础班', cls: 'seal-basic' },
  '1299': { text: '进阶班', cls: 'seal-advance' },
  '2999': { text: '终身班', cls: 'seal-lifetime' },
}

// 体验课年龄段
const AGE_GROUPS = ['少儿启蒙 4-7岁', '少儿基础 8-12岁', '青少年 13-17岁', '成人零基础', '成人进阶']

// 社区栏目（后端 /api/post-categories 动态获取，此为兜底）
const POST_CATEGORIES = [
  { label: '作品展示', value: 'works' },
  { label: '碑帖资料', value: 'materials' },
  { label: '活动交流', value: 'activity' },
]

// 收益类型说明（结算时机标注，避免用户误解）
const INCOME_TYPES = [
  { key: 'direct', label: '介绍奖励', settle: '订单成交实时到账', color: 'cinnabar' },
  { key: 'help', label: '培育奖', settle: '满足孵化条件后周期达标结算', color: 'stone' },
  { key: 'allowance', label: '学习圈主理人待遇', settle: '按月自然月周期达标结算，非实时', color: 'ink' },
]

module.exports = {
  COMPLIANCE,
  SEAL_STATUS,
  COURSE_LEVEL,
  AGE_GROUPS,
  POST_CATEGORIES,
  INCOME_TYPES,
}
