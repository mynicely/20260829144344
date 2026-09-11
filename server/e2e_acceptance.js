// 翰墨分享 · 端到端验收测试脚本
// 使用独立测试库与 3101 端口，不污染正式数据
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const WORKSPACE = 'c:/Users/Administrator/CodeBuddy/20260829144344';
const DB_PATH = path.join(WORKSPACE, 'server/data/e2e_acceptance.db');
const BASE = 'http://localhost:3101';

// 清理旧测试库
for (const ext of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(DB_PATH + ext); } catch (e) {}
}

// 等待服务就绪
async function waitReady() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('服务未就绪');
}

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' | ' + JSON.stringify(extra) : '')); }
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { status: 0, json: { ok: false, msg: e.message } };
  }
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

const db = new DatabaseSync(DB_PATH);
const q = (sql, ...p) => db.prepare(sql).get(...p);
const qa = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

async function main() {
  console.log('\n========== 翰墨分享 E2E 验收测试 ==========\n');
  await waitReady();

  // 1. 健康检查
  let r = await api('GET', '/api/health');
  check('健康检查返回运行中', r.json && r.json.ok === true, r.json);

  // 2. 管理员登录
  r = await api('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  const adminToken = r.json && r.json.data && r.json.data.token;
  check('管理员登录成功', !!adminToken, r.json);

  // 3. 直接写入种子用户 A（模拟老用户 / 管理员协助注册的首个推广成员）
  const seedHash = bcrypt.hashSync('123456', 10);
  run(`INSERT INTO users (phone, nickname, invite_code, identity, role, is_paid, product_type, password_hash, referrer_id)
       VALUES (?, '种子主理人A', 'SEEDA', 'promoter', 'user', 1, '499', ?, NULL)`,
      '13800000001', seedHash);
  const userA = q('SELECT * FROM users WHERE phone=?', '13800000001');
  check('种子用户A已创建', userA && userA.identity === 'promoter', userA);

  // 4. 用户注册 + 邀请码绑定
  r = await api('POST', '/api/auth/register', { phone: '13800000002', password: '123456', nickname: '学员B', inviteCode: 'SEEDA' });
  const tokenB = r.json && r.json.data && r.json.data.token;
  const userB = r.json && r.json.data && r.json.data.user;
  check('学员B注册成功并绑定A', tokenB && userB && userB.referrer_id === userA.id, r.json);

  r = await api('POST', '/api/auth/register', { phone: '13800000003', password: '123456', nickname: '学员C', inviteCode: 'SEEDA' });
  const tokenC = r.json && r.json.data && r.json.data.token;
  const userC = r.json && r.json.data && r.json.data.user;
  check('学员C注册成功并绑定A', tokenC && userC && userC.referrer_id === userA.id, r.json);

  // 5. manual 模式下单 + 后台确认收款（覆盖线下支付链路）
  // 默认 pay_mode=manual
  r = await api('POST', '/api/order', { productType: '499', joinFission: true }, tokenB);
  const orderB = r.json && r.json.data && r.json.data.order;
  check('B 下单 manual 模式生成待支付订单', orderB && orderB.status === 'pending' && r.json.data.payMode === 'manual', r.json);

  r = await api('POST', '/api/admin/orders/' + orderB.id + '/confirm-pay', { payType: 'wechat', note: '测试收款' }, adminToken);
  check('后台确认收款后 B 订单结算成功', r.json && r.json.ok === true, r.json);
  const orderBPaid = q('SELECT * FROM orders WHERE id=?', orderB.id);
  check('B 订单状态变为 paid', orderBPaid && orderBPaid.status === 'paid', orderBPaid);
  const userBPromoter = q('SELECT * FROM users WHERE id=?', userB.id);
  check('B 已升级为 promoter', userBPromoter && userBPromoter.identity === 'promoter' && userBPromoter.is_paid === 1, userBPromoter);
  const commAB = q('SELECT * FROM direct_commissions WHERE order_id=?', orderB.id);
  check('A 获得 B 的介绍奖 100', commAB && commAB.amount === 100 && commAB.status === 'paid', commAB);

  // 6. 切到 mock 模式，加速后续下单结算
  run(`INSERT INTO settings (key, value) VALUES ('pay_mode', ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`, JSON.stringify({ v: 'mock' }));

  // 7. C 下单（mock）→ A 介绍奖
  r = await api('POST', '/api/order', { productType: '499', joinFission: true }, tokenC);
  const orderC = r.json && r.json.data && r.json.data.order;
  check('C mock 下单并立即支付', orderC && orderC.status === 'paid', r.json);
  const commAC = q('SELECT * FROM direct_commissions WHERE order_id=?', orderC.id);
  check('A 获得 C 的介绍奖 100', commAC && commAC.amount === 100 && commAC.status === 'paid', commAC);

  // 8. 管培生名额：B、C 占 A 的 slot1、slot2（assessment）
  const slotB = q('SELECT * FROM trainees WHERE user_id=?', userB.id);
  const slotC = q('SELECT * FROM trainees WHERE user_id=?', userC.id);
  check('B 是 A 的 slot1 考核名额', slotB && slotB.leader_id === userA.id && slotB.slot_no === 1 && slotB.slot_type === 'assessment', slotB);
  check('C 是 A 的 slot2 考核名额', slotC && slotC.leader_id === userA.id && slotC.slot_no === 2 && slotC.slot_type === 'assessment', slotC);

  // 9. 建团拦截：前2名额正常在位后，第3名可开自有学习圈
  r = await api('POST', '/api/auth/register', { phone: '13800000005', password: '123456', nickname: '学员E', inviteCode: 'SEEDA' });
  const tokenE = r.json && r.json.data && r.json.data.token;
  const userE = r.json && r.json.data && r.json.data.user;
  r = await api('POST', '/api/order', { productType: '499', joinFission: true }, tokenE);
  const orderE = r.json && r.json.data && r.json.data.order;
  const slotE = q('SELECT * FROM trainees WHERE user_id=?', userE.id);
  check('E 成为 A 的第3名自有学习圈成员', orderE && orderE.status === 'paid' && slotE && slotE.slot_no === 3 && slotE.slot_type === 'permanent', { orderE, slotE });

  // 10. B 直推 F → B 介绍奖 + A 培育奖 200
  r = await api('POST', '/api/auth/register', { phone: '13800000006', password: '123456', nickname: '学员F', inviteCode: userB.invite_code });
  const tokenF = r.json && r.json.data && r.json.data.token;
  const userF = r.json && r.json.data && r.json.data.user;
  check('F 注册绑定 B', userF && userF.referrer_id === userB.id, userF);
  r = await api('POST', '/api/order', { productType: '499', joinFission: true }, tokenF);
  const orderF = r.json && r.json.data && r.json.data.order;
  check('F mock 下单并立即支付', orderF && orderF.status === 'paid', r.json);
  const commBF = q('SELECT * FROM direct_commissions WHERE order_id=?', orderF.id);
  check('B 获得 F 的介绍奖 100', commBF && commBF.amount === 100 && commBF.status === 'paid', commBF);
  const helpBonusA = q('SELECT * FROM help_bonuses WHERE order_id=?', orderF.id);
  check('A 获得 F 的主理人培育奖 200', helpBonusA && helpBonusA.amount === 200 && helpBonusA.status === 'paid' && helpBonusA.mentor_id === userA.id, helpBonusA);

  // 11. 时间穿越：把关键订单/佣金/加入时间改到 8 月，以便考核与待遇结算命中“上月”
  const augBase = '2026-08-10 10:00:00';
  run(`UPDATE orders SET paid_at=? WHERE id IN (?, ?, ?)`, augBase, orderB.id, orderC.id, orderE.id);
  run(`UPDATE orders SET paid_at=? WHERE id=?`, augBase, orderF.id);
  run(`UPDATE direct_commissions SET created_at=? WHERE id IN (?, ?, ?, ?)`, augBase, commAB.id, commAC.id, commBF.id,
      q('SELECT id FROM direct_commissions WHERE order_id=?', orderE.id).id);
  run(`UPDATE help_bonuses SET created_at=? WHERE id=?`, augBase, helpBonusA.id);

  // 12. 滚动考核：把 B/C/E/F 的 join_at 改到 35 天前，跑每日检测
  const joinAt = '2026-07-27 10:00:00';
  run(`UPDATE trainees SET join_at=? WHERE user_id IN (?, ?, ?, ?)`, joinAt, userB.id, userC.id, userE.id, userF.id);
  r = await api('POST', '/api/admin/run-daily-check', {}, adminToken);
  check('手动执行每日考核+待遇结算', r.json && r.json.ok === true, r.json);

  const slotBAfter = q('SELECT * FROM trainees WHERE user_id=?', userB.id);
  const slotCAfter = q('SELECT * FROM trainees WHERE user_id=?', userC.id);
  check('B 滚动考核合格（2单/998）', slotBAfter && slotBAfter.month_status === 'qualified' && slotBAfter.finished_cycle === 1, slotBAfter);
  check('C 滚动考核见习（1单/499）', slotCAfter && slotCAfter.month_status === 'probation', slotCAfter);

  // 13. 待遇结算：A 对 B、C 的 10% 待遇
  const allowanceA = q('SELECT COALESCE(SUM(amount),0) s FROM leader_allowances WHERE leader_id=?', userA.id);
  // B 8月到账奖励=介绍奖100；C=100；待遇=(100+100)*10%=20
  check('A 获得主理人待遇 10 元', allowanceA && allowanceA.s === 10, allowanceA);

  // 14. 培育奖 help_rewards：B qualified、C probation → 未全额解锁
  const helpRewardLocked = q(`SELECT COUNT(*) c FROM help_rewards WHERE mentor_id=? AND status IN ('locked','full')`, userA.id);
  check('A 名下 help_rewards 未全额解锁（C 未合格）', helpRewardLocked && helpRewardLocked.c >= 2, helpRewardLocked);

  // 15. 钱包余额与提现
  // 重新取 A token：A 没有登录过，用 login
  const rA = await api('POST', '/api/auth/login', { phone: '13800000001', password: '123456' });
  const tokenA = rA.json.data.token;
  const walletRes = await api('GET', '/api/user/wallet', null, tokenA);
  const walletBefore = walletRes.json.data;
  check('A 钱包可提现余额正确(510=300介绍奖+10待遇+200培育奖)', walletBefore.withdrawable === 510, walletBefore);

  r = await api('POST', '/api/user/withdraw', { amount: 100, payType: 'alipay', account: '13800000001', realName: 'A' }, tokenA);
  check('A 提现 100 成功', r.json && r.json.ok === true, r.json);
  r = await api('POST', '/api/user/withdraw', { amount: 1000, payType: 'alipay', account: '13800000001', realName: 'A' }, tokenA);
  check('A 超额提现被拦截', r.json && r.json.ok === false && r.status === 400, r.json);

  // 16. 退款：退 F 单 → B 介绍奖回滚 + A 培育奖回滚 + 业绩冲减
  const walletBeforeRefund = (await api('GET', '/api/user/wallet', null, tokenA)).json.data;
  r = await api('POST', '/api/admin/orders/' + orderF.id + '/refund', { note: '测试退款' }, adminToken);
  check('F 订单退款成功', r.json && r.json.ok === true, r.json);
  const commBFAfter = q('SELECT * FROM direct_commissions WHERE id=?', commBF.id);
  const helpBonusAAfter = q('SELECT * FROM help_bonuses WHERE id=?', helpBonusA.id);
  check('B 的介绍奖已标记 refunded', commBFAfter && commBFAfter.status === 'refunded', commBFAfter);
  check('A 的培育奖已标记 refunded', helpBonusAAfter && helpBonusAAfter.status === 'refunded', helpBonusAAfter);
  const walletAfterRefund = (await api('GET', '/api/user/wallet', null, tokenA)).json.data;
  check('A 退款后可提现余额减少 200（helpBonus 被剔除）', walletAfterRefund.withdrawable === walletBeforeRefund.withdrawable - 200, { before: walletBeforeRefund, after: walletAfterRefund });
  const refundLog = q(`SELECT * FROM pay_logs WHERE order_no=? AND event='refund'`, orderF.order_no);
  check('退款写入 pay_logs 对账日志', !!refundLog, refundLog);

  // 17. 帖子先审后发
  r = await api('POST', '/api/community/posts', { title: 'B 的测试帖', content: '这是 B 发布的测试内容', category: 'works' }, tokenB);
  const postBId = r.json && r.json.id;
  check('B 发帖成功（待审核）', postBId && r.json.ok === true, r.json);
  r = await api('GET', '/api/community/posts', null, null);
  const publicVisibleBefore = r.json && r.json.data && r.json.data.some(p => p.id === postBId);
  check('待审核帖子未出现在公开列表', !publicVisibleBefore, r.json);
  r = await api('POST', '/api/admin/posts/' + postBId + '/status', { status: 'approved' }, adminToken);
  check('管理员审核通过帖子', r.json && r.json.ok === true, r.json);
  r = await api('GET', '/api/community/posts', null, null);
  const publicVisibleAfter = r.json && r.json.data && r.json.data.some(p => p.id === postBId);
  check('审核通过后帖子公开可见', publicVisibleAfter, r.json);

  // 18. 评论审核
  r = await api('POST', '/api/community/posts/' + postBId + '/comment', { content: 'C 的评论' }, tokenC);
  check('C 评论成功（待审核）', r.json && r.json.ok === true, r.json);
  const comment = q(`SELECT * FROM post_comments WHERE post_id=? AND user_id=?`, postBId, userC.id);
  r = await api('POST', '/api/admin/comments/' + comment.id + '/status', { status: 'approved' }, adminToken);
  check('管理员审核通过评论', r.json && r.json.ok === true, r.json);
  const postAfterComment = q('SELECT * FROM posts WHERE id=?', postBId);
  check('帖子评论数 +1', postAfterComment && postAfterComment.comment_count === 1, postAfterComment);

  // 19. 敏感词拦截
  r = await api('POST', '/api/admin/sensitive-words', { words: '免费领课,刷单返利' }, adminToken);
  check('管理员设置敏感词', r.json && r.json.ok === true, r.json);
  r = await api('POST', '/api/community/posts', { title: '违规帖', content: '这里有免费领课的内容', category: 'works' }, tokenC);
  check('含敏感词发帖被拦截', r.json && r.json.ok === false && r.status === 400, r.json);

  // 20. 越权防护
  r = await api('GET', '/api/admin/users', null, tokenB);
  check('普通用户 token 访问 admin 接口被拒绝', r.status === 401 || r.status === 403, r.json);
  r = await api('PUT', '/api/community/posts/' + postBId, { content: 'C 尝试修改 B 的帖子' }, tokenC);
  check('C 不能编辑 B 的帖子', r.status === 404 || r.status === 403, r.json);

  // 21. 体验课预约
  r = await api('POST', '/api/trial/book', { subject: '毛笔楷书', mode: 'offline', preferTime: '周末上午', inviteCode: 'SEEDA' }, tokenB);
  check('B 预约体验课成功', r.json && r.json.ok === true, r.json);

  // 22. 后台数据看板可访问
  r = await api('GET', '/api/admin/dashboard', null, adminToken);
  check('管理员数据看板返回统计', r.json && r.json.ok === true && r.json.data, r.json);

  // ========== 23-27. 财务风控：forgo_share_reward 二选一 + 拼团/砍价强制隔离 ==========

  // 23. 正价 499 下单选【放弃本单分享奖励】(forgoShareReward=1)：课程到账、无介绍奖、无名额、不升级身份
  r = await api('POST', '/api/auth/register', { phone: '13800000007', password: '123456', nickname: '学员G', inviteCode: 'SEEDA' });
  const tokenG = r.json && r.json.data && r.json.data.token;
  const userG = r.json && r.json.data && r.json.data.user;
  check('G 注册并绑定 A', userG && userG.referrer_id === userA.id, userG);
  r = await api('POST', '/api/order', { productType: '499', joinFission: false, forgoShareReward: 1 }, tokenG);
  const orderG = r.json && r.json.data && r.json.data.order;
  const orderGRow = orderG && q('SELECT * FROM orders WHERE id=?', orderG.id);
  check('G 放弃奖励：订单 forgo_share_reward=1 且 join_fission=0', orderGRow && orderGRow.forgo_share_reward === 1 && orderGRow.join_fission === 0, orderGRow);
  const userGAfter = q('SELECT * FROM users WHERE id=?', userG.id);
  check('G 放弃奖励：课程到账(is_paid=1)、身份保持 learner', userGAfter && userGAfter.is_paid === 1 && userGAfter.identity === 'learner', userGAfter);
  check('G 放弃奖励：A 无介绍奖', !q('SELECT * FROM direct_commissions WHERE order_id=?', orderG.id), null);
  check('G 放弃奖励：无管培生名额', !q('SELECT * FROM trainees WHERE user_id=?', userG.id), null);

  // 24. 正价 499 下单选【参与分享有奖】(forgoShareReward=0)：奖励完整、升级身份
  r = await api('POST', '/api/auth/register', { phone: '13800000008', password: '123456', nickname: '学员H', inviteCode: 'SEEDA' });
  const tokenH = r.json && r.json.data && r.json.data.token;
  const userH = r.json && r.json.data && r.json.data.user;
  check('H 注册并绑定 A', userH && userH.referrer_id === userA.id, userH);
  r = await api('POST', '/api/order', { productType: '499', joinFission: true, forgoShareReward: 0 }, tokenH);
  const orderH = r.json && r.json.data && r.json.data.order;
  const orderHRow = orderH && q('SELECT * FROM orders WHERE id=?', orderH.id);
  check('H 参与分享：订单 forgo_share_reward=0 且 join_fission=1', orderHRow && orderHRow.forgo_share_reward === 0 && orderHRow.join_fission === 1, orderHRow);
  check('H 参与分享：A 获得介绍奖 100', !!q('SELECT * FROM direct_commissions WHERE order_id=? AND amount=100', orderH.id), null);
  check('H 参与分享：成为 A 的考核名额', !!q('SELECT * FROM trainees WHERE user_id=? AND leader_id=?', userH.id, userA.id), null);
  const userHAfter = q('SELECT * FROM users WHERE id=?', userH.id);
  check('H 参与分享：升级为 promoter', userHAfter && userHAfter.identity === 'promoter', userHAfter);

  // 25. promoter 用户发起砍价：后端强制 forgo_share_reward=1（不采信前端参数）
  run(`UPDATE courses SET is_bargain=1 WHERE id=?`, 2);
  r = await api('POST', '/api/bargain/start', { courseId: 2 }, tokenH);
  const bargainOrder = r.json && r.json.data && r.json.data.order;
  const bargainRow = bargainOrder && q('SELECT * FROM orders WHERE id=?', bargainOrder.id);
  check('promoter 发起砍价：订单 forgo_share_reward=1 且 join_fission=0', bargainRow && bargainRow.forgo_share_reward === 1 && bargainRow.join_fission === 0, bargainRow);
  check('promoter 发起砍价：不产生介绍奖', !q('SELECT * FROM direct_commissions WHERE order_id=?', bargainOrder.id), null);

  // 26. promoter 用户开团：后端强制 forgo_share_reward=1
  r = await api('POST', '/api/group/create', { courseId: 3 }, tokenH);
  const groupOrder = r.json && r.json.data && r.json.data.order;
  const groupRow = groupOrder && q('SELECT * FROM orders WHERE id=?', groupOrder.id);
  check('promoter 开团：订单 forgo_share_reward=1 且 join_fission=0', groupRow && groupRow.forgo_share_reward === 1 && groupRow.join_fission === 0, groupRow);
  check('promoter 开团：不产生介绍奖', !q('SELECT * FROM direct_commissions WHERE order_id=?', groupOrder.id), null);

  // 27. 边界：promoter 参与拼团/砍价放弃奖励后，再买正价课仍可正常参与分享有奖（放弃仅当笔生效）
  r = await api('POST', '/api/order', { productType: '499', joinFission: true, forgoShareReward: 0 }, tokenH);
  const orderH2 = r.json && r.json.data && r.json.data.order;
  const orderH2Row = orderH2 && q('SELECT * FROM orders WHERE id=?', orderH2.id);
  check('H 回归正价课：订单 forgo_share_reward=0 且 join_fission=1', orderH2Row && orderH2Row.forgo_share_reward === 0 && orderH2Row.join_fission === 1, orderH2Row);
  const userHFinal = q('SELECT * FROM users WHERE id=?', userH.id);
  check('H 回归正价课：仍为 promoter 分享身份', userHFinal && userHFinal.identity === 'promoter', userHFinal);
  check('H 回归正价课：A 再次获得介绍奖 100', !!q('SELECT * FROM direct_commissions WHERE order_id=? AND amount=100', orderH2.id), null);

  console.log('\n========== 验收结果 ==========');
  console.log('通过: ' + passed + ' / 失败: ' + failed);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
