// ============================================================
// 奖励结算引擎（核心）
// 介绍奖 / 培育奖 / 主理人10%待遇 / 管培生考核·清退·补位
// 所有逻辑可后台参数化配置
// ============================================================
const db = require('./db');

const _stmts = {};
function S(key, sql) {
  if (!_stmts[key]) _stmts[key] = db.prepare(sql);
  return _stmts[key];
}

// 读取配置值（数值）
function getSettingNum(key) {
  const row = S('s_' + key, 'SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value).v; } catch (e) { return null; }
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function thisMonth() {
  return now().slice(0, 7); // YYYY-MM
}
// 数据库时间字符串 <-> 毫秒时间戳（数据库存的是本地时间 'YYYY-MM-DD HH:MM:SS'）
function dbTimeToMs(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.getTime();
}
function msToDbTime(ms) {
  // 必须生成与数据库 datetime('now','localtime') 一致的【本地时间】字符串，不能用 toISOString(UTC)
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// 上一个月份（YYYY-MM）
function prevMonth(m) {
  const [y, mo] = String(m || thisMonth()).split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---------- 邀请码（6-8位字母数字，全局唯一；注册/预约必填绑定关系） ----------
// 字符集剔除易混淆的 0O1lI，保证人工抄写/口播不出错
const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function genInviteCode(len) {
  const n = len || 6 + Math.floor(Math.random() * 3); // 6~8位
  let s = '';
  for (let i = 0; i < n; i++) s += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  return s;
}
function uniqueInviteCode() {
  let code;
  do { code = genInviteCode(); } while (S('g_ic', 'SELECT id FROM users WHERE invite_code=?').get(code));
  return code;
}
// 给指定用户补发邀请码（老账号懒生成；有则返回原码）
function ensureInviteCode(user) {
  if (!user) return null;
  if (user.invite_code) return user.invite_code;
  const code = uniqueInviteCode();
  S('u_ic', `UPDATE users SET invite_code=? WHERE id=?`).run(code, user.id);
  user.invite_code = code;
  return code;
}
// 解析邀请输入：纯数字=用户ID(兼容旧分享链接 ?ref=ID)，否则按 invite_code 匹配
function resolveInvite(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return S('g_ic_id', 'SELECT * FROM users WHERE id=?').get(Number(s));
  return S('g_ic_code', 'SELECT * FROM users WHERE invite_code=?').get(s);
}
// 邀请码必填校验（受 invite_code_required 开关控制）：
// 必填模式：无码/无效 → 返回错误提示并附管理员联系方式（PRD：找管理员协助注册）
// 选填模式：能解析则返回邀请人，否则返回 null（不拦截）
function requireInvite(input) {
  const required = (getSettingNum('invite_code_required') ?? 1) === 1;
  const contact = getSettingNum('admin_contact') || '';
  const hint = contact ? `（管理员联系方式：${contact}）` : '';
  if (!required) {
    return { ok: true, required: false, inviter: resolveInvite(input) };
  }
  if (!input) {
    return { ok: false, required: true, err: `请填写邀请码（向邀请你的朋友索取）；没有邀请码请联系管理员协助注册${hint}` };
  }
  const inviter = resolveInvite(input);
  if (!inviter) {
    return { ok: false, required: true, err: `邀请码无效，请联系管理员协助注册${hint}` };
  }
  return { ok: true, required: true, inviter };
}

// ---------- 订单成交后的介绍奖励结算 ----------
// 规则：付费用户成交，给其直接推荐人发放介绍奖（可提现）
// 补充：若推荐人（主理人）本人是"见习管培生"，则其介绍奖减半（受开关控制）
function settleDirectCommission(order) {
  const referrerId = order.referrer_id;
  if (!referrerId) return null;
  // 规则：普通消费者(identity='learner')可分享锁定客户，但无奖励资格；
  // 只有推荐人是分享系统成员(identity='promoter')，其名下客户成交才发介绍奖励。
  const requirePaid = (getSettingNum('require_paid_referrer') ?? 1) === 1;
  if (requirePaid) {
    const referrer = S('g_ref', 'SELECT * FROM users WHERE id=?').get(referrerId);
    if (!referrer || referrer.identity !== 'promoter') {
      return { locked: true, amount: 0, msg: '推荐人非分享系统成员，奖励锁定（锁定客户关系）' };
    }
  }
  let amount = getSettingNum('direct_' + order.product_type) || 100;
  // 见习减半判断：推荐人作为某个主理人的管培生，当前状态为见习
  const probationHalf = (getSettingNum('probation_half') || 1) === 1;
  if (probationHalf) {
    const asTrainee = S('ref_trainee', `SELECT * FROM trainees WHERE user_id=? AND in_pool=1`).get(referrerId);
    if (asTrainee && asTrainee.month_status === 'probation') {
      amount = Math.floor(amount / 2);
    }
  }
  // 奖励冻结期（防退款）：commission_freeze_days 天内存入 frozen，到期由 dailyCheck 转 paid
  const freezeDays = getSettingNum('commission_freeze_days') || 0;
  const dcStatus = freezeDays > 0 ? 'frozen' : 'paid';
  const info = S('ins_dc', `INSERT INTO direct_commissions (order_id, referrer_id, user_id, product_type, amount, status) VALUES (?,?,?,?,?,?)`)
    .run(order.id, referrerId, order.user_id, order.product_type, amount, dcStatus);
  // 主理人培育奖：推荐人本人若是在库管培生(成员)，其名下每介绍1名付费分享学员，帮扶主理人(helper)获固定奖励
  // 规则(老板)：成员新增1个分享学员，成员拿介绍奖，成员所在学习圈的主理人拿200培育奖
  if (order.join_fission === 1) {
    const refTrainee = S('ref_t', `SELECT * FROM trainees WHERE user_id=? AND in_pool=1`).get(referrerId);
    // 帮扶主理人 = 该成员所在帮扶学习圈主理人；无 helper 时回退 leader_id（老数据兼容）
    const mentorId = refTrainee && (refTrainee.helper_id || refTrainee.leader_id);
    if (refTrainee && mentorId) {
      const bonus = getSettingNum('help_bonus_per_order') || 200;
      S('ins_hb', `INSERT INTO help_bonuses (mentor_id, referrer_id, order_id, amount, status) VALUES (?,?,?,?,'paid')`)
        .run(mentorId, referrerId, order.id, bonus);
    }
  }
  return { id: info.lastInsertRowid, amount };
}

// ---------- 用户成交后，沿关系链：管培生计入名额业绩 ----------
// 一个付费学员的产生，会把它记到其介绍推荐人的"考核名额"里（作为该推荐人介绍的管培生）
function assignTraineeSlot(user) {
  // 仅分享系统成员(promoter)占用管培生名额；纯学习用户不占名额
  if (!user || user.identity !== 'promoter') return null;
  const referrerId = user.referrer_id;
  if (!referrerId) return null;
  const referrer = S('g_u', 'SELECT * FROM users WHERE id=?').get(referrerId);
  if (!referrer) return null;
  // 只有推广身份才需要名额
  if (referrer.identity !== 'promoter') return null;

  // 该推荐人已有多少个"考核名额"(前 slot_limit 名是孵化名额，其后终身绑定)
  const slotLimit = getSettingNum('slot_limit') || 2;
  const slotCount = S('cnt_slot', 'SELECT COUNT(*) c FROM trainees WHERE leader_id=?').get(referrerId).c;
  const slotNo = slotCount + 1;
  const slotType = slotNo <= slotLimit ? 'assessment' : 'permanent';

  // ==========【业务约束：先留店，后开团】==========
  // 生成自己学习圈成员名额(slot_no>slot_limit,第3名起)前，必须已给介绍人留下 slot_limit 名
  // "有效在位"的管培生名额。判定以 slot_status 为准：
  //   normal=在岗考核中(含合格/见习/失效预警) 均算"已留下"；
  //   frozen=业绩不达标被清退待补位、void=永久作废，均视为空缺，必须补位补满后方可开团。
  // 拦截仅阻止创建 trainee 学习圈名额，用户身份仍正常升级为 promoter、介绍奖励/业绩照常入账。
  if (slotNo > slotLimit) {
    const keptSlots = S('kept_slots', `
      SELECT id FROM trainees
      WHERE leader_id=? AND slot_no<=? AND in_pool=1 AND slot_status='normal'
    `).all(referrerId, slotLimit);
    if (keptSlots.length < slotLimit) {
      return {
        ok: false,
        locked: true,
        msg: `您还未给介绍人留下${slotLimit}名有效管培生名额（有名额被清退或作废），暂不能组建自己的学习圈。请先完成补位，补满留给介绍人的${slotLimit}个名额后再试。`
      };
    }
  }
  // ============================================

  // 帮扶主理人(helper)：与 leader_id(推荐人,终身绑定,享10%待遇)分开
  // 规则(老板)：推荐人转介绍的前 slot_limit 名(第1、2名)送给介绍人留店 → 帮扶人为推荐人所在帮扶学习圈主理人；
  //             第 slot_limit+1 名起(第3名)才是推荐人自己的学习圈成员 → 帮扶人=推荐人自己
  let helperId = referrerId;
  if (slotNo <= slotLimit) {
    const refTrainee = S('g_ref_t', 'SELECT * FROM trainees WHERE user_id=? AND in_pool=1').get(referrerId);
    if (refTrainee && refTrainee.helper_id) helperId = refTrainee.helper_id;
  }

  // 全表查该学员是否已占用名额（不限 leader/in_pool，规避 user_id 唯一约束冲突）：
  // 若已有记录（含转绑、补位、被清退的旧记录），保持原归属，不重复插入
  const existing = S('g_t', 'SELECT * FROM trainees WHERE user_id=?').get(user.id);
  if (existing) {
    return { slotNo: existing.slot_no, slotType: existing.slot_type || slotType, helperId: existing.helper_id || helperId, reused: true };
  }
  S('ins_t', `INSERT INTO trainees (user_id, leader_id, slot_no, slot_type, helper_id, in_pool) VALUES (?,?,?,?,?,1)`)
    .run(user.id, referrerId, slotNo, slotType, helperId);
  // 前 slot_limit 名创建培育奖记录：归属帮扶主理人(helper)，组键=推荐人(referrer_id)
  if (slotNo <= slotLimit) {
    const hr = S('ins_hr', `INSERT INTO help_rewards (mentor_id, referrer_id, newbie_id, slot_no, hatched_count, status) VALUES (?,?,?,?,0,'locked')`)
      .run(helperId, referrerId, user.id, slotNo);
    return { slotNo, slotType, helperId, helpRewardId: hr.lastInsertRowid };
  }
  return { slotNo, slotType, helperId };
}

// 成交后计入管培生业绩（致命修复）：买家自购 + 推荐人介绍 各计一次
function creditTraineePerf(order) {
  const perf = Number(order.amount) || 0;
  let buyerCredit = null, referrerCredit = null;
  if (perf <= 0) return { buyerCredit, referrerCredit };
  // 买家自己若是在库管培生，其自购计入本人当月业绩
  const buyerT = S('g_t_b', `SELECT * FROM trainees WHERE user_id=? AND in_pool=1`).get(order.user_id);
  if (buyerT) {
    S('up_perf_b', `UPDATE trainees SET month_perf=month_perf+?, month_orders=month_orders+1 WHERE id=?`).run(perf, buyerT.id);
    buyerCredit = buyerT.id;
  }
  // 推荐人若是在库管培生，其介绍成交计入其当月业绩（仅统计介绍成交）
  if (order.referrer_id) {
    const refT = S('g_t_r', `SELECT * FROM trainees WHERE user_id=? AND in_pool=1`).get(order.referrer_id);
    if (refT) {
      S('up_perf_r', `UPDATE trainees SET month_perf=month_perf+?, month_orders=month_orders+1 WHERE id=?`).run(perf, refT.id);
      referrerCredit = refT.id;
    }
  }
  return { buyerCredit, referrerCredit };
}

// ---------- 管培生状态判定（兼容保留） ----------
// 注意：滚动周期考核（dailyCheck）已改为直接回查 orders 原始订单判定状态，
// 本函数仅基于内存 month_perf/month_orders 做近似判定，【不再用于周期考核】，
// 保留导出仅为兼容历史调用方（后台手动查看等场景），请勿在周期逻辑中引用。
function evaluateTrainee(t) {
  const qualifyPerf = getSettingNum('qualify_perf') || 1000;
  const qualifyOrders = getSettingNum('qualify_orders') || 2;
  let status;
  if (t.month_perf >= qualifyPerf || t.month_orders >= qualifyOrders) {
    status = 'qualified'; // 合格
  } else if (t.month_perf > 0 || t.month_orders > 0) {
    status = 'probation'; // 见习
  } else {
    status = 'invalid';   // 失效(零业绩)
  }
  S('up_t_stat', `UPDATE trainees SET month_status=? WHERE id=?`).run(status, t.id);
  return status;
}

// 每日检测：管培生滚动周期考核（逐人独立周期，从 join_at 起算）+ 清退 + 补位倒计时检测
// 每个管培生拥有独立的滚动考核周期（trainee_cycle_days 天，默认30），不走全局自然月：
//   - 周期起点 = trainees.join_at【真实成为管培生时间，全程不被改写】
//   - finished_cycle 记录"已考核完成的周期轮数"，防止服务重启/数据回滚后重复执行同一轮考核
//   - 未走完一个完整周期（刚加入/刚补位）→ 不考核，保护月底新加入的成员
//   - 走完完整周期且 finished_cycle < 应完成轮数 → 回查 orders 原始订单统计该周期【真实业绩】
//     （不依赖内存 month_perf/month_orders，服务重启/漏跑/退款后仍与真实订单一致）判定状态；
//     周期内零业绩则 zero_perf_months+1，有业绩则清零；达到 clear_months 触发清退
//   - 判定后仅推进 finished_cycle（join_at 保持真实入职时间），开启下一轮，互不影响
function dailyCheck() {
  const reserveDays = getSettingNum('reserve_days') || 30;
  const reserveMax = getSettingNum('reserve_max') || 2;
  const nowStr = now();
  const nowMs = Date.now();
  // 奖励冻结期到账：冻结到期奖励转 paid（可提现）
  const freezeDays = getSettingNum('commission_freeze_days') || 0;
  if (freezeDays > 0) {
    S('unfreeze_comm', `UPDATE direct_commissions SET status='paid' WHERE status='frozen' AND julianday('now','localtime') - julianday(created_at) >= ?`).run(freezeDays);
  }

  // ---------- 管培生滚动周期考核（每个管培生各自独立周期，非集体重置） ----------
  const cycleDays = getSettingNum('trainee_cycle_days') || 30;
  const clearMonths = getSettingNum('clear_months') || 2;
  const qualifyPerf = getSettingNum('qualify_perf') || 1000;
  const qualifyOrders = getSettingNum('qualify_orders') || 2;
  const cycleMs = cycleDays * 24 * 3600 * 1000;

  const trainees = S('all_t', `SELECT * FROM trainees WHERE in_pool=1 AND slot_status='normal'`).all();
  for (const t of trainees) {
    const joinMs = dbTimeToMs(t.join_at);
    if (!joinMs) continue;
    // 从入职至今已走完的完整周期总数
    const fullCycleCount = Math.floor((nowMs - joinMs) / cycleMs);
    // 没有新的已完成周期待考核 → 跳过（防重复执行同一轮考核）
    if (fullCycleCount <= (t.finished_cycle || 0)) continue;

    let zeroAcc = t.zero_perf_months || 0;
    // 逐个处理所有"已结束但未考核"的周期（服务停机多天也不会漏算），
    // 每个周期独立回查订单判定，零业绩计数连续累加
    for (let idx = (t.finished_cycle || 0); idx < fullCycleCount; idx++) {
      const cycleStartMs = joinMs + idx * cycleMs;
      const cycleEndMs = joinMs + (idx + 1) * cycleMs;
      const cycleStartStr = msToDbTime(cycleStartMs);
      const cycleEndStr = msToDbTime(cycleEndMs);

      // 【BUG2 修复】回查原始订单：本周期内本人自购 OR 作为推荐人成交的已支付订单（排除已退款）
      const perfRow = S('cycle_perf_q', `SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM orders
        WHERE status='paid' AND paid_at BETWEEN ? AND ? AND (user_id=? OR referrer_id=?)`)
        .get(cycleStartStr, cycleEndStr, t.user_id, t.user_id);
      const cyclePerf = perfRow.s, cycleOrders = perfRow.c;

      // 用真实订单数据判定状态，不读内存 month_perf
      let status;
      if (cyclePerf >= qualifyPerf || cycleOrders >= qualifyOrders) {
        status = 'qualified'; // 合格
      } else if (cyclePerf > 0 || cycleOrders > 0) {
        status = 'probation'; // 见习
      } else {
        status = 'invalid';   // 失效(零业绩)
      }
      S('up_t_stat_cycle', `UPDATE trainees SET month_status=? WHERE id=?`).run(status, t.id);

      // 连续零业绩计数：仅统计完整滚动周期（本周期业绩为0才累加）
      if (cyclePerf <= 0 && cycleOrders <= 0) zeroAcc += 1; else zeroAcc = 0;
      S('up_zero_cycle', `UPDATE trainees SET zero_perf_months=?, last_zero_month=NULL WHERE id=?`)
        .run(zeroAcc, t.id);

      // 本轮未达标 → 实时预警对应主理人（按周期触发，通知去重不刷屏）
      if (status === 'invalid' || status === 'probation') {
        const reason = status === 'invalid' ? '零业绩已失效' : '未达标(见习)';
        insertNotice(t.leader_id, 'trainee_warning',
          `您的管培生（名额#${t.slot_no}）本轮考核${reason}，请及时跟进。连续${clearMonths}个完整周期零业绩将触发清退，届时收入将冻结。`);
      }

      // 达到连续零业绩阈值 → 清退（冻结+补位倒计时/永久作废），本名额停止后续周期考核
      if (zeroAcc >= clearMonths) {
        clearTrainee(t.id, reserveDays, reserveMax, nowStr);
        break;
      }
    }
    // 【BUG1 修复】本轮全部已考核周期标记完成：只推进 finished_cycle，join_at 真实入职时间保持不变
    S('finish_cycle_upd', `UPDATE trainees SET finished_cycle=?, month_perf=0, month_orders=0 WHERE id=?`)
      .run(fullCycleCount, t.id);
  }

  // 检测所有冻结待补位名额的倒计时
  const frozen = S('frozen', `SELECT * FROM trainees WHERE slot_status='frozen' AND reserve_deadline IS NOT NULL`).all();
  for (const f of frozen) {
    if (nowStr > f.reserve_deadline) {
      // 超时未补位 → 永久作废
      S('void_slot', `UPDATE trainees SET slot_status='void', in_pool=0, exit_at=? WHERE id=?`).run(nowStr, f.id);
    }
  }

  // 冻结待补位提醒（补位倒计时）
  const frozenSlots = S('frozen2', `SELECT * FROM trainees WHERE slot_status='frozen' AND in_pool=1`).all();
  const fillByLeader = {};
  for (const fs of frozenSlots) (fillByLeader[fs.leader_id] || (fillByLeader[fs.leader_id] = [])).push(fs);
  for (const lid of Object.keys(fillByLeader)) {
    const parts = fillByLeader[lid].map(fs => `#${fs.slot_no}（截止 ${fs.reserve_deadline}）`).join('、');
    insertNotice(Number(lid), 'fill_remind',
      `您的名额${parts}待补位。不补位将冻结所有收入。`);
  }
  // 主理人待遇暂停检测
  checkLeaderPause();
}

// 插入通知（去重：同一类型+内容不重复插入）
function insertNotice(userId, type, content) {
  const dup = S('dup_notice', `SELECT id FROM notices WHERE user_id=? AND type=? AND content=? AND is_read=0`).get(userId, type, content);
  if (dup) return;
  S('ins_notice', `INSERT INTO notices (user_id, type, content) VALUES (?,?,?)`).run(userId, type, content);
}

// 主理人待遇暂停检测：连续N月名下无合格管培生、无学习圈业绩 → 暂停整体待遇
function checkLeaderPause() {
  const pauseMonths = getSettingNum('leader_pause_months') || 3;
  // 找出所有作为主理人(leader)的用户
  const leaders = S('leaders', `SELECT DISTINCT leader_id FROM trainees WHERE in_pool=1`).all();
  for (const l of leaders) {
    const leaderId = l.leader_id;
    // 名下当前合格管培生数
    const qualifiedCount = S('lq', `SELECT COUNT(*) c FROM trainees WHERE leader_id=? AND month_status='qualified' AND in_pool=1`).get(leaderId).c;
    const teamPerf = S('lp', `SELECT COALESCE(SUM(month_perf),0) s FROM trainees WHERE leader_id=? AND in_pool=1`).get(leaderId).s;
    if (qualifiedCount === 0 && teamPerf === 0) {
      insertNotice(leaderId, 'frozen_income', '您连续多个月名下无合格管培生、无学习圈业绩，整体待遇已暂停，直至重新孵化有效管培生。');
    }
  }
}

// 清退一名管培生：待遇冻结 + 30天补位倒计时
function clearTrainee(traineeId, reserveDays, reserveMax, nowStr) {
  const t = S('g_t2', 'SELECT * FROM trainees WHERE id=?').get(traineeId);
  if (!t) return;
  // 已作废的名额不再清退
  if (t.slot_status === 'void') return;
  // 终身绑定名额(permanent)不参与补位失效；考核名额(assessment)参与补位；补位名额(replace)仍可再补位
  const slotLimit = getSettingNum('slot_limit') || 2;
  if (t.slot_type === 'permanent' || (!t.slot_type && t.slot_no > slotLimit)) {
    // 终身绑定名额：保留，但本月不计待遇（按失效处理）
    S('up_cleared_perm', `UPDATE trainees SET month_status='cleared', in_pool=0, exit_at=? WHERE id=?`).run(nowStr, t.id);
    return;
  }

  // 检查补位次数是否已达上限
  if (t.reserve_count >= reserveMax) {
    // 永久作废
    S('void_slot', `UPDATE trainees SET slot_status='void', in_pool=0, exit_at=? WHERE id=?`).run(nowStr, t.id);
    return;
  }

  // 冻结 + 生成30天补位倒计时
  const deadline = new Date(Date.now() + reserveDays * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  S('freeze_slot', `UPDATE trainees SET month_status='cleared', slot_status='frozen', reserve_deadline=?, exit_at=? WHERE id=?`)
    .run(deadline, nowStr, t.id);
}

// 补位：主理人补推1名已付费的介绍学员 → 名额交接给新学员并恢复考核
function fillReserve(traineeId, newUserId) {
  const t = S('g_t2', 'SELECT * FROM trainees WHERE id=?').get(traineeId);
  if (!t) return { ok: false, msg: '名额不存在' };
  if (t.slot_status !== 'frozen') return { ok: false, msg: '当前名额不在待补位状态' };
  const reserveMax = getSettingNum('reserve_max') || 2;
  const newCount = t.reserve_count + 1;
  if (newCount > reserveMax) {
    S('void_slot', `UPDATE trainees SET slot_status='void', in_pool=0 WHERE id=?`).run(t.id);
    return { ok: false, msg: '补位次数已达上限，名额永久作废' };
  }
  if (!newUserId) {
    return { ok: false, msg: '请选择补位的新学员' };
  }
  // 校验新学员：须为该主理人介绍、已付费、且未占任何名额
  const newUser = S('g_nu', 'SELECT * FROM users WHERE id=?').get(newUserId);
  if (!newUser) return { ok: false, msg: '新学员不存在' };
  if (newUser.referrer_id !== t.leader_id) return { ok: false, msg: '补位学员必须是您介绍的学员' };
  if (newUser.is_paid !== 1) return { ok: false, msg: '补位学员需为已付费学员' };
  // 全表查（含已清退/作废的旧记录），避免 user_id 唯一约束冲突
  const dup = S('dup_t', 'SELECT id FROM trainees WHERE user_id=?').get(newUserId);
  if (dup) return { ok: false, msg: '该学员已有名额记录（含历史清退记录），不可重复占用' };

  // 名额交接给新学员：slot_type 标记为补位名额，恢复考核（helper_id 帮扶主理人保持不变，仍归原帮扶主理人）
  // join_at 更新为补位时间 = 新学员真实入职时间（开启全新滚动周期）；finished_cycle 归零，未走完完整周期前不考核
  S('restore_slot2', `UPDATE trainees SET user_id=?, slot_type='replace', slot_status='normal', reserve_count=?, reserve_deadline=NULL, in_pool=1, zero_perf_months=0, finished_cycle=0, last_zero_month=NULL, month_perf=0, month_orders=0, month_status='pending', join_at=?, exit_at=NULL WHERE id=?`)
    .run(newUserId, newCount, now(), t.id);
  // 培育奖记录交接给新学员：原学员未达标(孵化归零)，由该组帮扶主理人继续孵化
  const helperId = t.helper_id || t.leader_id;
  S('hr_replace', `UPDATE help_rewards SET newbie_id=?, hatched_count=0, status='locked', unlocked_at=NULL WHERE mentor_id=? AND referrer_id=? AND slot_no=?`)
    .run(newUserId, helperId, t.leader_id, t.slot_no);
  insertNotice(t.leader_id, 'fill_success', `您的第${t.slot_no}名额已由新学员接续，本月起重新考核。`);
  return { ok: true, msg: '补位成功，名额已由新学员接续', slotType: 'replace' };
}

// ---------- 主理人10%待遇月度结算（按自然月财务归档，与滚动考核解耦） ----------
// 口径（老板规则）：待遇 = 管培生当月"工资"(实得奖励收入) × leader_rate(默认10%)
// 工资 = 介绍奖(direct_commissions) + 培育奖(help_bonuses，管培生作帮扶主理人所得)
//       + 未来若有文具销售奖励等模块，追加对应奖励流水即可（勿按销售额计算）
// 基数可配置：commission=管培生当月实得奖励收入(工资,推荐)；sales=管培生当月销售额(一般不建议)
// 【BUG3 修复】待遇为财务流水：只要管培生自然月产生真实业绩，就按基数×10%生成待遇流水，
// 不再复用滚动考核的业绩门槛(qualify_perf/qualify_orders)做合格拦截——
// 滚动周期(30天)与自然月是两个不同时间维度，共用一套门槛会造成业务逻辑错乱；
// 管培生是否清退/失效由滚动考核（dailyCheck）单独负责，与待遇结算彻底解耦。
// 修复：默认结算【上月】(month 参数可指定)，且每月须先结算后重置（见 cron.js 顺序）
function settleLeaderAllowance(month) {
  const rate = getSettingNum('leader_rate') || 0.1;
  const baseMode = getSettingNum('leader_rate_base') || 'commission';
  const m = month || prevMonth(thisMonth()); // 默认结算上月
  const trainees = S('q_t', `SELECT * FROM trainees WHERE in_pool=1 AND slot_status='normal'`).all();
  const notified = new Set();
  for (const t of trainees) {
    // 强约束：主理人名下有"冻结待补位"名额 → 冻结该主理人本月所有待遇，补位完成后自动解冻
    if (hasPendingReserve(t.leader_id)) {
      if (!notified.has(t.leader_id)) {
        notified.add(t.leader_id);
        insertNotice(t.leader_id, 'frozen_income',
          `您有待补位名额未完成，本月主理人待遇已冻结；补位完成后自动恢复结算。`);
      }
      continue;
    }
    // 连续N月无合格管培生、无学习圈业绩 → 整体待遇暂停
    if (leaderPaused(t.leader_id, m)) {
      if (!notified.has(t.leader_id)) {
        notified.add(t.leader_id);
        insertNotice(t.leader_id, 'frozen_income',
          `您连续多个月名下无合格管培生、无学习圈业绩，整体待遇已暂停，直至重新孵化有效管培生。`);
      }
      continue;
    }
    // 自然月真实业绩：该管培生当月成交(自购+介绍)的已支付订单
    const sales = S('t_sales', `SELECT COALESCE(SUM(amount),0) s FROM orders
      WHERE status='paid' AND paid_at LIKE ? AND (user_id=? OR referrer_id=?)`)
      .get(m + '%', t.user_id, t.user_id);
    let validPerf = sales.s;
    if (baseMode === 'commission') {
      // 收入口径：该管培生结算月份(m)内实际到账的全部奖励 = 介绍奖励 + 培育奖
      const s = S('t_comm', `SELECT COALESCE(SUM(amount),0) s FROM direct_commissions WHERE referrer_id=? AND status='paid' AND created_at LIKE ?`).get(t.user_id, m + '%').s;
      const hb = S('t_hb', `SELECT COALESCE(SUM(amount),0) s FROM help_bonuses WHERE mentor_id=? AND status='paid' AND created_at LIKE ?`).get(t.user_id, m + '%').s;
      validPerf = (s || 0) + (hb || 0);
    }
    // 有自然月业绩才生成待遇流水；无业绩/基数≤0 自然跳过
    const amount = Math.floor(validPerf * rate);
    if (amount <= 0) continue;
    const existing = S('g_la', `SELECT id FROM leader_allowances WHERE leader_id=? AND trainee_id=? AND month=?`)
      .get(t.leader_id, t.id, m);
    if (!existing) {
      S('ins_la', `INSERT INTO leader_allowances (leader_id, trainee_id, month, valid_perf, amount, status) VALUES (?,?,?,?,?,'paid')`)
        .run(t.leader_id, t.id, m, validPerf, amount);
    }
  }
}

// 主理人名下是否存在"冻结待补位"名额（存在则冻结其全部收入，补位完成后自动解冻）
function hasPendingReserve(leaderId) {
  const r = S('pend_res', `SELECT COUNT(*) c FROM trainees WHERE leader_id=? AND slot_status='frozen' AND in_pool=1`).get(leaderId);
  return (r && r.c) > 0;
}

// 主理人整体待遇暂停判定：成为主理人满 N 个月后，过去 N 个月均无任何待遇结算记录 → 暂停
function leaderPaused(leaderId, settleMonth) {
  const pauseMonths = getSettingNum('leader_pause_months') || 3;
  // 过去 pauseMonths 个月（不含结算月）
  const months = [];
  let cur = settleMonth;
  for (let i = 0; i < pauseMonths; i++) { cur = prevMonth(cur); months.push(cur); }
  // 新主理人保护：名下限最早一名管培生加入至今不足 N 个月 → 不暂停
  // join_at 已修复为【真实入职时间】（滚动考核不再改写它），MIN(join_at) 即最早加入时间，可安全使用
  const first = S('first_t', `SELECT MIN(join_at) j FROM trainees WHERE leader_id=?`).get(leaderId);
  if (!first || !first.j) return false;
  const joinDate = new Date(String(first.j).replace(' ', 'T'));
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - pauseMonths);
  if (joinDate > cutoff) return false;
  // 过去 N 个月是否有待遇结算记录
  const ph = months.map(() => '?').join(',');
  const cnt = S('la_cnt', `SELECT COUNT(*) c FROM leader_allowances WHERE leader_id=? AND month IN (${ph})`).get(leaderId, ...months).c;
  return cnt === 0;
}

// ---------- 培育奖解锁判定 ----------
// 规则：某推荐人转介绍的前 slot_limit 名学员(留店/自己学习圈均可)各被孵化为"合格管培生且产生业绩" → 该组解锁
// 培育奖归属帮扶主理人(helper)：一个推荐人留下的前N名名额孵化合格 = 1组 = 固定200，归该组帮扶主理人
function evaluateHelpRewards() {
  const slotLimit = getSettingNum('slot_limit') || 2;
  const hrList = S('hr_locked', `SELECT * FROM help_rewards WHERE status IN ('locked','full')`).all();
  for (const hr of hrList) {
    // hr.mentor_id = 帮扶主理人(helper)，按 user_id+helper_id 定位该名额
    const t = S('g_t_by_user', `SELECT * FROM trainees WHERE user_id=? AND helper_id=?`).get(hr.newbie_id, hr.mentor_id);
    // 滚动周期下：month_status 为最近一个完整周期判定结果（周期推进时业绩清零但状态保留），
    // 故只用 month_status='qualified' 判定孵化，不再要求 month_perf>0
    if (t && t.month_status === 'qualified' && t.in_pool === 1) {
      // 已孵化该名合格管培生
      const newCount = Math.max(hr.hatched_count, 1);
      S('up_hr_hatch', `UPDATE help_rewards SET hatched_count=? WHERE id=?`).run(newCount, hr.id);
      // 该推荐人(leader)名下的前 slot_limit 名名额是否全部合格 → 整组解锁（按 referrer_id 分组）
      const leaderSlots = S('leader_t', `SELECT * FROM trainees WHERE leader_id=? AND slot_no<=? AND in_pool=1`).all(t.leader_id, slotLimit);
      const allQualified = leaderSlots.length >= slotLimit && leaderSlots.every(s => s.month_status === 'qualified');
      if (allQualified) {
        S('up_hr_full', `UPDATE help_rewards SET status='full', unlocked_at=? WHERE mentor_id=? AND referrer_id=?`).run(now(), hr.mentor_id, t.leader_id);
      }
    }
  }
}

// 发放培育奖：管理后台确认发放
// 规则：每名推荐人的前 slot_limit 名名额全部孵化合格 = 1组，每组固定发放 help_reward(200)，全部归帮扶主理人
// 修正：不再发入抵用券账户，培育奖计入可提现奖励收益(userEarned 按 referrer_id 组去重统计)
function payHelpReward(mentorId) {
  const rows = S('hr_full', `SELECT * FROM help_rewards WHERE mentor_id=? AND status='full'`).all(mentorId);
  if (!rows.length) return { ok: false, msg: '无可发放的全额培育奖' };
  const full = getSettingNum('help_reward') || 200;
  const groups = S('hr_groups', `SELECT COUNT(DISTINCT referrer_id) c FROM help_rewards WHERE mentor_id=? AND status='full'`).get(mentorId).c;
  const total = full * Math.max(groups, 1);
  S('pay_hr', `UPDATE help_rewards SET status='paid', paid_at=? WHERE mentor_id=? AND status='full'`).run(now(), mentorId);
  // 记录发放流水（可提现收益，userEarned 中按 referrer_id 组去重统计组数）
  S('ins_paylog', `INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
    .run(null, 'help_reward', JSON.stringify({ mentor_id: mentorId, amount: total, groups }));
  return { ok: true, total };
}

// ---------- 营销活动定时清理 ----------
// 拼团：待确认收款超24小时 → 取消+关闭订单；开团超过 N 小时未满员 → 失败+预付金原路退款
// 砍价：待确认收款超24小时 → 取消+关闭订单；超过有效期 → 过期+预付金原路退款
function refundStartOrderByBiz(bizType, bizId, reason) {
  const ord = S('gs_' + bizType, `SELECT order_no FROM orders WHERE biz_type=? AND biz_id=? AND status='paid'`).get(bizType, bizId);
  if (!ord) return false;
  S('refund_' + bizType, `UPDATE orders SET status='refunded' WHERE order_no=? AND status='paid'`).run(ord.order_no);
  S('log_refund_' + bizType, `INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
    .run(ord.order_no, 'refund', JSON.stringify({ reason, at: now() }));
  return true;
}
function cleanupMarketing() {
  const nowStr = now();
  // 1. 发起单待确认收款超24小时未支付 → 活动取消 + 关闭订单
  const pendingDeadline = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const pendingGroups = S('pend_g', `SELECT id FROM group_orders WHERE status='pending' AND created_at < ?`).all(pendingDeadline);
  for (const g of pendingGroups) {
    S('cancel_g', `UPDATE group_orders SET status='cancelled' WHERE id=?`).run(g.id);
    S('close_g_order', `UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE biz_type='group_start' AND biz_id=? AND status='pending'`).run(g.id);
  }
  const pendingBargains = S('pend_b', `SELECT id FROM bargains WHERE status='pending' AND created_at < ?`).all(pendingDeadline);
  for (const b of pendingBargains) {
    S('cancel_b', `UPDATE bargains SET status='cancelled' WHERE id=?`).run(b.id);
    S('close_b_order', `UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE biz_type='bargain_start' AND biz_id=? AND status='pending'`).run(b.id);
  }

  // 2. 拼团：开团超过 N 小时未满员 → 失败，预付金原路退回（优先使用 expire_at）
  const expiredGroups = S('exp_groups', `SELECT id FROM group_orders WHERE status='opening' AND ((expire_at IS NOT NULL AND expire_at < ?) OR (expire_at IS NULL AND created_at < ?))`).all(nowStr, new Date(Date.now() - (getSettingNum('group_hours') || 48) * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19));
  for (const g of expiredGroups) {
    S('fail_group', `UPDATE group_orders SET status='failed' WHERE id=?`).run(g.id);
    refundStartOrderByBiz('group_start', g.id, '拼团超时未成团，预付金原路退回');
  }

  // 3. 砍价：超过有效期 → 过期，预付金原路退回
  const expiredBargains = S('exp_barg', `SELECT id FROM bargains WHERE status='active' AND expire_at IS NOT NULL AND expire_at < ?`).all(nowStr);
  for (const b of expiredBargains) {
    S('exp_barg_up', `UPDATE bargains SET status='expired' WHERE id=?`).run(b.id);
    refundStartOrderByBiz('bargain_start', b.id, '砍价超期未砍成功，预付金原路退回');
  }
  return { expiredGroups: expiredGroups.length, expiredBargains: expiredBargains.length, cancelledGroups: pendingGroups.length, cancelledBargains: pendingBargains.length };
}

// ---------- 每月1号：仅重置 users 表的自然月统计（前台面板/财务报表用） ----------
// 注意：管培生考核已改为【个人滚动周期】（见 dailyCheck 逐人判定），
//       trainees 表的 month_perf/month_orders 只能由各自周期结束时的 dailyCheck 重置，
//       严禁在此全局清空 trainees 业绩，否则滚动周期业绩统计会丢失。
//       主理人10%待遇按月自然月结算见 settleLeaderAllowance，与滚动考核解耦。
function monthlyReset() {
  S('reset_users', `UPDATE users SET month_orders=0, month_perf=0`).run();
}

// 主理人待遇启停检测：连续N月无合格管培生、无学习圈业绩 → 暂停待遇
// (简化实现：标记主理人 under pause，结算时过滤)

// ---------- 未达标实时预警 + 冻结收入 ----------
// 主理人名下有"见习/失效/冻结"名额时，冻结该主理人所有待发放奖励
function freezeLeaderIncome(leaderId) {
  const bad = S('bad_t', `SELECT COUNT(*) c FROM trainees WHERE leader_id=? AND month_status IN ('probation','invalid','cleared') AND in_pool=1`).get(leaderId).c;
  return bad > 0;
}

module.exports = {
  // 邀请码工具
  genInviteCode,
  uniqueInviteCode,
  ensureInviteCode,
  resolveInvite,
  requireInvite,
  settleDirectCommission,
  assignTraineeSlot,
  creditTraineePerf,
  evaluateTrainee,
  dailyCheck,
  clearTrainee,
  fillReserve,
  settleLeaderAllowance,
  evaluateHelpRewards,
  payHelpReward,
  cleanupMarketing,
  monthlyReset,
  freezeLeaderIncome,
  checkLeaderPause,
  hasPendingReserve,
  leaderPaused,
  getSettingNum,
  thisMonth,
  prevMonth,
  now,
};
