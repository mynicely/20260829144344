// 数据库初始化与连接
// 使用 Node 内置 node:sqlite (DatabaseSync)，无需任何原生编译依赖
// 兼容 better-sqlite3 的同步 API：prepare().run/get/all/exec + lastInsertRowid
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_DIR = path.join(__dirname, '..', 'data');
// 支持 HANMO_DB 环境变量覆盖数据库路径（测试/多实例用），默认生产库 hanmo.db
const DB_PATH = process.env.HANMO_DB || path.join(DB_DIR, 'hanmo.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
// 并发安全四件套：
// WAL 预写日志：读写并发不阻塞；busy_timeout：锁冲突等待最多 5 秒而不是立刻抛错；
// synchronous=NORMAL：WAL 模式下平衡性能与持久性；foreign_keys：开启外键约束防脏数据。
// 注意：SQLite 单文件库只支持单进程写入，本服务必须单进程运行（禁止 pm2 cluster / 多实例挂同一 db 文件）。
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA foreign_keys = ON');

// 包装 prepare，确保 lastInsertRowid / changes 为 number（node:sqlite 可能返回 bigint）
const _origPrepare = db.prepare.bind(db);
db.prepare = function (sql) {
  const stmt = _origPrepare(sql);
  const origRun = stmt.run.bind(stmt);
  const origGet = stmt.get.bind(stmt);
  const origAll = stmt.all.bind(stmt);
  stmt.run = function (...args) {
    const r = origRun(...args);
    return {
      changes: Number(r.changes),
      lastInsertRowid: Number(r.lastInsertRowid),
    };
  };
  stmt.get = function (...args) {
    return origGet(...args);
  };
  stmt.all = function (...args) {
    return origAll(...args);
  };
  return stmt;
};

// ---------- 建表 ----------
db.exec(`
-- 用户基础表（所有用户通用）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  openid TEXT,
  nickname TEXT DEFAULT '学员',
  avatar TEXT,
  role TEXT DEFAULT 'user',             -- user/student/trainee/team_leader(主理人) 等身份标签
  identity TEXT DEFAULT 'learner',      -- learner纯学习 / promoter创业推广
  referrer_id INTEGER,                  -- 所属介绍人推荐人ID
  top_leader_id INTEGER,                -- 顶级主理人ID
  is_paid INTEGER DEFAULT 0,            -- 是否付费
  product_type TEXT,                    -- 499/1299/2999
  paid_at TEXT,
  expire_at TEXT,
  month_orders INTEGER DEFAULT 0,       -- 月度成交单数
  month_perf INTEGER DEFAULT 0,         -- 月度总业绩(元)
  zero_perf_months INTEGER DEFAULT 0,   -- 连续零业绩月数
  status TEXT DEFAULT 'active',         -- active/frozen/cleared
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 管培生专属表（考核/清退/补位/待遇核心）
CREATE TABLE IF NOT EXISTS trainees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,      -- 关联用户
  leader_id INTEGER NOT NULL,           -- 绑定推荐主理人ID（终身绑定）
  slot_no INTEGER NOT NULL,             -- 考核名额序号(1前2名 / 3及以后)
  month_perf INTEGER DEFAULT 0,         -- 当月业绩
  month_orders INTEGER DEFAULT 0,       -- 当月单数
  month_status TEXT DEFAULT 'pending',  -- qualified合格 / probation见习 / invalid失效 / cleared已清退
  zero_perf_months INTEGER DEFAULT 0,   -- 连续零业绩计数
  reserve_count INTEGER DEFAULT 0,      -- 补位次数(最多2)
  reserve_deadline TEXT,                -- 补位倒计时截止时间
  slot_status TEXT DEFAULT 'normal',    -- normal正常 / frozen冻结待补位 / void永久作废
  join_at TEXT DEFAULT (datetime('now','localtime')),  -- 真实成为管培生时间（滚动周期起点，全程不被改写）
  finished_cycle INTEGER DEFAULT 0,     -- 已考核完成的滚动周期轮数（防重复执行同一轮考核）
  exit_at TEXT,
  in_pool INTEGER DEFAULT 1             -- 是否在人才库
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE,
  user_id INTEGER NOT NULL,
  product_type TEXT NOT NULL,           -- 499/1299/2999
  amount INTEGER NOT NULL,              -- 实付金额(元)
  pay_type TEXT DEFAULT 'wechat',
  referrer_id INTEGER,                  -- 介绍推荐人(成交时记录)
  coupon_used INTEGER DEFAULT 0,        -- 使用抵用券金额
  status TEXT DEFAULT 'pending',        -- pending待支付/paid已支付/closed已关闭/refunded已退款
  join_fission INTEGER DEFAULT 0,       -- 支付成功后是否加入分享系统(1是/0否)
  new_referrer_id INTEGER,              -- 支付成功后转绑的新推荐人ID
  wx_transaction_id TEXT,               -- 微信支付交易单号(回调返回)
  paid_at TEXT,                         -- 支付成功时间
  closed_at TEXT,                       -- 关闭时间
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 介绍奖励流水
CREATE TABLE IF NOT EXISTS direct_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  referrer_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,             -- 被推荐人
  product_type TEXT,
  amount INTEGER NOT NULL,              -- 介绍奖金
  status TEXT DEFAULT 'pending',        -- pending待审核/paid已到账
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 培育奖记录
CREATE TABLE IF NOT EXISTS help_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,           -- 帮扶导师(推荐人)
  newbie_id INTEGER NOT NULL,           -- 被帮扶新人
  slot_no INTEGER,                      -- 对应名额序号(1/2)
  hatched_count INTEGER DEFAULT 0,      -- 已孵化合格管培生数(0/1/2)
  status TEXT DEFAULT 'locked',         -- locked未解锁/full已全额解锁/paid已发放
  unlocked_at TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 主理人10%待遇流水
CREATE TABLE IF NOT EXISTS leader_allowances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leader_id INTEGER NOT NULL,
  trainee_id INTEGER NOT NULL,          -- 绑定管培生
  month TEXT NOT NULL,                  -- 结算月份 YYYY-MM
  valid_perf INTEGER DEFAULT 0,         -- 该名额当月有效业绩(或奖励基数)
  amount INTEGER DEFAULT 0,             -- 待遇金额(10%)
  status TEXT DEFAULT 'pending',        -- pending/frozen/void/paid
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 主理人培育奖：名下管培生每介绍1名付费分享学员，主理人得200
CREATE TABLE IF NOT EXISTS help_bonuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,           -- 主理人(受益者)
  referrer_id INTEGER NOT NULL,         -- 成员(管培生)自己，成交的推荐人
  order_id INTEGER NOT NULL,            -- 关联订单
  amount INTEGER NOT NULL,              -- 奖励金额
  status TEXT DEFAULT 'paid',           -- paid已发放/refunded已退款冲回
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 抵用券/现金券账户
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  balance INTEGER DEFAULT 0,            -- 可用余额(仅抵扣)
  frozen INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 抵用券明细流水
CREATE TABLE IF NOT EXISTS coupon_flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  balance_after INTEGER,
  type TEXT NOT NULL,                   -- task打卡/order抵扣/reward奖励/refund
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 打卡任务记录
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,              -- calligraphy打卡/class签到/review复盘
  date TEXT NOT NULL,
  reward INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 学习任务记录
CREATE TABLE IF NOT EXISTS learning_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,              -- watch看课/homework作业/upload上传
  reward INTEGER DEFAULT 0,
  date TEXT NOT NULL,
  content TEXT,                         -- 学习内容/留言
  image TEXT,                           -- 上传图片url
  file TEXT,                            -- 上传文件url
  status TEXT DEFAULT 'submitted',      -- submitted已提交/reviewed已点评
  teacher_comment TEXT,                 -- 老师点评
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 商品/课程类目表
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT,                            -- 类目图标(emoji)
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'on',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 课程/商品表（统一电商商品，type区分课程/实物/活动）
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT,
  price INTEGER NOT NULL,
  original_price INTEGER,
  validity TEXT,                        -- 1year/lifetime/实物/周期
  level TEXT,                           -- 499/1299/2999 或 商品档位
  type TEXT DEFAULT 'course',           -- course课程/goods实物/activity活动
  category_id INTEGER,                  -- 所属类目
  cover TEXT,
  images TEXT,                          -- 多图JSON数组
  content TEXT,                         -- 富文本详情
  teacher TEXT,                         -- 讲师介绍(姓名/资质/教学特色)
  faq TEXT,                             -- 常见问题JSON数组[{q,a}]
  is_group INTEGER DEFAULT 0,           -- 是否拼团
  group_min INTEGER DEFAULT 2,
  group_discount INTEGER DEFAULT 0,
  is_bargain INTEGER DEFAULT 0,         -- 是否砍价
  stock INTEGER DEFAULT -1,             -- -1不限/>=0库存
  sales INTEGER DEFAULT 0,              -- 销量
  status TEXT DEFAULT 'on',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 课程评价
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  order_id INTEGER,
  rating INTEGER NOT NULL,             -- 1-5星
  content TEXT,
  status TEXT DEFAULT 'on',            -- on展示/off隐藏
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(course_id, user_id)
);

-- 拼团活动
CREATE TABLE IF NOT EXISTS group_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_no TEXT UNIQUE,
  course_id INTEGER,
  leader_user INTEGER,
  member_count INTEGER DEFAULT 1,
  min_count INTEGER DEFAULT 2,
  status TEXT DEFAULT 'opening',        -- pending待确认收款/opening/success/failed/cancelled
  discount_amount INTEGER DEFAULT 0,
  order_id INTEGER,                     -- 开团预付订单ID
  expire_at TEXT,                       -- 拼团截止时间（创建时根据 group_hours 计算）
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 拼团成员
CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 砍价活动
CREATE TABLE IF NOT EXISTS bargains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  initiator_id INTEGER NOT NULL,        -- 发起砍价用户
  original_price INTEGER NOT NULL,      -- 原价
  floor_price INTEGER NOT NULL,         -- 底价(砍到多少为止)
  current_price INTEGER NOT NULL,       -- 当前价
  helps INTEGER DEFAULT 0,              -- 已帮砍人数
  max_helps INTEGER DEFAULT 5,          -- 最多帮砍人数
  status TEXT DEFAULT 'active',         -- pending待确认收款/active砍价中/success砍到可购买/expired过期/cancelled
  order_id INTEGER,                     -- 发起砍价预付订单ID
  created_at TEXT DEFAULT (datetime('now','localtime')),
  expire_at TEXT
);

-- 帮砍记录
CREATE TABLE IF NOT EXISTS bargain_helps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bargain_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  cut_amount INTEGER NOT NULL,          -- 砍掉金额
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 免费体验课预约
CREATE TABLE IF NOT EXISTS trial_lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT,
  phone TEXT,
  age_group TEXT,                       -- child/adult
  subject TEXT,                         -- 体验科目（毛笔楷书/硬笔/国画等）
  mode TEXT DEFAULT 'online',           -- 上课方式 online线上/offline线下
  prefer_time TEXT,                     -- 期望上课时间（如 周末上午/工作日晚上）
  referrer_id INTEGER,
  status TEXT DEFAULT 'booked',         -- booked已预约/contacted已联系/finished已完成/closed已关闭
  admin_note TEXT,                      -- 管理员备注
  reply TEXT,                           -- 管理员沟通回复
  contacted_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 主理人补位/预警通知（未达标实时预警 + 自动补充）
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,                   -- trainee_warning/fill_remind/frozen_income
  content TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 推荐关系绑定变更记录（手动解绑/转绑日志，含操作人身份与备注）
CREATE TABLE IF NOT EXISTS rebind_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator TEXT,                        -- 操作人（管理员账号名 或 用户昵称#ID）
  operator_type TEXT DEFAULT 'admin',   -- admin后台 / user用户端
  user_id INTEGER NOT NULL,             -- 被操作学员ID
  user_name TEXT,                       -- 被操作学员昵称
  old_referrer_id INTEGER,              -- 原介绍人ID
  old_referrer_name TEXT,               -- 原介绍人昵称
  new_referrer_id INTEGER,              -- 新介绍人ID
  new_referrer_name TEXT,               -- 新介绍人昵称
  action TEXT DEFAULT 'rebind',         -- rebind重新绑定 / unbind解绑
  note TEXT,                            -- 备注
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 提现申请表（奖励收益提现，管理员审核打款；抵用券余额禁止提现）
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,              -- 申请人
  amount INTEGER NOT NULL,               -- 提现金额(元)
  pay_type TEXT DEFAULT 'wechat',        -- wechat微信/alipay支付宝/bank银行卡
  account TEXT,                          -- 收款账号
  real_name TEXT,                        -- 收款人姓名
  status TEXT DEFAULT 'pending',         -- pending待审核/approved已通过待打款/paid已打款/rejected已驳回
  admin_remark TEXT,                     -- 审核备注
  created_at TEXT DEFAULT (datetime('now','localtime')),
  processed_at TEXT                      -- 处理时间
);

-- 支付日志（下单/回调/结算全链路留痕，便于排查对账）
CREATE TABLE IF NOT EXISTS pay_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT,
  event TEXT NOT NULL,                  -- prepay下单/notify回调/paid结算/close关闭/error异常
  payload TEXT,                         -- 原始JSON（回调原文/请求报文等）
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 系统配置(可动态修改)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  remark TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 规则公示内容
CREATE TABLE IF NOT EXISTS rule_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 公司介绍（为什么选择我们独白页）
CREATE TABLE IF NOT EXISTS company_intro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT '为什么选择我们',
  content TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 首页广告/活动
CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  image TEXT,                           -- 图片地址
  link TEXT,                            -- 跳转链接(支持 /courses 等内部或外部)
  position TEXT DEFAULT 'home_bottom',  -- 展示位置 home_bottom首页底部
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'on',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 帖子栏目分类（动态增删改，后台管理；发帖 category 存 value）
CREATE TABLE IF NOT EXISTS post_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,          -- 显示名（如 教培动态）
  value TEXT NOT NULL UNIQUE,  -- 存储标识（如 company），发帖时写入 posts.category
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'on',    -- on启用/off停用（删除=停用，不影响历史帖子）
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 交流社区帖子（博客/论坛/图文分享）
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT,
  content TEXT,                         -- 正文/留言
  images TEXT,                          -- 多图JSON数组
  category TEXT DEFAULT 'works',        -- 分区 works作品展示/show展示/help求助（学员）/company教培动态/material碑帖资料/activity活动交流（管理员）
  status TEXT DEFAULT 'pending',        -- pending待审核/approved已通过/rejected已驳回/deleted已删除
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 帖子评论
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'approved',       -- approved/审核
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 课程章节（章节式学习：大纲/学习进度共用数据源）
CREATE TABLE IF NOT EXISTS course_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,                  -- 章节标题
  duration TEXT,                        -- 时长(如"15分钟"或"约1小时")
  content TEXT,                         -- 章节学习内容(富文本,可空则展开课程总详情)
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'on',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 章节学习进度（学员标记完成）
CREATE TABLE IF NOT EXISTS chapter_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  chapter_id INTEGER NOT NULL,
  completed INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, chapter_id)
);
`);

// ---------- 迁移：为已存在的表补充新增字段 ----------
function ensureColumn(table, col, ddl) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch (e) { /* 列已存在则忽略 */ }
}
ensureColumn('trial_lessons', 'subject', `subject TEXT`);
// 用户邀请码（老库迁移补列 + 唯一索引，存量用户由懒生成机制补发）
ensureColumn('users', 'invite_code', `invite_code TEXT`);
// 交流帖子附件（老库迁移补列，用于碑帖资料下载）
ensureColumn('posts', 'attachment', `attachment TEXT`);
// 帖子个人隐藏（老库迁移补列：1=仅自己可见）
ensureColumn('posts', 'hidden', `hidden INTEGER DEFAULT 0`);
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code)`); } catch (e) { /* 唯一索引冲突时忽略，由生成逻辑保证唯一 */ }
ensureColumn('trial_lessons', 'mode', `mode TEXT DEFAULT 'online'`);
ensureColumn('trial_lessons', 'prefer_time', `prefer_time TEXT`);
ensureColumn('trial_lessons', 'admin_note', `admin_note TEXT`);
ensureColumn('trainees', 'slot_type', `slot_type TEXT DEFAULT 'assessment'`);
ensureColumn('trainees', 'last_zero_month', `last_zero_month TEXT`);
// 滚动周期考核：已考核完成的周期轮数（防止服务重启/数据回滚后重复计算同一轮考核）
ensureColumn('trainees', 'finished_cycle', `finished_cycle INTEGER DEFAULT 0`);
// 存量修复：历史名额 slot_status 为空 → 归为正常在岗
try { db.exec(`UPDATE trainees SET slot_status='normal' WHERE slot_status IS NULL`); } catch (e) { /* 表不存在则忽略 */ }
// 帮扶主理人：与 leader_id(推荐人,终身绑定,享10%待遇)分开；培育奖/培育奖归 helper
ensureColumn('trainees', 'helper_id', `helper_id INTEGER`);
// 培育奖组键：help_rewards 按 (mentor_id帮扶人, referrer_id推荐人) 分组，每组=某推荐人的前N名名额全部孵化合格
ensureColumn('help_rewards', 'referrer_id', `referrer_id INTEGER`);

// ---------- 存量数据回填：trainees.helper_id ----------
// 规则：某推荐人名下前 slot_limit 个名额(含补位)留给介绍人帮扶 → helper=推荐人所在帮扶主理人(推荐人自己作为trainee时的helper_id，无则自己)；
//       第 slot_limit+1 个起为推荐人自己的学习圈 → helper=推荐人自己
function backfillHelperIds() {
  let slotLimit = 2;
  try {
    const r = db.prepare(`SELECT value FROM settings WHERE key='slot_limit'`).get();
    if (r) slotLimit = JSON.parse(r.value).v || 2;
  } catch (e) { /* 默认2 */ }
  // 1) 第 slot_limit+1 个起：helper = 推荐人自己
  db.prepare(`UPDATE trainees SET helper_id=leader_id WHERE helper_id IS NULL AND slot_no>?`).run(slotLimit);
  // 2) 前 slot_limit 个：helper = 推荐人自己作为trainee时的helper_id（递归逐层稳定）
  let guard = 0;
  while (guard++ < 100) {
    const need = db.prepare(`SELECT t.id, t.leader_id, ld.helper_id AS ld_helper
      FROM trainees t LEFT JOIN trainees ld ON ld.user_id=t.leader_id AND ld.in_pool=1
      WHERE t.helper_id IS NULL AND t.slot_no<=?`).all(slotLimit);
    if (!need.length) break;
    for (const t of need) {
      db.prepare(`UPDATE trainees SET helper_id=? WHERE id=?`).run(t.ld_helper || t.leader_id, t.id);
    }
  }
  // 3) 兜底
  db.prepare(`UPDATE trainees SET helper_id=leader_id WHERE helper_id IS NULL`).run();
}
backfillHelperIds();

// ---------- 存量数据迁移：help_rewards 帮扶人改 helper、补组键 ----------
// 培育奖记录归属帮扶主理人(helper)，组键 referrer_id = 新学员的推荐人(leader_id)
db.prepare(`UPDATE help_rewards SET
    mentor_id = COALESCE((SELECT helper_id FROM trainees WHERE user_id = help_rewards.newbie_id), mentor_id),
    referrer_id = COALESCE((SELECT leader_id FROM trainees WHERE user_id = help_rewards.newbie_id), referrer_id)
  WHERE EXISTS (SELECT 1 FROM trainees WHERE user_id = help_rewards.newbie_id)`).run();
ensureColumn('orders', 'group_id', `group_id INTEGER`);
ensureColumn('orders', 'group_discount', `group_discount INTEGER DEFAULT 0`);
ensureColumn('orders', 'biz_type', `biz_type TEXT`);
ensureColumn('orders', 'biz_id', `biz_id INTEGER`);
ensureColumn('group_orders', 'tier_price', `tier_price INTEGER`);
ensureColumn('group_orders', 'order_id', `order_id INTEGER`);
ensureColumn('group_orders', 'expire_at', `expire_at TEXT`);
ensureColumn('bargains', 'tier_mode', `tier_mode TEXT`);
ensureColumn('bargains', 'order_id', `order_id INTEGER`);
ensureColumn('bargains', 'tier_config', `tier_config TEXT`);
ensureColumn('trial_lessons', 'reply', `reply TEXT`);
ensureColumn('trial_lessons', 'contacted_at', `contacted_at TEXT`);
// 课程级营销配置：按课程设置拼团档位（人数/价格/服务/礼包）与砍价规则（档位/每刀减价/底价）
ensureColumn('courses', 'group_tiers', `group_tiers TEXT`);
ensureColumn('courses', 'bargain_config', `bargain_config TEXT`);
// 拼团快照：记录开团时所选档位的服务/礼包，避免后续编辑课程后产生纠纷
ensureColumn('group_orders', 'tier_snapshot', `tier_snapshot TEXT`);
// courses 表新增电商字段
ensureColumn('courses', 'teacher', `teacher TEXT`);
ensureColumn('courses', 'faq', `faq TEXT`);
ensureColumn('courses', 'type', `type TEXT DEFAULT 'course'`);
ensureColumn('courses', 'category_id', `category_id INTEGER`);
ensureColumn('courses', 'images', `images TEXT`);
ensureColumn('courses', 'is_bargain', `is_bargain INTEGER DEFAULT 0`);
ensureColumn('courses', 'stock', `stock INTEGER DEFAULT -1`);
ensureColumn('courses', 'sales', `sales INTEGER DEFAULT 0`);
ensureColumn('learning_tasks', 'content', `content TEXT`);
ensureColumn('learning_tasks', 'image', `image TEXT`);
ensureColumn('learning_tasks', 'file', `file TEXT`);
ensureColumn('learning_tasks', 'status', `status TEXT DEFAULT 'submitted'`);
ensureColumn('learning_tasks', 'teacher_comment', `teacher_comment TEXT`);
// orders 表新增支付网关字段（老库迁移）
// 下单记录课程ID：修复"我的课程"按价格档位分组导致同价位课程合并显示的问题
ensureColumn('orders', 'course_id', `course_id INTEGER`);
ensureColumn('orders', 'join_fission', `join_fission INTEGER DEFAULT 0`);
// 财务风控：1=放弃本单全部分享推广奖励（拼团/砍价下单后端强制=1，正价单前端二选一传入）
ensureColumn('orders', 'forgo_share_reward', `forgo_share_reward INTEGER DEFAULT 0`);
ensureColumn('orders', 'new_referrer_id', `new_referrer_id INTEGER`);
ensureColumn('orders', 'wx_transaction_id', `wx_transaction_id TEXT`);
ensureColumn('orders', 'paid_at', `paid_at TEXT`);
ensureColumn('orders', 'closed_at', `closed_at TEXT`);
// 安全加固：用户密码哈希（注册必设密码、登录必校验）
ensureColumn('users', 'password_hash', `password_hash TEXT`);

// ---------- 默认配置参数 ----------
function defaultSettings() {
  const s = {
    // 产品价格
    'price_499': { v: 499, remark: '基础班价格' },
    'price_1299': { v: 1299, remark: '进阶班价格' },
    'price_2999': { v: 2999, remark: '终身班价格' },
    // 奖励参数
    'direct_499': { v: 100, remark: '499介绍奖' },
    'direct_1299': { v: 300, remark: '1299介绍奖' },
    'direct_2999': { v: 800, remark: '2999介绍奖' },
    'help_reward': { v: 200, remark: '培育奖全额' },
    'help_reward_half': { v: 100, remark: '培育奖半额' },
    'leader_rate': { v: 0.1, remark: '主理人待遇比例10%（按管培生当月收入）' },
    // 考核规则
    'qualify_perf': { v: 1000, remark: '合格管培生考核业绩门槛(元)' },
    'qualify_orders': { v: 2, remark: '合格管培生考核单数门槛' },
    'clear_months': { v: 2, remark: '连续零业绩清退周期数(完整考核周期)' },
    'trainee_cycle_days': { v: 30, remark: '管培生滚动考核周期(天)，从成为管培生(join_at)起算，每个管培生独立滚动，不满一个完整周期不考核' },
    'leader_rate_base': { v: 'commission', remark: '主理人待遇基数：commission=管培生当月实得奖励收入/sales=管培生当月销售额' },
    'help_bonus_per_order': { v: 200, remark: '主理人培育奖：名下管培生每介绍1名付费分享学员，主理人得200' },
    'commission_freeze_days': { v: 0, remark: '介绍奖励冻结期(天,0=即时到账可提现，上线建议7~15)' },
    'reserve_days': { v: 30, remark: '补位时效(天)' },
    'reserve_max': { v: 2, remark: '单名额最大补位次数' },
    'leader_pause_months': { v: 3, remark: '主理人停待遇无业绩月份' },
    'slot_limit': { v: 2, remark: '主理人孵化考核名额数(前N名参与补位/帮扶，其后终身绑定)' },
    // 营销工具
    'checkin_reward': { v: 2, remark: '单次打卡抵现金额' },
    'checkin_daily_limit': { v: 2, remark: '每日打卡上限' },
    'task_reward': { v: 1, remark: '单次学习任务奖励' },
    'coupon_expire_days': { v: 0, remark: '抵现金过期周期(天,0=不过期)' },
    'withdraw_min': { v: 100, remark: '单笔提现最低金额(元)' },
    // 状态开关(1开/0关)
    'help_advance': { v: 0, remark: '培育奖预发机制开关' },
    'probation_half': { v: 1, remark: '见习管培生收益减半开关' },
    'allowance_freeze': { v: 1, remark: '待遇冻结/恢复机制开关' },
    'require_paid_referrer': { v: 1, remark: '奖励资格：推荐人须已付费升级(499等)才获得奖励(1开/0关)' },
    // 拼团参数
    'group_min': { v: 2, remark: '默认拼团人数' },
    'group_hours': { v: 48, remark: '拼团时长(小时)' },
    // 体验课配置（科目/时段，存字符串数组JSON）
    'trial_subjects': { v: ['毛笔楷书', '毛笔行书', '硬笔书法', '少儿国画', '成人绘画'], remark: '体验课可选科目' },
    'trial_slots': { v: ['工作日白天', '工作日晚上', '周末上午', '周末下午'], remark: '体验课可选时段' },
    // 砍价参数
    'bargain_max_helps': { v: 5, remark: '砍价最大帮砍人数' },
    'bargain_floor_rate': { v: 0.5, remark: '砍价底价比例(原价的50%)' },
    'bargain_hours': { v: 48, remark: '砍价有效期(小时)' },
    'bargain_price_tiers': { v: [], remark: '砍价档位价(格式:帮砍人数:价格,逗号分隔,如2:599,5:549,10:499,15:449,20:399)' },
    'bargain_step_reduce': { v: 0, remark: '砍价每增加1人帮砍减价(元),0=不使用' },
    // 管理后台路径前缀（防破解，修改后需用新地址访问后台）
    'admin_prefix': { v: 'admin', remark: '管理后台路径前缀' },
    // 登录兜底：管理员联系方式 + 短信验证码登录
    'admin_contact': { v: '', remark: '管理员联系方式(微信号/手机号等，注册/登录页"联系管理员"弹窗展示，邀请码无效时提示使用)' },
    'invite_code_required': { v: 1, remark: '邀请码必填开关(1=注册/预约必须填写有效邀请码,0=可无邀请码注册，邀请关系靠分享链接自动绑定)' },
    'sms_login_enabled': { v: 1, remark: '短信验证码登录开关(1开/0关)，未设置密码的老账号可用此登录' },
    'sms_mock_mode': { v: 1, remark: '短信模拟模式(1=验证码打印到服务端日志并随接口返回，仅测试环境；0=接真实短信服务商)' },
    // 微信登录（公众号网页授权，登录页"微信登录"入口；配好 appid/secret 后自动开启）
    'wx_oauth_appid': { v: '', remark: '微信公众号AppID(登录页"微信登录"网页授权)' },
    'wx_oauth_secret': { v: '', remark: '微信公众号AppSecret(网页授权换openid)' },
    'wx_oauth_redirect': { v: '', remark: '微信授权后回跳的前端登录页地址(如https://域名/login；留空默认回跳当前域名/login，前后端不同域时必须配置)' },
    // 支付网关配置（pay_mode: manual线下确认收款 / mock模拟支付 / wxpay微信支付）
    // manual：未开通微信商户收款前，客户下单后展示管理员配置的收款码，线下转账由后台确认已收款后才执行业务
    'pay_mode': { v: 'manual', remark: '支付模式(manual线下确认/mock模拟/wxpay微信支付)' },
    // 线下收款信息（manual 模式下展示给客户的收款方式）
    'pay_receive_wechat_qr': { v: '', remark: '微信收款码图片(URL或base64)' },
    'pay_receive_wechat_account': { v: '', remark: '微信收款账号/微信号' },
    'pay_receive_alipay_qr': { v: '', remark: '支付宝收款码图片(URL或base64)' },
    'pay_receive_alipay_account': { v: '', remark: '支付宝收款账号' },
    'pay_receive_bank_name': { v: '', remark: '银行名称' },
    'pay_receive_bank_account': { v: '', remark: '银行账号' },
    'pay_receive_bank_holder': { v: '', remark: '银行户名' },
    'pay_receive_notice': { v: '', remark: '线下付款提示文案' },
    'wxpay_appid': { v: '', remark: '微信小程序AppID' },
    'wxpay_appsecret': { v: '', remark: '微信小程序AppSecret(用于wx.login换openid)' },
    'wxpay_mchid': { v: '', remark: '微信支付商户号' },
    'wxpay_api_v3_key': { v: '', remark: 'APIv3密钥(32位)' },
    'wxpay_apiclient_serial': { v: '', remark: '商户API证书序列号' },
    'wxpay_apiclient_key': { v: '', remark: '商户API私钥(apiclient_key.pem内容)' },
    'wxpay_notify_url': { v: '', remark: '支付回调地址(公网https://域名/api/pay/notify)' },
    'wxpay_platform_pub': { v: '', remark: '微信支付平台证书公钥(PEM,用于回调验签)' },
    // 运行时动态写入的配置（补中文说明，避免后台参数页面只显示英文 key）
    'group_price_tiers': { v: [], remark: '拼团分档配置(格式:人数:价格,逗号分隔)' },
    'jwt_secret': { v: '', remark: 'JWT 签名密钥(服务端首次启动自动生成，请勿随意修改)' },
    'last_daily_check_date': { v: '', remark: '上次每日考核日期' },
    'last_settle_month': { v: '', remark: '上月待遇结算月份' },
    'sensitive_words': { v: '', remark: '社区敏感词库(逗号分隔)' },
  };
  return s;
}

// 写入默认配置（存量库仅刷新 remark 说明文案，不覆盖用户已调整的 value）
const insertSetting = db.prepare('INSERT INTO settings (key, value, remark) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET remark=excluded.remark');
for (const [k, o] of Object.entries(defaultSettings())) {
  insertSetting.run(k, JSON.stringify({ v: o.v }), o.remark);
}

// 默认管理员（确保 users 表和 admin_auth 表都有记录）
const bcrypt = require('bcryptjs');
const adminHash = bcrypt.hashSync('admin123', 10);
// 先确保 admin_auth 表存在
db.exec(`CREATE TABLE IF NOT EXISTS admin_auth (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, status INTEGER DEFAULT 1)`);
// 存量库迁移：admin_auth 可能已存在（无 status 列），ensureColumn 补充，避免鉴权查询报错
ensureColumn('admin_auth', 'status', `status INTEGER DEFAULT 1`);

// ---------- 安全加固：点赞去重表 + 打卡去重唯一索引 + 常用查询索引 ----------
db.exec(`CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(post_id, user_id)
)`);
// 打卡去重：先清理存量重复记录，再建唯一索引（并发重复打卡靠唯一约束兜底）
try {
  db.exec(`DELETE FROM checkins WHERE id NOT IN (SELECT MIN(id) FROM checkins GROUP BY user_id, date, task_type)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_uniq ON checkins (user_id, date, task_type)`);
} catch (e) { /* 表不存在或清理失败时忽略 */ }
// 高频查询索引（数据量增长后避免全表扫描）
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trainees_leader ON trainees (leader_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comm_referrer ON direct_commissions (referrer_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notices_user ON notices (user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_group_members ON group_members (group_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_la_leader ON leader_allowances (leader_id, month)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hr_mentor ON help_rewards (mentor_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_withdraw_user ON withdrawals (user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_coupon_flows ON coupon_flows (user_id)`);
} catch (e) { /* 个别表缺失时忽略，不阻塞启动 */ }
// users 表里没有管理员时创建/标记管理员
const adminExists = db.prepare('SELECT id FROM users WHERE is_admin=1').get();
if (!adminExists) {
  const id1 = db.prepare('SELECT id FROM users WHERE id=1').get();
  if (!id1) {
    db.prepare(`INSERT INTO users (id, nickname, role, identity, is_admin, phone) VALUES (1,'超级管理员','admin','learner',1,'admin')`).run();
  } else {
    db.prepare(`UPDATE users SET is_admin=1, role='admin', nickname='超级管理员' WHERE id=1`).run();
  }
}
// 首次初始化 admin 登录凭据：仅当表中无管理员时创建
// 修复：原 INSERT OR REPLACE 会在每次服务重启时把管理员密码重置回默认值（安全后门），现改为只首次创建
const adminAuthCount = db.prepare('SELECT COUNT(*) c FROM admin_auth').get().c;
if (adminAuthCount === 0) {
  db.prepare(`INSERT INTO admin_auth (id, username, password_hash, status) VALUES (1,?,?,1)`).run('admin', adminHash);
  console.log('[init] 已创建默认管理员 admin/admin123，请登录后台后立即修改密码');
}
// 强制 WAL 落盘，确保初始化数据写入文件
try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) {}

// 默认类目（简短名称，避免移动端 tab 换行/溢出）
const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
if (catCount === 0) {
  const insCat = db.prepare(`INSERT INTO categories (name, icon, sort) VALUES (?,?,?)`);
  insCat.run('书法', '📚', 1);
  insCat.run('文房', '🖌️', 2);
  insCat.run('碑帖', '📜', 3);
  insCat.run('活动', '🏕️', 4);
} else {
  // 迁移：把旧长名称同步为简化名称，保证已初始化过的数据库也能生效
  const renameMap = { '书法课程': '书法', '文房四宝': '文房', '碑帖字帖': '碑帖', '活动夏令营': '活动' };
  const upd = db.prepare(`UPDATE categories SET name=? WHERE name=?`);
  for (const [oldName, newName] of Object.entries(renameMap)) {
    try { upd.run(newName, oldName); } catch (e) {}
  }
}
const catMap = {};
for (const c of db.prepare('SELECT * FROM categories').all()) catMap[c.name] = c.id;

// 默认帖子栏目分类（翰墨交流四个栏目，后台可增删改）
const pcCount = db.prepare('SELECT COUNT(*) c FROM post_categories').get().c;
if (pcCount === 0) {
  const insPc = db.prepare(`INSERT INTO post_categories (name, value, sort) VALUES (?,?,?)`);
  insPc.run('教培动态', 'company', 1);
  insPc.run('作品展示', 'works', 2);
  insPc.run('碑帖资料', 'material', 3);
  insPc.run('活动交流', 'activity', 4);
}

// 默认课程
const courseCount = db.prepare('SELECT COUNT(*) c FROM courses').get().c;
if (courseCount === 0) {
  const ins = db.prepare(`INSERT INTO courses (title, subtitle, price, original_price, validity, level, type, category_id, content, is_group, group_min, images) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('书法基础班', '一年网络学习+线下指导', 499, 699, '1year', '499', 'course', catMap['书法'] || null, '适合零基础入门，系统学习楷书笔画、结构、临帖方法。', 0, 2, '[]');
  ins.run('书法进阶班', '系统进阶+名师精讲', 1299, 1699, '2year', '1299', 'course', catMap['书法'] || null, '进阶技法训练，行书、隶书等字体进阶，作品创作指导。', 1, 3, '[]');
  ins.run('书法终身班', '一次付费终身学习', 2999, 3999, 'lifetime', '2999', 'course', catMap['书法'] || null, '终身会员，全部课程与后续更新，含线下工作坊。', 1, 3, '[]');
}

// 默认公司介绍
const introCount = db.prepare('SELECT COUNT(*) c FROM company_intro').get().c;
if (introCount === 0) {
  db.prepare(`INSERT INTO company_intro (title, content) VALUES ('为什么选择我们', ?)`)
    .run(`<h3>专业书法名师</h3><p>汇集资深书法教师团队，多年一线教学经验，因材施教。</p><h3>系统课程体系</h3><p>从零基础到进阶，科学分级课程，循序渐进。</p><h3>一对一作业点评</h3><p>每份作业专人批改，指出问题并示范改进。</p><h3>线上线下双模式</h3><p>线上直播互动 + 线下到店指导，灵活选择。</p>`);
}

// 默认规则公示
const ruleCount = db.prepare('SELECT COUNT(*) c FROM rule_pages').get().c;
if (ruleCount === 0) {
  db.prepare(`INSERT INTO rule_pages (version, content) VALUES ('v1', ?)`).run(`【核心总则】
1、本平台所有收益、岗位权益，全部依托真实课程成交业绩，无业绩、无收入、无兜底福利。
2、所有推广奖励、学习圈待遇、孵化收益，公开透明、系统自动结算、人工不干预。
【学员推广收益规则】
1、成功推荐新学员报名499元年度课程，即刻获得100元介绍奖励，高阶课程奖励梯度递增。
2、帮扶自己推荐的学员成长，助力其成功孵化2名合格管培生，全额解锁200元培育奖励。
【分享奖励说明】
1、购买正价课包，您可以二选一：参与分享有奖，或者放弃本单分享奖励。
2、拼团、砍价属于优惠体验活动：
   - 普通学员参与拼团、砍价，仅获得课程学习权限，该订单不计分享奖励。
   - 已开通分享推广身份的学员，可以参与拼团、砍价优惠，但需要确认放弃该笔订单全部分享奖励，该笔订单不会产生推广收益。
3、放弃分享奖励仅针对当前这一笔订单，不会影响后续购买正价课包获取分享奖励的资格。
【名额归属与学习圈组建】
1、介绍前2名学员为孵化考核名额，固定送给介绍人帮扶留店：由介绍人获得培育奖；您本人享受其收入10%的待遇。
2、介绍第3名及以后学员归属您自己的学习圈，终身绑定、永久归属、不参与补位失效；学习圈组建人数无上限。
3、您名下管培生每介绍1名付费分享学员，您作为帮扶主理人获得200元培育奖。
4、好友想组建自己的学习圈，同样须先为您留下前2名留店成员，第3名起才是他/她自己的学习圈成员。
【管培生考核规则】
1、管培生无底薪、无保底薪资，月度根据成交业绩判定状态：合格、见习、失效。
2、月度完成2单及以上成交或业绩满1000元，为合格管培生，全额享受个人收益+学习圈相关权益。
3、月度有业绩但未达标，为见习管培生，个人收益减半，当月不计入学习圈待遇核算。
4、连续2个月零业绩，系统自动清退出管培生人才库，取消所有岗位权益。
【名额补位&学习圈待遇规则】
1、名下管培生被清退后，对应学习圈终身待遇即刻冻结，需在30天内补推1名合格管培生完成补位。
2、30天未按时补位，该名额永久作废，彻底丧失对应学习圈待遇权益。
3、单个孵化名额最多可补位2次，2次补位后再次淘汰，名额永久终止，不再支持补位。
4、学习圈负责人连续3个月名下无合格管培生、无学习圈业绩，所有学习圈待遇暂停发放，直至重新孵化有效管培生。
5、不补位则冻结主理人所有收入（奖励/待遇），完成补位后自动恢复。
【终极公平规则】
多劳多得、无劳无获，所有学习圈收益依托持续帮扶与真实业绩产出，杜绝躺平挂名，保障所有参与者公平收益。`);
}
// 存量规则公示词替换迁移：仅替换敏感字眼，保留后台可能自定义的其它内容
try {
  const ruleReplace = [
    ['上下级绑定', '推荐关系绑定'], ['二级分享', '转介绍'], ['直推的直推', '转介绍'],
    ['帮扶培育奖', '培育奖'], ['帮扶培养奖', '培育奖'], ['帮扶奖励', '培育奖励'],
    ['直推佣金', '介绍奖励'], ['直推奖励', '介绍奖励'], ['直推奖', '介绍奖'],
    ['佣金收益', '奖励收益'], ['佣金流水', '奖励流水'], ['佣金资格', '奖励资格'],
    ['佣金冻结', '奖励冻结'], ['分佣', '获得奖励'], ['直推', '介绍'], ['佣金', '奖励'],
    ['提成', '福利'], ['返利', '优惠'], ['津贴', '待遇'], ['团队', '学习圈'],
    ['团长', '主理人'], ['上级', '介绍人'], ['下级', '好友'], ['团员', '成员'],
    ['上下级', '推荐关系'], ['帮扶奖', '培育奖'],
  ];
  const allRules = db.prepare('SELECT id, content FROM rule_pages').all();
  for (const r of allRules) {
    let c = r.content || '';
    const before = c;
    for (const [a, b] of ruleReplace) c = c.split(a).join(b);
    if (c !== before) db.prepare('UPDATE rule_pages SET content=? WHERE id=?').run(c, r.id);
  }
} catch (e) { /* 迁移失败不影响启动 */ }
// 存量规则公示：追加【分享奖励说明】段落（正价二选一 / 拼团砍价不计分享奖励），已存在则不重复追加
try {
  const SHARE_RULE_SECTION = `【分享奖励说明】
1、购买正价课包，您可以二选一：参与分享有奖，或者放弃本单分享奖励。
2、拼团、砍价属于优惠体验活动：
   - 普通学员参与拼团、砍价，仅获得课程学习权限，该订单不计分享奖励。
   - 已开通分享推广身份的学员，可以参与拼团、砍价优惠，但需要确认放弃该笔订单全部分享奖励，该笔订单不会产生推广收益。
3、放弃分享奖励仅针对当前这一笔订单，不会影响后续购买正价课包获取分享奖励的资格。`;
  const rulesToAppend = db.prepare('SELECT id, content FROM rule_pages').all();
  for (const r of rulesToAppend) {
    const c = r.content || '';
    if (!c.includes('【分享奖励说明】')) {
      db.prepare('UPDATE rule_pages SET content=? WHERE id=?').run(c + '\n\n' + SHARE_RULE_SECTION, r.id);
    }
  }
} catch (e) { /* 迁移失败不影响启动 */ }

// ---------- 习题 / 练习模块 ----------
db.exec(`
-- 题库
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL DEFAULT 0,   -- 关联课程(0=通用)
  type TEXT NOT NULL DEFAULT 'single',    -- single单选/multi多选/judge判断
  question TEXT NOT NULL,
  options TEXT NOT NULL,                  -- JSON: [{"k":"A","t":"选项文本"},...]
  answer TEXT NOT NULL,                   -- 单选/判断:'A'/'对'; 多选:'A,B'
  analysis TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'on',               -- on/off
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
-- 答题记录（逐题）
CREATE TABLE IF NOT EXISTS practice_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER,
  question_id INTEGER NOT NULL,
  answer TEXT,
  correct INTEGER DEFAULT 0,              -- 1答对/0答错
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
-- 练习成绩单
CREATE TABLE IF NOT EXISTS practice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER,
  course_title TEXT,
  total INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  score INTEGER NOT NULL,                 -- 百分制
  duration INTEGER DEFAULT 0,             -- 用时(秒)
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// 题库种子（幂等增量：按题目标题查重，每次服务启动自动补齐缺失题目，可重复运行）
const insQ = db.prepare(`INSERT INTO questions (course_id, type, question, options, answer, analysis, sort) VALUES (?,?,?,?,?,?,?)`);
const hasQ = db.prepare('SELECT 1 FROM questions WHERE question=?');
let qSort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM questions').get().m;
const qSeed = [
  // —— 课程#1 书法基础班（楷书入门）——
  { c: 1, t: 'single', q: '楷书的四大基本笔画不包括以下哪一项？', o: [['A', '横'], ['B', '竖'], ['C', '撇'], ['D', '圆圈']], a: 'D', an: '楷书基本笔画为横、竖、撇、捺及点、钩、提、折等，圆圈不属于基本笔画。' },
  { c: 1, t: 'single', q: '书法练习中最常用的坐姿执笔高度约为笔杆的几分之几？', o: [['A', '二分之一'], ['B', '三分之一'], ['C', '四分之一'], ['D', '五分之三']], a: 'B', an: '一般执笔高度在笔杆约三分之一处，便于灵活控制笔画粗细。' },
  { c: 1, t: 'single', q: '临帖时应当遵循的正确顺序是？', o: [['A', '先临后摹'], ['B', '先摹后临'], ['C', '只临不摹'], ['D', '只看不写']], a: 'B', an: '临帖讲究先摹后临，摹（描红）熟悉字形结构，临（对照书写）体会笔法神韵。' },
  { c: 1, t: 'multi', q: '下列哪些属于书法学习中常用的文房工具？', o: [['A', '毛笔'], ['B', '宣纸'], ['C', '墨汁'], ['D', '砚台']], a: 'A,B,C,D', an: '笔墨纸砚合称「文房四宝」，均为书法学习的基础工具。' },
  { c: 1, t: 'multi', q: '楷书练习中，「永字八法」涉及下列哪些笔画？', o: [['A', '点'], ['B', '横'], ['C', '钩'], ['D', '撇']], a: 'A,B,C,D', an: '永字八法涵盖点、横、竖、钩、提、长撇、短撇、捺八种基本笔画。' },
  { c: 1, t: 'judge', q: '毛笔执笔时，指实掌虚是正确的执笔要领。', o: [['A', '对'], ['B', '错']], a: '对', an: '指实掌虚是传统执笔要领，指实保证稳定，掌虚便于灵活运笔。' },
  { c: 1, t: 'judge', q: '练习书法时坐姿可以随意，不影响书写效果。', o: [['A', '对'], ['B', '错']], a: '错', an: '正确坐姿（头正、身直、臂开、足安）是写好字的基础，不良坐姿会影响运笔。' },
  { c: 1, t: 'judge', q: '墨汁开封后无需摇匀即可直接使用。', o: [['A', '对'], ['B', '错']], a: '错', an: '墨汁静置后易沉淀，使用前需摇匀，否则浓淡不均影响书写。' },
  { c: 1, t: 'single', q: '中锋用笔的特点是？', o: [['A', '笔尖在笔画中间运行'], ['B', '笔尖在笔画边缘'], ['C', '笔杆完全横躺'], ['D', '只写侧锋']], a: 'A', an: '中锋用笔时笔尖在笔画中间运行，线条饱满圆润，是书法最重要的笔法之一。' },
  { c: 1, t: 'single', q: '「蚕头燕尾」是哪种书体的典型笔画特征？', o: [['A', '楷书'], ['B', '隶书'], ['C', '行书'], ['D', '草书']], a: 'B', an: '「蚕头燕尾」是隶书横画与捺画的典型特征，起笔如蚕头、收笔如燕尾。' },
  { c: 1, t: 'single', q: '汉字「永」字可分解为几种基本笔画（永字八法）？', o: [['A', '八种'], ['B', '六种'], ['C', '七种'], ['D', '九种']], a: 'A', an: '「永字八法」把楷书基本笔画归纳为点、横、竖、钩、提、长撇、短撇、捺八种。' },
  { c: 1, t: 'single', q: '书写楷书时最常用的运笔方法是？', o: [['A', '中锋运笔'], ['B', '拖笔'], ['C', '抖笔'], ['D', '横扫']], a: 'A', an: '中锋运笔是楷书基础笔法，笔尖藏于笔画中线，线条饱满有力。' },
  { c: 1, t: 'single', q: '文房四宝中被称为「纸中之王」的是？', o: [['A', '宣纸'], ['B', '报纸'], ['C', '牛皮纸'], ['D', '卡纸']], a: 'A', an: '宣纸质地柔韧、吸墨性好，被称为「纸中之王」「千年寿纸」。' },
  { c: 1, t: 'single', q: '初学书法最适合从哪种书体入手？', o: [['A', '楷书'], ['B', '草书'], ['C', '狂草'], ['D', '篆书']], a: 'A', an: '楷书笔画规范、结构端正，是书法入门最稳妥的书体。' },
  { c: 1, t: 'single', q: '「悬腕」是指书写时？', o: [['A', '手腕悬起不贴桌面'], ['B', '手腕紧贴桌面'], ['C', '手肘撑在桌上'], ['D', '无需握笔']], a: 'A', an: '悬腕使手臂整体运笔更灵活，适合书写较大的字。' },
  { c: 1, t: 'single', q: '下列哪部碑帖是楷书经典？', o: [['A', '《九成宫醴泉铭》'], ['B', '《兰亭序》'], ['C', '《自叙帖》'], ['D', '《古诗四帖》']], a: 'A', an: '《九成宫醴泉铭》为欧阳询楷书代表作，是楷书临习的经典范本。' },
  { c: 1, t: 'single', q: '写毛笔字时，笔杆一般应保持？', o: [['A', '竖直（略向书写方向倾斜）'], ['B', '完全水平'], ['C', '任意方向'], ['D', '向下垂']], a: 'A', an: '笔杆基本竖直、略向书写方向倾斜，才能保证中锋用笔、笔画稳健。' },
  { c: 1, t: 'single', q: '练字时「读帖」的主要目的是？', o: [['A', '观察字形结构与笔法特点'], ['B', '朗读字帖内容'], ['C', '背诵课文'], ['D', '放松眼睛']], a: 'A', an: '读帖是通过观察体会点画形态、结构规律与神韵，是临帖前的重要环节。' },
  { c: 1, t: 'single', q: '下列哪一项不属于正确的用墨习惯？', o: [['A', '用后盖紧墨瓶'], ['B', '墨汁兑水过多'], ['C', '及时清洗毛笔'], ['D', '墨汁摇匀后使用']], a: 'B', an: '墨汁兑水过多会导致墨色灰淡、洇纸，应尽量原汁使用。' },
  { c: 1, t: 'single', q: '楷书的结构讲究？', o: [['A', '重心平稳、笔画匀称'], ['B', '随意摆放'], ['C', '越斜越有动感'], ['D', '越密越好']], a: 'A', an: '重心平稳、结体匀称是楷书结构的基本要求，也是「字正」的基础。' },
  { c: 1, t: 'multi', q: '运笔过程一般包括哪些步骤？', o: [['A', '起笔'], ['B', '行笔'], ['C', '收笔'], ['D', '飞白']], a: 'A,B,C', an: '一个完整笔画通常包含起笔、行笔、收笔三个环节，飞白是行笔中的特殊效果。' },
  { c: 1, t: 'multi', q: '书写前需要准备的文房用具有？', o: [['A', '毛笔'], ['B', '宣纸'], ['C', '墨汁'], ['D', '砚台']], a: 'A,B,C,D', an: '笔墨纸砚为文房四宝，是书法书写的基本用具。' },
  { c: 1, t: 'multi', q: '下列哪些是良好的练字习惯？', o: [['A', '每天坚持练习'], ['B', '注重读帖'], ['C', '保持姿势端正'], ['D', '三天打鱼两天晒网']], a: 'A,B,C', an: '循序渐进、持之以恒并保持正确姿势，才能稳步提高书写水平。' },
  { c: 1, t: 'judge', q: '楷书又称「真书」「正书」。', o: [['A', '对'], ['B', '错']], a: '对', an: '楷书端正规范，又称真书、正书，是汉字手写体的标准形态。' },
  { c: 1, t: 'judge', q: '字写得越大越有气魄，越小越没精神。', o: [['A', '对'], ['B', '错']], a: '错', an: '字的精神不在于大小，而在于笔画质量、结体是否得法。' },
  { c: 1, t: 'judge', q: '毛笔使用后应立即清洗干净并悬挂晾干。', o: [['A', '对'], ['B', '错']], a: '对', an: '用后及时清洗、理顺笔毛晾干，可以延长毛笔使用寿命。' },
  { c: 1, t: 'judge', q: '「永字八法」是学习楷书笔画的重要方法。', o: [['A', '对'], ['B', '错']], a: '对', an: '永字八法集中了楷书主要笔画，是书法入门的重要训练方法。' },
  { c: 1, t: 'judge', q: '临帖时可以凭印象随意改写原帖字形。', o: [['A', '对'], ['B', '错']], a: '错', an: '临帖贵在忠实原帖，掌握其笔法与结构规律，随意改写难以进步。' },
  { c: 1, t: 'judge', q: '执笔越高，笔锋越容易稳定。', o: [['A', '对'], ['B', '错']], a: '错', an: '执笔越高控制难度越大，通常写小字宜低执，写大字可适当高执。' },
  { c: 1, t: 'judge', q: '写字讲究「意在笔先」，下笔前要先想好字形。', o: [['A', '对'], ['B', '错']], a: '对', an: '意在笔先是传统书论的重要主张，动笔前胸有成竹，落笔方能果断准确。' },
  // —— 课程#2 书法进阶班（行草·书法史）——
  { c: 2, t: 'single', q: '行书介于楷书与哪种书体之间？', o: [['A', '草书'], ['B', '篆书'], ['C', '隶书'], ['D', '甲骨文']], a: 'A', an: '行书兼具楷书的易识与草书的流畅，介于楷书与草书之间。' },
  { c: 2, t: 'single', q: '被誉为「天下第一行书」的是？', o: [['A', '《兰亭序》'], ['B', '《祭侄文稿》'], ['C', '《寒食帖》'], ['D', '《蜀素帖》']], a: 'A', an: '王羲之《兰亭序》被誉为「天下第一行书」，行书艺术巅峰之作。' },
  { c: 2, t: 'single', q: '「天下第二行书」是颜真卿的哪部作品？', o: [['A', '《祭侄文稿》'], ['B', '《兰亭序》'], ['C', '《洛神赋》'], ['D', '《九成宫》']], a: 'A', an: '颜真卿《祭侄文稿》情感真挚、笔势沉郁，被尊为「天下第二行书」。' },
  { c: 2, t: 'single', q: '隶书在哪个时期逐步成熟并兴盛？', o: [['A', '秦汉时期'], ['B', '唐宋时期'], ['C', '明清时期'], ['D', '近现代']], a: 'A', an: '隶书萌生于秦、成熟盛行于汉，是汉字由篆到楷演变的关键书体。' },
  { c: 2, t: 'single', q: '下列哪位是唐代楷书大家？', o: [['A', '欧阳询'], ['B', '王羲之'], ['C', '苏轼'], ['D', '赵孟頫']], a: 'A', an: '唐代楷书四大家为欧阳询、颜真卿、柳公权、褚遂良。' },
  { c: 2, t: 'single', q: '草书最显著的书写特点是？', o: [['A', '笔画连绵、结体简省'], ['B', '一笔一画规整'], ['C', '用笔方正'], ['D', '不讲究法度']], a: 'A', an: '草书以笔画连绵、结体简省为特征，仍须遵循规范法度。' },
  { c: 2, t: 'single', q: '书法中「章法」指的是？', o: [['A', '通篇的布局与安排'], ['B', '单个笔画写法'], ['C', '纸张材质'], ['D', '装裱方式']], a: 'A', an: '章法指通篇作品的布局安排，包括字距、行距、疏密、落款与钤印等。' },
  { c: 2, t: 'single', q: '王羲之书法的代表风格常被概括为？', o: [['A', '遒媚劲健'], ['B', '粗犷豪放'], ['C', '方正板滞'], ['D', '圆润无骨']], a: 'A', an: '王羲之书法刚柔相济、遒媚劲健，被后世誉为「书圣」。' },
  { c: 2, t: 'single', q: '宋代「苏黄米蔡」四大家中，苏轼的行书代表作是？', o: [['A', '《寒食帖》'], ['B', '《兰亭序》'], ['C', '《九成宫》'], ['D', '《多宝塔碑》']], a: 'A', an: '苏轼《寒食帖》被称为「天下第三行书」，笔意自然洒脱。' },
  { c: 2, t: 'single', q: '楷书四大家中「颜筋柳骨」分别指？', o: [['A', '颜真卿、柳公权'], ['B', '欧阳询、赵孟頫'], ['C', '王羲之、王献之'], ['D', '苏轼、黄庭坚']], a: 'A', an: '「颜筋」指颜真卿书法丰腴雄浑，「柳骨」指柳公权书法骨力遒健。' },
  { c: 2, t: 'judge', q: '书法欣赏主要从笔法、结构、章法三个方面入手。', o: [['A', '对'], ['B', '错']], a: '对', an: '笔法、结字、章法是书法鉴赏的三个基本维度。' },
  { c: 2, t: 'judge', q: '篆书是中国历史上最早的成熟文字书体之一。', o: [['A', '对'], ['B', '错']], a: '对', an: '商周甲骨文、金文以及秦统一后的小篆，都属于篆书体系。' },
  { c: 2, t: 'judge', q: '学习书法完全不需要了解书法史。', o: [['A', '对'], ['B', '错']], a: '错', an: '了解书法史有助于理解各书体的源流与审美脉络，开阔眼界。' },
  { c: 2, t: 'judge', q: '「临池学书」的典故与东晋书法家王羲之有关。', o: [['A', '对'], ['B', '错']], a: '对', an: '王羲之临池学书、池水尽墨，是勤学苦练的书法典故。' },
  // —— 通用书法常识（course_id=0）——
  { c: 0, t: 'single', q: '被称为「书圣」的书法家是？', o: [['A', '王羲之'], ['B', '颜真卿'], ['C', '柳公权'], ['D', '欧阳询']], a: 'A', an: '王羲之博采众长、自成一家，被后世尊为「书圣」。' },
  { c: 0, t: 'single', q: '中国书法的主要五种书体是？', o: [['A', '篆、隶、楷、行、草'], ['B', '甲骨、金文、大篆、小篆、隶书'], ['C', '简体、繁体、行书、草书、楷书'], ['D', '黑体、宋体、仿宋、楷体、隶书']], a: 'A', an: '传统书法五大书体为篆书、隶书、楷书、行书、草书。' },
  { c: 0, t: 'single', q: '练习书法带来的益处不包括？', o: [['A', '快速致富'], ['B', '锻炼专注力'], ['C', '修身养性'], ['D', '提升审美']], a: 'A', an: '书法重在静心养性、提升审美，与快速致富无关。' },
  { c: 0, t: 'single', q: '初学书法选择字帖，应优先选择？', o: [['A', '名家经典碑帖'], ['B', '随意打印的字'], ['C', '电脑印刷体'], ['D', '手写草稿']], a: 'A', an: '名家经典碑帖笔法规范、审美价值高，是临习的最佳范本。' },
  { c: 0, t: 'single', q: '「笔墨纸砚」中「砚」的主要作用是？', o: [['A', '研磨储墨'], ['B', '压纸'], ['C', '裁纸'], ['D', '镇尺']], a: 'A', an: '砚台用于研磨墨块、储放墨汁，是文房四宝之一。' },
  { c: 0, t: 'multi', q: '下列属于书法艺术欣赏要素的有？', o: [['A', '笔法'], ['B', '结体'], ['C', '章法'], ['D', '墨色']], a: 'A,B,C,D', an: '笔法、结体、章法、墨色是书法欣赏的四个基本要素。' },
  { c: 0, t: 'judge', q: '书法是中华优秀传统文化的重要组成部分。', o: [['A', '对'], ['B', '错']], a: '对', an: '书法承载千年文脉，是中华文化的重要载体。' },
  { c: 0, t: 'judge', q: '练字需要「专一」，选定一种帖坚持下去。', o: [['A', '对'], ['B', '错']], a: '对', an: '初学者宜专攻一帖、吃透一家，避免朝三暮四。' },
];
let qInserted = 0;
qSeed.forEach(s => {
  if (hasQ.get(s.q)) return;
  qSort++;
  insQ.run(s.c || 0, s.t, s.q, JSON.stringify(s.o.map(([k, t]) => ({ k, t }))), s.a, s.an || '', qSort);
  qInserted++;
});
if (qInserted) console.log('[init] 题库种子补齐 ' + qInserted + ' 道题（现有 ' + qSeed.length + ' 道）');

module.exports = db;
