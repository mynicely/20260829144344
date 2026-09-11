// 定时任务：每日滚动周期考核、每月1号待遇结算、用户自然月统计重置、培育奖判定
// 职责划分：
//   - 管培生个人考核（合格/见习/失效、零业绩计数、清退）：由每日 dailyCheck 按
//     【个人滚动周期】(trainee_cycle_days, 默认30天, 从 join_at 起算) 逐人独立执行，不再依赖自然月。
//   - 主理人10%待遇：每月1号按【自然月】结算归档（财务对账用），与滚动考核解耦。
//   - monthlyReset：仅重置 users 表自然月统计（前台面板/报表），严禁重置 trainees 业绩。
const cron = require('node-cron');
const engine = require('./engine');
const db = require('./db');

// 所有任务统一使用北京时间，避免海外服务器时区导致执行时间错乱
const TZ = 'Asia/Shanghai';

function getMark(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value).v; } catch (e) { return null; }
}
function setMark(key, val) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(key, JSON.stringify({ v: val }));
}

// 启动补执行：进程在定时时刻停机重启会错过任务，这里按标记补跑
function catchUp() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ym = now.toISOString().slice(0, 7);

  // 1) 每日检测补执行（当天还没跑过则补跑，防止考核/清退/补位倒计时滞后一天）
  const lastDaily = getMark('last_daily_check_date');
  if (lastDaily !== today) {
    try {
      engine.dailyCheck();
      engine.evaluateHelpRewards();
      engine.cleanupMarketing();
      setMark('last_daily_check_date', today);
      console.log('[cron] catch-up daily check done', today);
    } catch (e) {
      console.error('[cron] catch-up daily error', e);
    }
  }

  // 2) 月度待遇结算+用户统计重置补执行：若本月1号的结算/重置任务因停机错过且今天已进入新月份，补执行
  //    （settleLeaderAllowance 默认结算上月；monthlyReset 仅重置 users 自然月统计，不影响管培生滚动考核）
  const lastSettle = getMark('last_settle_month');
  if (lastSettle !== ym) {
    try {
      engine.settleLeaderAllowance();
      engine.monthlyReset();
      setMark('last_settle_month', ym);
      console.log('[cron] catch-up monthly settle+reset done', ym);
    } catch (e) {
      console.error('[cron] catch-up monthly error', e);
    }
  }
}

function initCron() {
  // 每日凌晨2点：管培生滚动周期考核（逐人判定周期结束→合格/见习/失效→零业绩计数→清退）+ 补位倒计时 + 培育奖判定 + 营销活动清理
  cron.schedule('0 2 * * *', () => {
    try {
      engine.dailyCheck();
      engine.evaluateHelpRewards();
      const mk = engine.cleanupMarketing();
      setMark('last_daily_check_date', new Date().toISOString().slice(0, 10));
      console.log('[cron] daily check done', new Date().toLocaleString(), '营销清理:', mk);
    } catch (e) {
      console.error('[cron] daily error', e);
    }
  }, { timezone: TZ });

  // 每月1号凌晨3点：结算【上月】主理人10%待遇（按自然月财务归档，与滚动考核解耦）
  // 注意：待遇按自然月订单/奖励统计，结算顺序不影响滚动考核；但须在 monthlyReset 前执行以免用户统计被清
  cron.schedule('0 3 1 * *', () => {
    try {
      engine.settleLeaderAllowance();
      setMark('last_settle_month', new Date().toISOString().slice(0, 7));
      console.log('[cron] leader allowance settle done', new Date().toLocaleString());
    } catch (e) {
      console.error('[cron] allowance error', e);
    }
  }, { timezone: TZ });

  // 每月1号凌晨4点：重置 users 表自然月统计（前台面板/报表用）；管培生考核由 dailyCheck 个人周期处理，不受影响
  cron.schedule('0 4 1 * *', () => {
    try {
      engine.monthlyReset();
      console.log('[cron] monthly user-stats reset done', new Date().toLocaleString());
    } catch (e) {
      console.error('[cron] monthly reset error', e);
    }
  }, { timezone: TZ });

  // 启动补执行（注册后立即执行一次）
  catchUp();
}

module.exports = { initCron };
