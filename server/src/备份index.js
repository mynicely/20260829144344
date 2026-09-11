// 主服务入口
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./db');
const engine = require('./engine');
const auth = require('./auth');
const wxpay = require('./wxpay');
const { initCron } = require('./cron');
const bcrypt = require('bcryptjs');

// 支持 npm run init：仅初始化数据库（建表/默认配置）后退出，不启动 HTTP 服务
if (process.argv.includes('--init')) {
  console.log('[init] 数据库初始化完成：' + require('path').join(__dirname, '..', 'data', 'hanmo.db'));
  process.exit(0);
}

const app = express();
// CORS 白名单：生产环境务必通过环境变量 CORS_ORIGINS（逗号分隔）配置前端域名；
// 默认仅放行本地开发前端。同域部署（前后端同一域名）无需额外配置。
const CORS_ALLOWED = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: CORS_ALLOWED }));
// 增大 body 限制，支持 base64 图片/文件上传
// verify 回调捕获原始报文：微信支付V3回调验签必须使用未改动的原始字节
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.path === '/api/pay/notify') req.rawBody = buf.toString('utf8');
  },
}));
app.use(morgan('dev'));

// ---------- 轻量 IP 限流（内存滑动窗口） ----------
// 防止注册/登录/下单/发帖/提现等接口被脚本循环刷爆；纯内存实现，重启即清零，足够防护单机场景
const rateBuckets = new Map(); // key: `${ip}|${limitKey}` -> { count, resetAt }
function rateLimit(limitKey, limit, windowSec) {
  return (req, res, next) => {
    // 只限写操作，公开 GET 浏览不限制
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = ip + '|' + limitKey;
    const now = Date.now();
    let b = rateBuckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowSec * 1000 };
      rateBuckets.set(key, b);
    }
    b.count++;
    if (b.count > limit) {
      // 偶发清理，避免 Map 无限膨胀
      if (rateBuckets.size > 50000) rateBuckets.clear();
      return res.status(429).json({ ok: false, msg: `操作过于频繁，请 ${Math.ceil((b.resetAt - now) / 1000)} 秒后重试` });
    }
    next();
  };
}
// 应用：注册/验证码/登录 20次/分钟；下单 20次/分钟；发帖评论点赞 30次/分钟；提现 10次/分钟
app.use('/api/auth/register', rateLimit('register', 20, 60));
app.use('/api/auth/send-sms-code', rateLimit('sms', 20, 60));
app.use('/api/auth/login', rateLimit('login', 30, 60));
app.use('/api/auth/login-by-sms', rateLimit('smslogin', 20, 60));
app.use('/api/auth/wechat-login', rateLimit('wxlogin', 20, 60));
app.use('/api/order', rateLimit('order', 20, 60));
app.use('/api/community/posts', rateLimit('posts', 30, 60));
app.use('/api/user/withdraw', rateLimit('withdraw', 10, 60));
app.use('/api/trial/book', rateLimit('trial', 20, 60));

// ---------- 管理后台路径前缀中间件 ----------
// 后台路径前缀可在「参数配置」中修改（默认 admin）。修改后：
//   1) 旧路径 /api/admin/* 立即失效（防破解，返回404）
//   2) 新路径 /api/{prefix}/* 会被改写为 /api/admin/* 继续走原有路由
function getAdminPrefix() {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get('admin_prefix');
  if (!row) return 'admin';
  try { return String(JSON.parse(row.value).v || 'admin'); } catch (e) { return 'admin'; }
}
app.use((req, res, next) => {
  const p = getAdminPrefix();
  if (p && p !== 'admin') {
    if (req.path === '/api/admin' || req.path.startsWith('/api/admin/')) {
      return res.status(404).json({ ok: false, msg: 'Not Found' });
    }
    const seg = '/api/' + p;
    if (req.path === seg || req.path.startsWith(seg + '/')) {
      const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      req.url = '/api/admin' + req.path.slice(seg.length) + q;
    }
  }
  next();
});
// 公开：后台路径前缀（前端启动时读取，决定后台访问地址）
app.get('/api/public/admin-prefix', (req, res) => {
  res.json({ ok: true, data: { prefix: getAdminPrefix() } });
});
// 公开：拼团/砍价分档配置（前端展示档位提示，课程未单独配置时作为默认值）
app.get('/api/public/marketing', (req, res) => {
  res.json({
    ok: true,
    data: {
      groupTiers: getGroupTiers(),
      bargainTiers: getBargainTiers(),
      bargainStepReduce: getSettingNumE('bargain_step_reduce', 0),
      bargainMaxHelps: getSettingNumE('bargain_max_helps', 5),
      bargainFloorRate: getSettingNumE('bargain_floor_rate', 0.5),
      groupMin: engine.getSettingNum('group_min') || 2,
    },
  });
});

// ---------- 营销工具：课程级档位/规则读取（兼容全局配置与老字段） ----------
function safeJson(str, def) {
  try { return JSON.parse(str || ''); } catch (e) { return def; }
}
// 读取课程的拼团档位：优先 courses.group_tiers，其次全局 group_price_tiers，最后 group_min+group_discount
function getCourseGroupTiers(course) {
  const own = safeJson(course.group_tiers, null);
  if (Array.isArray(own) && own.length) {
    return own.map(t => ({
      n: Number(t.count || t.n),
      price: Number(t.price),
      services: t.services || '',
      gift: t.gift || '',
      label: t.label || `${t.count || t.n}人团`
    }));
  }
  const globalTiers = parseTierText(getSettingArr('group_price_tiers'));
  if (globalTiers.length) return globalTiers;
  const min = course.group_min || engine.getSettingNum('group_min') || 2;
  const price = Math.max(0, Number(course.price) - Number(course.group_discount || 0));
  return [{ n: min, price, services: '', gift: '', label: `${min}人团` }];
}
// 读取课程的砍价规则：优先 courses.bargain_config，其次全局配置
function getCourseBargainConfig(course) {
  const own = safeJson(course.bargain_config, null);
  if (own && own.mode) return normalizeBargainConfig(own, course);
  const tiers = parseTierText(getSettingArr('bargain_price_tiers'));
  const step = getSettingNumE('bargain_step_reduce', 0);
  const maxHelps = getSettingNumE('bargain_max_helps', 5);
  const floorRate = getSettingNumE('bargain_floor_rate', 0.5);
  let cfg = { floor_price: Math.floor(course.price * floorRate), max_helps: maxHelps };
  if (tiers.length) {
    cfg.mode = 'tiers';
    cfg.tiers = tiers.map(t => ({ n: t.n, price: t.price, services: '', gift: '' }));
    cfg.floor_price = tiers[tiers.length - 1].price;
  } else if (step > 0) {
    cfg.mode = 'step';
    cfg.step = step;
    cfg.floor_price = Math.max(Math.floor(course.price * floorRate), course.price - maxHelps * step);
  } else {
    cfg.mode = 'random';
  }
  return cfg;
}
function normalizeBargainConfig(raw, course) {
  const price = Number(course.price) || 0;
  const cfg = { ...raw };
  cfg.mode = cfg.mode || 'random';
  cfg.floor_price = Number(cfg.floor_price) || Math.floor(price * 0.5);
  cfg.max_helps = Number(cfg.max_helps) || 5;
  if (cfg.mode === 'tiers' && Array.isArray(cfg.tiers)) {
    cfg.tiers = cfg.tiers.map(t => ({
      n: Number(t.helps || t.n),
      price: Number(t.price),
      services: t.services || '',
      gift: t.gift || ''
    })).sort((a, b) => a.n - b.n);
    if (cfg.tiers.length) cfg.floor_price = cfg.tiers[cfg.tiers.length - 1].price;
  }
  if (cfg.mode === 'step') cfg.step = Number(cfg.step) || 10;
  return cfg;
}

// 公开：登录页配置（管理员联系方式 + 短信验证码登录开关），供「联系管理员」入口与短信登录展示
app.get('/api/public/login-options', (req, res) => {
  res.json({
    ok: true,
    data: {
      adminContact: getSettingNumE('admin_contact', '') || '',
      smsLoginEnabled: !!getSettingNumE('sms_login_enabled', 1),
      smsMockMode: !!getSettingNumE('sms_mock_mode', 1),
      wechatEnabled: !!(getSettingNumE('wx_oauth_appid', '') && getSettingNumE('wx_oauth_secret', '')),
    },
  });
});

// ---------- 静态文件服务：上传文件 ----------
const path = require('path');
const fs = require('fs');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- 文件上传（base64） ----------
// 安全加固：扩展名白名单（拒绝脚本/可执行文件）+ 单文件大小限制（10MB）
const ALLOWED_UPLOAD_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'mp4', 'mp3']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
// 公共上传逻辑：data 为 "data:image/png;base64,xxxx" 或纯 base64；返回 { url, name }，失败抛出带 status 的 Error
function saveUploadFile(data, name) {
  let base64 = data;
  let ext = null;
  const mimeMatch = data.match(/^data:([^;]+);base64,(.+)$/);
  if (mimeMatch) {
    base64 = mimeMatch[2];
    const mime = mimeMatch[1];
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('pdf')) ext = 'pdf';
    else if (mime.includes('mp4')) ext = 'mp4';
    else if (mime.includes('audio')) ext = 'mp3';
  } else if (name) {
    // 无 MIME 前缀时：仅接受名称中的白名单扩展名，杜绝伪造 shell.php 等可执行后缀
    const n = String(name).split('.');
    const cand = n.length > 1 ? n.pop().toLowerCase() : '';
    if (ALLOWED_UPLOAD_EXT.has(cand)) ext = cand;
  }
  if (!ext || !ALLOWED_UPLOAD_EXT.has(ext)) {
    const err = new Error('不支持的文件类型，仅允许图片/PDF/音视频');
    err.status = 400;
    throw err;
  }
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) {
    const err = new Error('文件内容为空');
    err.status = 400;
    throw err;
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    const err = new Error('文件过大，单文件最大 10MB');
    err.status = 400;
    throw err;
  }
  const fname = Date.now() + '_' + Math.floor(Math.random() * 10000) + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
  return { url: '/uploads/' + fname, name: fname };
}
app.post('/api/upload', auth.authUser, (req, res) => {
  const { data, name } = req.body; // data: "data:image/png;base64,xxxx" 或纯base64
  if (!data) return res.status(400).json({ ok: false, msg: '缺少文件数据' });
  try {
    res.json({ ok: true, ...saveUploadFile(data, name) });
  } catch (e) {
    res.status(e.status === 400 ? 400 : 400).json({ ok: false, msg: '文件处理失败: ' + e.message });
  }
});
// 管理后台文件上传（管理员鉴权）：后台表单（课程封面等）上传本地图片使用
app.post('/api/admin/upload', auth.authAdmin, (req, res) => {
  const { data, name } = req.body;
  if (!data) return res.status(400).json({ ok: false, msg: '缺少文件数据' });
  try {
    res.json({ ok: true, ...saveUploadFile(data, name) });
  } catch (e) {
    res.status(400).json({ ok: false, msg: '文件处理失败: ' + e.message });
  }
});

// ---------- 基础 ----------
app.get('/api/health', (req, res) => res.json({ ok: true, msg: '翰墨分享服务运行中' }));

// ---------- 公开：类目列表 ----------
app.get('/api/categories', (req, res) => {
  const list = db.prepare(`SELECT * FROM categories WHERE status='on' ORDER BY sort, id`).all();
  res.json({ ok: true, data: list });
});

// ---------- 公开：商品/课程列表（按类目筛选） ----------
app.get('/api/courses', (req, res) => {
  const cat = req.query.category;
  let sql = `SELECT * FROM courses WHERE status='on'`;
  const params = [];
  if (cat && cat !== 'all') { sql += ` AND category_id=?`; params.push(Number(cat)); }
  sql += ` ORDER BY id DESC`;
  const courses = db.prepare(sql).all(...params);
  // 解析 images / 课程级营销配置
  courses.forEach(c => {
    try { c.images = JSON.parse(c.images || '[]'); } catch (e) { c.images = []; }
    try { c.group_tiers = JSON.parse(c.group_tiers || '[]'); } catch (e) { c.group_tiers = []; }
    try { c.bargain_config = JSON.parse(c.bargain_config || '{}'); } catch (e) { c.bargain_config = {}; }
  });
  res.json({ ok: true, data: courses });
});

// ---------- 公开：商品详情 ----------
app.get('/api/courses/:id', (req, res) => {
  const c = db.prepare(`SELECT * FROM courses WHERE id=? AND status='on'`).get(Number(req.params.id));
  if (!c) return res.status(404).json({ ok: false, msg: '商品不存在' });
  try { c.images = JSON.parse(c.images || '[]'); } catch (e) { c.images = []; }
  try { c.faq = JSON.parse(c.faq || '[]'); } catch (e) { c.faq = []; }
  // 课程级营销配置解析（为空时由前端/后端按需计算默认值）
  try { c.group_tiers = JSON.parse(c.group_tiers || '[]'); } catch (e) { c.group_tiers = []; }
  try { c.bargain_config = JSON.parse(c.bargain_config || '{}'); } catch (e) { c.bargain_config = {}; }
  res.json({ ok: true, data: c });
});

// ---------- 课程评价 ----------
// 评价列表（公开，带登录可选：返回当前用户是否已购/已评）
app.get('/api/course/:id/reviews', auth.optionalUser, (req, res) => {
  const courseId = Number(req.params.id);
  const stat = db.prepare(`SELECT COUNT(*) c, COALESCE(ROUND(AVG(rating),1),0) avg FROM reviews WHERE course_id=? AND status='on'`).get(courseId);
  const list = db.prepare(`SELECT r.*, u.nickname, u.avatar FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.course_id=? AND r.status='on' ORDER BY r.id DESC LIMIT 50`).all(courseId);
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  let canReview = false, mine = null;
  if (req.user && course) {
    const bought = db.prepare(`SELECT * FROM orders WHERE user_id=? AND status='paid' AND product_type=?`).get(req.user.id, String(course.price));
    canReview = !!bought;
    mine = db.prepare(`SELECT * FROM reviews WHERE course_id=? AND user_id=?`).get(courseId, req.user.id) || null;
  }
  res.json({ ok: true, data: { count: stat.c, avg: stat.avg, list, canReview, mine } });
});

// 提交评价（仅已购学员，每课程限1条）
app.post('/api/course/:id/review', auth.authUser, (req, res) => {
  const courseId = Number(req.params.id);
  const { rating, content } = req.body || {};
  const r = Number(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ ok: false, msg: '请选择1-5星评分' });
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  if (!course) return res.status(404).json({ ok: false, msg: '课程不存在' });
  const bought = db.prepare(`SELECT * FROM orders WHERE user_id=? AND status='paid' AND product_type=?`).get(req.user.id, String(course.price));
  if (!bought) return res.status(403).json({ ok: false, msg: '仅已购学员可评价' });
  const exist = db.prepare('SELECT * FROM reviews WHERE course_id=? AND user_id=?').get(courseId, req.user.id);
  if (exist) return res.status(400).json({ ok: false, msg: '您已评价过该课程' });
  // 评价内容敏感词拦截（评价公开展示，与交流社区同一敏感词库）
  if (content) {
    const hits = hitSensitive(String(content));
    if (hits.length) return res.status(400).json({ ok: false, msg: '评价包含敏感词（' + hits.join('、') + '），请修改后重试' });
  }
  db.prepare(`INSERT INTO reviews (course_id, user_id, order_id, rating, content) VALUES (?,?,?,?,?)`)
    .run(courseId, req.user.id, bought.id, r, sanitizeHtml(String(content || '').trim()));
  res.json({ ok: true, msg: '评价成功，感谢您的反馈' });
});

// ---------- 课程章节（章节式学习） ----------
// 章节列表（公开，登录后附带当前用户完成状态）
app.get('/api/course/:id/chapters', auth.optionalUser, (req, res) => {
  const courseId = Number(req.params.id);
  const course = db.prepare(`SELECT id, type FROM courses WHERE id=? AND status='on'`).get(courseId);
  if (!course) return res.status(404).json({ ok: false, msg: '课程不存在' });
  const list = db.prepare(`SELECT id, course_id, title, duration, content, sort FROM course_chapters WHERE course_id=? AND status='on' ORDER BY sort, id`).all(courseId);
  let done = {};
  if (req.user) {
    const rows = db.prepare(`SELECT chapter_id FROM chapter_progress WHERE user_id=? AND course_id=? AND completed=1`).all(req.user.id, courseId);
    done = Object.fromEntries(rows.map(r => [r.chapter_id, true]));
  }
  list.forEach(ch => { ch.done = !!done[ch.id]; });
  res.json({ ok: true, data: { total: list.length, doneCount: Object.keys(done).length, chapters: list } });
});

// 标记章节完成/取消完成（仅已购学员可操作）
app.post('/api/course/:id/chapters/:cid/done', auth.authUser, (req, res) => {
  const courseId = Number(req.params.id);
  const chapterId = Number(req.params.cid);
  const done = req.body?.done === true || req.body?.done === 1;
  const ch = db.prepare(`SELECT * FROM course_chapters WHERE id=? AND course_id=?`).get(chapterId, courseId);
  if (!ch) return res.status(404).json({ ok: false, msg: '章节不存在' });
  const bought = db.prepare(`SELECT id FROM orders WHERE user_id=? AND status='paid' AND course_id=?`).get(req.user.id, courseId)
    || db.prepare(`SELECT id FROM orders WHERE user_id=? AND status='paid' AND product_type=?`).get(req.user.id, String((db.prepare(`SELECT price FROM courses WHERE id=?`).get(courseId) || {}).price));
  if (!bought) return res.status(403).json({ ok: false, msg: '购买课程后可记录学习进度' });
  if (done) {
    db.prepare(`INSERT OR IGNORE INTO chapter_progress (user_id, course_id, chapter_id, completed) VALUES (?,?,?,1)`).run(req.user.id, courseId, chapterId);
  } else {
    db.prepare(`DELETE FROM chapter_progress WHERE user_id=? AND course_id=? AND chapter_id=?`).run(req.user.id, courseId, chapterId);
  }
  const cnt = db.prepare(`SELECT COUNT(*) c FROM chapter_progress WHERE user_id=? AND course_id=? AND completed=1`).get(req.user.id, courseId).c;
  res.json({ ok: true, msg: done ? '已标记完成' : '已标记未完成', doneCount: cnt });
});

// 管理端：覆盖保存课程章节（数组 [{title,duration,content}]）
app.post('/api/admin/courses/:id/chapters', auth.authAdmin, (req, res) => {
  const courseId = Number(req.params.id);
  const c = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  if (!c) return res.status(404).json({ ok: false, msg: '商品不存在' });
  const list = Array.isArray(req.body?.chapters) ? req.body.chapters : [];
  db.prepare(`DELETE FROM course_chapters WHERE course_id=?`).run(courseId);
  const ins = db.prepare(`INSERT INTO course_chapters (course_id, title, duration, content, sort) VALUES (?,?,?,?,?)`);
  list.forEach((ch, i) => {
    const title = String(ch.title || '').trim();
    if (!title) return;
    ins.run(courseId, title, String(ch.duration || '').trim(), String(ch.content || ''), i + 1);
  });
  res.json({ ok: true, msg: `已保存 ${list.filter(ch => String(ch.title || '').trim()).length} 个章节` });
});

// 我的课程（已购，按价格档位关联对应课程）
app.get('/api/user/my-courses', auth.authUser, (req, res) => {
  // 修复：优先按课程ID分组（新订单），老订单无 course_id 时按价格档位兜底分组，避免同价位不同课程被合并显示
  const orders = db.prepare(`
    SELECT
      CASE WHEN course_id IS NOT NULL THEN 'c'||course_id ELSE 'p'||product_type END AS gkey,
      MAX(course_id) AS course_id, product_type,
      MAX(id) AS last_order_id, MAX(created_at) AS bought_at,
      SUM(amount) AS total_paid, COUNT(*) AS order_count
    FROM orders WHERE user_id=? AND status='paid'
    GROUP BY gkey ORDER BY last_order_id DESC`).all(req.user.id);
  const list = orders.map(o => {
    let c = null;
    if (o.course_id) {
      c = db.prepare(`SELECT id, title, subtitle, cover, content, validity, level FROM courses WHERE id=? AND type='course'`).get(o.course_id);
    }
    if (!c) {
      c = db.prepare(`SELECT id, title, subtitle, cover, content, validity, level FROM courses WHERE price=? AND type='course' AND status='on' ORDER BY id LIMIT 1`).get(o.product_type);
    }
    if (c) {
      c.chapterTotal = db.prepare(`SELECT COUNT(*) c FROM course_chapters WHERE course_id=? AND status='on'`).get(c.id).c;
      c.chapterDone = db.prepare(`SELECT COUNT(*) c FROM chapter_progress WHERE user_id=? AND course_id=? AND completed=1`).get(req.user.id, c.id).c;
    }
    return { ...o, course: c || null };
  });
  res.json({ ok: true, data: list });
});

// ---------- 公开：规则公示（双版本） ----------
app.get('/api/rules', (req, res) => {
  const rules = db.prepare(`SELECT * FROM rule_pages ORDER BY id DESC LIMIT 1`).get();
  res.json({ ok: true, data: rules });
});
// 规则公示双版本：simple极简用户版 / full完整合规版
app.get('/api/rules/:version', (req, res) => {
  const rules = db.prepare(`SELECT * FROM rule_pages ORDER BY id DESC LIMIT 1`).get();
  const simple = `【核心总则】
1、本平台所有收益、岗位权益，全部依托真实课程成交业绩，无业绩、无收入、无兜底福利。
2、所有推广奖励、学习圈待遇、孵化收益，公开透明、系统自动结算、人工不干预。
【学员推广收益规则】
1、成功推荐新学员报名499元年度课程，即刻获得100元介绍奖励，高阶课程奖励梯度递增。
2、帮扶自己推荐的学员成长，助力其成功孵化2名合格管培生，全额解锁200元培育奖励。
【分享奖励说明】
1、购买正价课包，您可以二选一：参与分享有奖，或者放弃本单分享奖励。
2、拼团、砍价属于优惠体验活动：
- 普通学员参与拼团、砍价，仅获得课程学习权限，该订单不计分享奖励。
- 已开通分享推广身份的学员，可以参与拼团、砍价优惠，但需确认放弃该笔订单全部分享奖励，该笔订单不会产生推广收益。
3、放弃分享奖励仅针对当前这一笔订单，不影响后续购买正价课包获取分享奖励的资格。
【名额归属与学习圈组建】
1、介绍前2名学员为孵化考核名额，送给介绍人帮扶留店，由介绍人获得培育奖；您本人享受其收入10%的待遇。
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
多劳多得、无劳无获，所有学习圈收益依托持续帮扶与真实业绩产出，杜绝躺平挂名，保障所有参与者公平收益。`;
  const full = `【核心总则】
1、本平台所有收益、岗位权益，全部依托真实课程成交业绩，无业绩、无收入、无兜底福利。
2、所有推广奖励、学习圈待遇、孵化收益，公开透明、系统自动结算、人工不干预。
3、付费全部为教学服务费，推广权益为平台免费赠与，非加盟收费。
4、仅两级分享，无多层级躺赚，完全合规。
【学员推广收益规则】
1、成功推荐新学员报名499元年度课程，即刻获得100元介绍奖励，高阶课程奖励梯度递增。
2、帮扶自己推荐的学员成长，助力其成功孵化2名合格管培生，全额解锁200元培育奖励；中途名额淘汰未补位达标，不予发放。
【名额归属与学习圈组建（帮扶留店制）】
1、每位推广者的介绍前2名学员为孵化考核名额，固定送给介绍人帮扶留店：由介绍人作为帮扶主理人获得培育奖，名额补位义务由您承担；您本人对该2名学员的收入享受10%的待遇。
2、介绍第3名及以后学员归属您自己的学习圈，终身绑定、永久归属、不参与补位失效；学习圈组建人数理论无上限。
3、培育奖：您名下管培生每介绍1名付费分享学员，您作为帮扶主理人获得200元培育奖（该学员介绍奖励归管培生本人）。
4、好友想组建自己的学习圈，同样须先为您留下前2名留店成员，第3名起才是他/她自己的学习圈成员；两级留店规则人人平等。
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
5、强约束：管培生未达标立即提示主理人可申请补位；不补位则冻结主理人所有收入（奖励/待遇），完成补位后自动恢复。
【营销福利规则】
1、打卡、任务所得抵现金禁止提现、退款、折现，仅可抵扣课程续费、升级、线下活动、学习物料。
2、拼团仅学习优惠，不产生任何奖励、学习圈收益，与分享体系完全隔离。
【终极公平规则】
多劳多得、无劳无获，所有学习圈收益依托持续帮扶与真实业绩产出，杜绝躺平挂名，保障所有参与者公平收益。`;
  const data = req.params.version === 'full' ? full : simple;
  res.json({ ok: true, data });
});

// ---------- 用户信息脱敏：凡返回前端的用户对象一律剔除敏感字段 ----------
function sanitizeUser(u) {
  if (!u) return u;
  const out = { ...u };
  delete out.password_hash;
  delete out.openid; // 微信 openid 属敏感标识，仅后端内部使用
  return out;
}

// ---------- 用户注册/登录（安全加固：手机号格式校验 + 必设密码 + 登录校验密码） ----------
// 注册防刷：同一手机号 60 秒内禁止重复注册（防止无短信验证码时被脚本批量灌号）
const regLock = new Map();
app.post('/api/auth/register', (req, res) => {
  const { phone, nickname, inviteCode, password } = req.body;
  if (!phone) return res.status(400).json({ ok: false, msg: '手机号必填' });
  if (!/^1[3-9]\d{9}$/.test(String(phone).trim())) return res.status(400).json({ ok: false, msg: '手机号格式不正确' });
  const ph = String(phone).trim();
  const lastReg = regLock.get(ph);
  if (lastReg && Date.now() - lastReg < 60000) {
    return res.status(429).json({ ok: false, msg: '操作过于频繁，请稍后再试' });
  }
  if (!password || String(password).length < 6) return res.status(400).json({ ok: false, msg: '请设置登录密码（至少6位）' });
  const existing = db.prepare('SELECT id FROM users WHERE phone=?').get(ph);
  if (existing) return res.status(400).json({ ok: false, msg: '该手机号已注册，请直接登录' });
  // 邀请码必填校验（PRD：无/无效邀请码 → 提示找管理员协助注册并展示联系方式）
  const rv = engine.requireInvite(inviteCode);
  if (!rv.ok) return res.status(400).json({ ok: false, msg: rv.err, needAdmin: true });
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare(`INSERT INTO users (phone, nickname, referrer_id, invite_code, identity, role, password_hash) VALUES (?,?,?,?,?,?,?)`)
    .run(ph, nickname || '学员', rv.inviter ? rv.inviter.id : null, engine.uniqueInviteCode(), 'learner', 'user', hash);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  // 初始化抵用券账户
  db.prepare(`INSERT INTO coupons (user_id, balance) VALUES (?,0)`).run(user.id);
  // 防刷窗口仅在注册成功后占用（注册失败的请求不占用，避免无密码时被误拦截）
  regLock.set(ph, Date.now());
  res.json({ ok: true, data: { token: auth.signUser(user), user: sanitizeUser(user) } });
});

app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone) return res.status(400).json({ ok: false, msg: '手机号必填' });
  const user = db.prepare('SELECT * FROM users WHERE phone=?').get(String(phone).trim());
  if (!user) return res.status(400).json({ ok: false, msg: '未注册，请先注册' });
  // 老账号（无密码哈希）不允许直接登录，需管理员重置密码
  if (!user.password_hash) return res.status(400).json({ ok: false, msg: '该账号未设置密码，请联系管理员重置密码后登录' });
  if (!password || !bcrypt.compareSync(String(password), user.password_hash))
    return res.status(400).json({ ok: false, msg: '密码错误' });
  res.json({ ok: true, data: { token: auth.signUser(user), user: sanitizeUser(user) } });
});

// ---------- 短信验证码登录（未设置密码的老账号 / 忘记密码的兜底登录，也可自动注册新账号） ----------
// 安全说明：验证码 5 分钟有效、60 秒才能重发、连续输错 5 次作废；生产环境建议加 IP 维度限流
const smsCodeStore = new Map(); // phone -> { code, exp, fail }，验证码条目（登录成功后即删除）
const smsSendLock = new Map();  // phone -> 最近发送时间，独立于验证码条目，防止登录成功后立即重刷短信
const SMS_TTL = 5 * 60 * 1000;
const SMS_RESEND_GAP = 60 * 1000;
const SMS_MAX_FAIL = 5;
function sendSms(phone, code) {
  // 模拟模式：打印到服务端日志；生产环境在此接入真实短信服务商（阿里云/腾讯云 SMS）并关闭 sms_mock_mode
  console.log(`[短信验证码] 手机号 ${phone} 的验证码：${code}（5分钟内有效。当前为模拟模式，未实际发送短信）`);
}
app.post('/api/auth/send-sms-code', (req, res) => {
  if (!getSettingNumE('sms_login_enabled', 1)) return res.status(400).json({ ok: false, msg: '短信登录未开启，请联系管理员' });
  const ph = String((req.body || {}).phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(ph)) return res.status(400).json({ ok: false, msg: '手机号格式不正确' });
  const lastSend = smsSendLock.get(ph);
  if (lastSend && Date.now() - lastSend < SMS_RESEND_GAP) {
    return res.status(429).json({ ok: false, msg: '验证码发送过于频繁，请稍后再试' });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  smsCodeStore.set(ph, { code, exp: Date.now() + SMS_TTL, fail: 0 });
  smsSendLock.set(ph, Date.now());
  sendSms(ph, code);
  const mock = !!getSettingNumE('sms_mock_mode', 1);
  // 模拟模式：验证码随响应返回（本地测试免看日志）；真实模式仅返回"已发送"
  res.json({ ok: true, msg: '验证码已发送', debugCode: mock ? code : undefined });
});
app.post('/api/auth/login-by-sms', (req, res) => {
  if (!getSettingNumE('sms_login_enabled', 1)) return res.status(400).json({ ok: false, msg: '短信登录未开启，请联系管理员' });
  const ph = String((req.body || {}).phone || '').trim();
  const code = String((req.body || {}).code || '').trim();
  const inviteCode = (req.body || {}).inviteCode || (req.body || {}).referrerId || null;
  const nickname = String((req.body || {}).nickname || '').trim();
  if (!/^1[3-9]\d{9}$/.test(ph)) return res.status(400).json({ ok: false, msg: '手机号格式不正确' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok: false, msg: '请输入6位数字验证码' });
  const item = smsCodeStore.get(ph);
  if (!item) return res.status(400).json({ ok: false, msg: '验证码不存在或已过期，请重新获取' });
  if (Date.now() > item.exp) { smsCodeStore.delete(ph); return res.status(400).json({ ok: false, msg: '验证码已过期，请重新获取' }); }
  if (item.fail >= SMS_MAX_FAIL) { smsCodeStore.delete(ph); return res.status(400).json({ ok: false, msg: '错误次数过多，请重新获取验证码' }); }
  if (item.code !== code) {
    item.fail += 1;
    return res.status(400).json({ ok: false, msg: '验证码错误' });
  }
  smsCodeStore.delete(ph);
  // 已注册 → 直接登录；未注册 → 自动注册为普通消费者（PRD：新注册必须填写有效邀请码）
  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(ph);
  if (!user) {
    const rv = engine.requireInvite(inviteCode);
    if (!rv.ok) return res.status(400).json({ ok: false, msg: rv.err, needAdmin: true });
    const info = db.prepare(`INSERT INTO users (phone, nickname, referrer_id, invite_code, identity, role) VALUES (?,?,?,?,?,?)`)
      .run(ph, nickname || ('学员' + ph.slice(-4)), rv.inviter ? rv.inviter.id : null, engine.uniqueInviteCode(), 'learner', 'user');
    user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    db.prepare(`INSERT INTO coupons (user_id, balance) VALUES (?,0)`).run(user.id);
  }
  engine.ensureInviteCode(user);
  res.json({ ok: true, data: { token: auth.signUser(user), user: sanitizeUser(user) } });
});

// 管理端：重置用户密码（老账号补设密码 / 用户忘记密码）
app.post('/api/admin/users/:id/reset-password', auth.authAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ ok: false, msg: '新密码至少6位' });
  const u = db.prepare('SELECT id FROM users WHERE id=?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ ok: false, msg: '用户不存在' });
  db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(bcrypt.hashSync(String(password), 10), u.id);
  res.json({ ok: true, msg: '密码已重置，用户可使用新密码登录' });
});

// ---------- 管理员登录（防暴力破解：按 IP 限流，连续失败锁定 10 分钟） ----------
const adminLoginFail = new Map(); // ip -> { fail, lockUntil }
function checkAdminLoginLock(ip) {
  const rec = adminLoginFail.get(ip);
  if (!rec) return null;
  if (rec.lockUntil && Date.now() < rec.lockUntil) {
    const remain = Math.ceil((rec.lockUntil - Date.now()) / 60000);
    return `尝试次数过多，账号已临时锁定，请 ${remain} 分钟后再试`;
  }
  if (rec.lockUntil && Date.now() >= rec.lockUntil) adminLoginFail.delete(ip);
  return null;
}
app.post('/api/admin/login', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const locked = checkAdminLoginLock(ip);
  if (locked) return res.status(429).json({ ok: false, msg: locked });
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin_auth WHERE username=?').get(username);
  if (!admin) {
    recordAdminLoginFail(ip);
    return res.status(400).json({ ok: false, msg: '账号不存在' });
  }
  if (!bcrypt.compareSync(password || '', admin.password_hash)) {
    recordAdminLoginFail(ip);
    return res.status(400).json({ ok: false, msg: '密码错误' });
  }
  adminLoginFail.delete(ip);
  res.json({ ok: true, data: { token: auth.signAdmin(admin) } });
});
function recordAdminLoginFail(ip) {
  const rec = adminLoginFail.get(ip) || { fail: 0, lockUntil: null };
  rec.fail += 1;
  if (rec.fail >= 5) {
    rec.lockUntil = Date.now() + 10 * 60 * 1000; // 锁定 10 分钟
    rec.fail = 0;
  }
  adminLoginFail.set(ip, rec);
}

// 修改管理员密码（登录后，须验证原密码；配合 db.js 首次创建逻辑，改密后重启不再被重置）
app.post('/api/admin/change-password', auth.authAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ ok: false, msg: '新密码至少6位' });
  }
  if (!bcrypt.compareSync(String(oldPassword), req.admin.password_hash)) {
    return res.status(400).json({ ok: false, msg: '原密码错误' });
  }
  db.prepare(`UPDATE admin_auth SET password_hash=? WHERE id=?`).run(bcrypt.hashSync(String(newPassword), 10), req.admin.id);
  res.json({ ok: true, msg: '密码已修改，请使用新密码重新登录' });
});

// ---------- 用户信息 ----------
app.get('/api/user/me', auth.authUser, (req, res) => {
  const u = sanitizeUser(req.user);
  const coupon = db.prepare('SELECT * FROM coupons WHERE user_id=?').get(u.id);
  const directCount = db.prepare(`SELECT COUNT(*) c FROM users WHERE referrer_id=?`).get(u.id).c;
  const trainees = db.prepare(`SELECT * FROM trainees WHERE leader_id=? AND in_pool=1`).all(u.id);
  res.json({ ok: true, data: { ...u, couponBalance: coupon?.balance || 0, totalEarned: coupon?.total_earned || 0, directCount, traineeCount: trainees.length } });
});

// ---------- 分享数据 ----------
app.get('/api/user/fission', auth.authUser, (req, res) => {
  const uid = req.user.id;
  const directCount = db.prepare(`SELECT COUNT(*) c FROM users WHERE referrer_id=?`).get(uid).c;
  // 转介绍人数（转介绍）
  const directIds = db.prepare(`SELECT id FROM users WHERE referrer_id=?`).all(uid).map(u => u.id);
  let secondCount = 0;
  if (directIds.length) {
    const marks = directIds.map(() => '?').join(',');
    secondCount = db.prepare(`SELECT COUNT(*) c FROM users WHERE referrer_id IN (${marks})`).get(...directIds).c;
  }
  // 学习圈总人数（递归简化：介绍 + 二级）
  const teamCount = directCount + secondCount;
  // 累计奖励（介绍奖已到账）
  const directEarned = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM direct_commissions WHERE referrer_id=? AND status='paid'`).get(uid).s;
  // 培育奖已发放
  const helpEarned = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM leader_allowances WHERE leader_id=?`).get(uid).s;
  // 关系链（介绍列表）
  const directList = db.prepare(`SELECT id, nickname, phone, is_paid, product_type, created_at FROM users WHERE referrer_id=? ORDER BY id DESC LIMIT 100`).all(uid);
  // 二级关系链
  let secondList = [];
  if (directIds.length) {
    const marks = directIds.map(() => '?').join(',');
    secondList = db.prepare(`SELECT id, nickname, is_paid, referrer_id FROM users WHERE referrer_id IN (${marks}) ORDER BY id DESC LIMIT 200`).all(...directIds);
  }
  res.json({ ok: true, data: { directCount, secondCount, teamCount, directEarned, helpEarned, totalEarned: directEarned + helpEarned, directList, secondList } });
});

// 分享排行榜（介绍人数Top）
app.get('/api/fission/rank', (req, res) => {
  const list = db.prepare(`SELECT u.id, u.nickname, (SELECT COUNT(*) FROM users c WHERE c.referrer_id=u.id) AS direct FROM users u ORDER BY direct DESC, u.id ASC LIMIT 20`).all();
  res.json({ ok: true, data: list });
});

// ---------- 升级为推广身份（需先付费，双用户体系隔离） ----------
app.post('/api/user/upgrade', auth.authUser, (req, res) => {
  const user = req.user;
  const { newReferrerId } = req.body || {};
  if (user.identity === 'promoter') return res.json({ ok: true, msg: '您已是创业推广身份' });
  if (!user.is_paid) return res.status(400).json({ ok: false, msg: '请先购买课程成为付费学员，方可升级为创业推广身份' });

  // 转绑定处理：介绍人为普通消费者时，分享系统无法运行，需换分享成员推荐人
  if (user.referrer_id) {
    const curReferrer = db.prepare('SELECT * FROM users WHERE id=?').get(user.referrer_id);
    const curIsFission = curReferrer && curReferrer.identity === 'promoter';
    if (!curIsFission) {
      if (newReferrerId) {
        const newRef = db.prepare('SELECT * FROM users WHERE id=?').get(Number(newReferrerId));
        if (!newRef || newRef.identity !== 'promoter' || newRef.is_paid !== 1) {
          return res.status(400).json({ ok: false, msg: '新推荐人无效：必须是已付费的分享系统成员' });
        }
        if (Number(newReferrerId) === user.id) {
          return res.status(400).json({ ok: false, msg: '不能选择自己作为推荐人' });
        }
        db.prepare(`UPDATE users SET referrer_id=? WHERE id=?`).run(newRef.id, user.id);
        // 记录用户端自助转绑日志
        logRebind({
          operator: (user.nickname || '学员') + '#' + user.id, operatorType: 'user',
          user, oldReferrer: curReferrer, newReferrer: newRef,
          action: 'rebind', note: '主动升级分享身份时自助转绑（原介绍人为普通消费者）',
        });
      } else {
        return res.status(400).json({
          ok: false, needRebind: true, msg: '您的介绍人是普通消费者，无法参与分享获得奖励。请选择：① 请介绍人升级为分享成员；② 填写一位分享系统成员的ID作为新推荐人'
        });
      }
    }
  }
  db.prepare(`UPDATE users SET identity='promoter' WHERE id=?`).run(user.id);
  res.json({ ok: true, msg: '已升级为创业推广身份，可参与推广与学习圈' });
});

// ---------- 开团/砍价发起单：先付款后激活活动 ----------
// 仅开通课程（成团/砍价成交后使用），不产生奖励、不改分享身份
function openCourseForOrder(order) {
  const productType = order.product_type;
  const expire = productType === '2999' ? null : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  db.prepare(`UPDATE users SET is_paid=1, product_type=?, paid_at=datetime('now','localtime'), expire_at=?, month_orders=month_orders+1, month_perf=month_perf+? WHERE id=?`)
    .run(productType, expire, order.amount, order.user_id);
  return { ok: true };
}
// 发起单支付成功：订单置已支付 + 激活活动（拼团 pending→opening，砍价 pending→active 并开始计时）
function settleStartOrder(order) {
  if (order.paid_at) return { already: true };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE orders SET status='paid', paid_at=datetime('now','localtime') WHERE id=?`).run(order.id);
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(order.order_no, 'paid', JSON.stringify({ amount: order.amount, biz: order.biz_type, biz_id: order.biz_id }));
    let bizMsg = '';
    if (order.biz_type === 'group_start') {
      db.prepare(`UPDATE group_orders SET status='opening' WHERE id=? AND status='pending'`).run(order.biz_id);
      bizMsg = '开团成功，可邀请好友参团';
    } else if (order.biz_type === 'bargain_start') {
      const hours = getSettingNumE('bargain_hours', 48);
      const expireAt = new Date(Date.now() + hours * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
      db.prepare(`UPDATE bargains SET status='active', expire_at=? WHERE id=? AND status='pending'`).run(expireAt, order.biz_id);
      bizMsg = '砍价已生效，可邀请好友帮砍';
    }
    db.exec('COMMIT');
    return { ok: true, bizMsg };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
}
// 发起单退款（活动未成功，预付金原路退回；事务保证状态+日志原子写入）
function refundStartOrder(order) {
  if (!order || order.status !== 'paid') return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare(`UPDATE orders SET status='refunded' WHERE id=? AND status='paid'`).run(order.id);
    if (r.changes === 0) { db.exec('ROLLBACK'); return false; }
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(order.order_no, 'refund', JSON.stringify({ reason: '活动未成功，预付金原路退回', amount: order.amount }));
    db.exec('COMMIT');
    return true;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
}

// ---------- 支付网关：公共结算（支付成功后的统一处理，幂等；mock立即执行 / 微信回调执行） ----------
function settlePaidOrder(order) {
  // 幂等保护：以 paid_at 为准（mock 模式新订单 status 直接是 'paid' 但 paid_at 为空，仍需结算）
  if (order.paid_at) return { already: true };
  // 财务风控双保险：放弃本单分享奖励的订单，强制不加入分享体系、不产生任何分享奖励
  // （拼团/砍价下单后端已强制 forgo_share_reward=1；此处防前端传参错误或恶意绕过）
  if (order.forgo_share_reward === 1) order.join_fission = 0;
  // 发起单（开团/砍价预付）不产奖励不开课，仅激活活动
  if (order.biz_type === 'group_start' || order.biz_type === 'bargain_start') {
    return settleStartOrder(order);
  }
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(order.user_id);
  if (!user) return { already: true };
  const useCoupon = order.coupon_used || 0;
  const productType = order.product_type;
  const pay = order.amount;

  // 安全加固：整个结算链路用事务包裹（扣券/状态/身份/名额/奖励/业绩），任何一步失败整体回滚
  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. 扣抵用券（原子扣减：余额不足时 changes=0 直接失败，杜绝透支）
    if (useCoupon > 0) {
      const rr = db.prepare(`UPDATE coupons SET balance=balance-? WHERE user_id=? AND balance>=?`).run(useCoupon, user.id, useCoupon);
      if (rr.changes === 0) throw new Error('抵用券余额不足，无法抵扣');
      const coupon = db.prepare('SELECT * FROM coupons WHERE user_id=?').get(user.id) || { balance: 0 };
      db.prepare(`INSERT INTO coupon_flows (user_id, change_amount, balance_after, type, remark) VALUES (?,?,?,?,?)`)
        .run(user.id, -useCoupon, coupon.balance, 'order', '课程抵扣');
    }

    // 2. 更新用户付费状态
    const expire = productType === '2999' ? null : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    db.prepare(`UPDATE users SET is_paid=1, product_type=?, paid_at=datetime('now','localtime'), expire_at=?, month_orders=month_orders+1, month_perf=month_perf+? WHERE id=?`)
      .run(productType, expire, pay, user.id);

    // 3. 分享身份判定（下单时已校验并暂存到订单，支付成功后执行）
    let fissionStatus = null;
    if (order.join_fission === 1) {
      if (order.new_referrer_id) {
        const newRef = db.prepare('SELECT * FROM users WHERE id=?').get(order.new_referrer_id);
        const oldReferrer = user.referrer_id ? db.prepare('SELECT * FROM users WHERE id=?').get(user.referrer_id) : null;
        // 转绑目标必须是"已付费的分享成员"，防止把介绍人绑给未付费的挂名 promoter
        if (newRef && newRef.identity === 'promoter' && newRef.is_paid === 1) {
          db.prepare(`UPDATE users SET referrer_id=? WHERE id=?`).run(newRef.id, user.id);
          logRebind({
            operator: (user.nickname || '学员') + '#' + user.id, operatorType: 'user',
            user, oldReferrer, newReferrer: newRef,
            action: 'rebind', note: '购买升级时自助转绑（原介绍人为普通消费者）',
          });
          fissionStatus = { action: 'rebind', msg: '已与原普通消费者介绍人解绑，绑定新的分享成员推荐人' };
        }
      }
      db.prepare(`UPDATE users SET identity='promoter' WHERE id=?`).run(user.id);
      if (!fissionStatus) fissionStatus = { action: 'joined', msg: '已加入分享系统，成为分享有奖客户' };
    } else {
      db.prepare(`UPDATE users SET identity='learner' WHERE id=?`).run(user.id);
    }

    // 4. 标记订单已支付 + 留痕
    db.prepare(`UPDATE orders SET status='paid', paid_at=datetime('now','localtime') WHERE id=?`).run(order.id);
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'paid', JSON.stringify({ amount: pay }));

    // 5. 成交后：把用户计入其推荐人的考核名额 + 发介绍奖 + 计入管培生业绩
    // 拼团优惠单/放弃分享奖励单保持分享隔离（审计要求）：不产生介绍奖励/培育奖/考核名额/分享业绩，
    // 防止拼团价刷单套利、防止"打折还发高额奖励"亏损场景
    const updatedUser = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
    let slotRes = null, comm = null, perfRes = null;
    if (!order.group_id && order.forgo_share_reward !== 1) {
      slotRes = engine.assignTraineeSlot(updatedUser);
      // 新增：触发"未完成留给介绍人名额，禁止开启自己学习圈"拦截时，提示透传给前端展示
      if (slotRes && slotRes.ok === false && slotRes.locked === true) {
        if (fissionStatus) fissionStatus.msg += '；' + slotRes.msg;
        else fissionStatus = { action: 'locked', msg: slotRes.msg };
      }
      comm = engine.settleDirectCommission(order);
      // 5.1 管培生业绩入账（买家自购 + 推荐人介绍各计一次，月度考核/待遇据此判定）
      perfRes = engine.creditTraineePerf(order);
    }

    db.exec('COMMIT');
    return { fissionStatus, slotRes, directCommission: comm, perfRes };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
}

// ---------- 下单购买（支付网关双模式） ----------
// joinFission: 购买≥499时用户选择 "分享有奖"(true,加入分享系统) / "暂不参与"(false,普通消费者)
// 分享身份判定：identity='promoter' 为分享系统成员(分享有奖)，identity='learner' 为普通消费者
// 支付流程：
//   mock 模式（默认）：下单即支付，立即结算，演示/验收无感知
//   wxpay 模式：创建待支付订单 → 微信统一下单 → 返回 payParams（前端 wx.requestPayment）
//               → 微信回调 /api/pay/notify 验签解密 → settlePaidOrder 结算
app.post('/api/order', auth.authUser, (req, res) => {
  const { productType, couponUsed, joinFission, newReferrerId, groupId, courseId, forgoShareReward } = req.body;
  const user = req.user;
  const price = getSettingNumE('price_' + productType, 499);
  // 财务风控：拼团价订单（groupId 存在）一律强制放弃本单分享奖励，不采信前端参数，防止"折扣价+分享奖励"套利
  const forgoShareRewardFlag = (groupId || forgoShareReward === true || forgoShareReward === 1 || forgoShareReward === '1' || forgoShareReward === 'true') ? 1 : 0;
  // 拼团优惠：成团后成员可享拼团价购课（抵扣 courses.group_discount 元）
  let groupDiscount = 0;
  if (groupId) {
    const gp = db.prepare(`SELECT g.*, c.group_discount FROM group_orders g LEFT JOIN courses c ON c.id=g.course_id WHERE g.id=?`).get(Number(groupId));
    if (!gp) return res.status(400).json({ ok: false, msg: '拼团不存在' });
    if (gp.status !== 'success') return res.status(400).json({ ok: false, msg: '拼团未成团，暂无法享受拼团价' });
    const member = db.prepare(`SELECT id FROM group_members WHERE group_id=? AND user_id=?`).get(Number(groupId), user.id);
    if (!member) return res.status(400).json({ ok: false, msg: '您不是该拼团的成员' });
    // 分档拼团：按本团档位价结算（tier_price），未启用分档则退回 courses.group_discount 固定抵扣
    if (gp.tier_price != null) {
      groupDiscount = Math.max(0, price - Number(gp.tier_price));
    } else {
      groupDiscount = Math.floor(Number(gp.group_discount) || 0);
    }
  }
  const coupon = db.prepare('SELECT * FROM coupons WHERE user_id=?').get(user.id);
  let useCoupon = Math.min(couponUsed || 0, coupon?.balance || 0, Math.max(0, price - groupDiscount));
  const pay = Math.max(0, price - groupDiscount - useCoupon);

  // 分享加入：下单时立即校验转绑条件（提示 needRebind），支付成功后执行绑定
  const isJoin = joinFission === true || joinFission === 'true' || joinFission === 1;
  if (isJoin && user.referrer_id) {
    const curReferrer = db.prepare('SELECT * FROM users WHERE id=?').get(user.referrer_id);
    const curIsFission = curReferrer && curReferrer.identity === 'promoter';
    if (!curIsFission) {
      if (newReferrerId) {
        const newRef = db.prepare('SELECT * FROM users WHERE id=?').get(Number(newReferrerId));
        if (!newRef || newRef.identity !== 'promoter') {
          return res.status(400).json({ ok: false, msg: '新推荐人无效或非分享系统成员，请填写分享系统成员ID' });
        }
        if (Number(newReferrerId) === user.id) {
          return res.status(400).json({ ok: false, msg: '不能选择自己作为推荐人' });
        }
      } else {
        return res.status(400).json({
          ok: false, needRebind: true, msg: '您的介绍人是普通消费者，无法参与分享获得奖励。请选择：① 请介绍人升级为分享成员；② 填写一位分享系统成员的ID作为新推荐人'
        });
      }
    }
  }

  const mode = wxpay.getPayMode();
  const orderNo = 'HM' + Date.now() + Math.floor(Math.random() * 1000);
  const info = db.prepare(`INSERT INTO orders (order_no, user_id, product_type, amount, coupon_used, referrer_id, status, join_fission, forgo_share_reward, new_referrer_id, group_id, group_discount, course_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(orderNo, user.id, productType, pay, useCoupon, user.referrer_id, mode === 'mock' ? 'paid' : 'pending', isJoin ? 1 : 0, forgoShareRewardFlag, newReferrerId ? Number(newReferrerId) : null, groupId ? Number(groupId) : null, groupDiscount, courseId ? Number(courseId) : null);
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(orderNo, 'create', JSON.stringify({ mode, price, pay, useCoupon, joinFission: isJoin, forgoShareReward: forgoShareRewardFlag, newReferrerId: newReferrerId ? Number(newReferrerId) : null, groupId: groupId ? Number(groupId) : null, groupDiscount }));

  // 模拟支付模式：下单即支付，立即结算
  if (mode === 'mock') {
    const result = settlePaidOrder(order);
    res.json({ ok: true, data: { order, pay, couponUsed: useCoupon, ...result } });
    return;
  }

  // 线下确认收款模式（默认）：下单后展示收款码，客户线下转账，后台确认已收款后才执行开通/奖励/名额结算
  if (mode === 'manual') {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'manual_pending', JSON.stringify({ msg: '等待后台确认收款', pay }));
    res.json({
      ok: true,
      data: { order, pay, couponUsed: useCoupon, payMode: 'manual', receiveInfo: getReceiveInfo() },
      msg: '订单已提交，请按下方收款码完成转账，管理员确认到账后自动开通',
    });
    return;
  }

  // 微信支付模式：统一下单，返回调起支付参数
  (async () => {
    try {
      if (!user.openid) throw new Error('请先通过微信登录授权（wx.login）后再下单支付');
      const wxRes = await wxpay.createJsapiOrder({
        outTradeNo: order.order_no,
        description: '翰墨书院·课程档位' + productType,
        amount: pay,
        openid: user.openid,
      });
      const payParams = wxpay.buildJsapiPayParams(wxRes.prepay_id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'prepay', JSON.stringify({ prepay_id: wxRes.prepay_id, trade_type: wxRes.trade_type }));
      res.json({ ok: true, data: { order, pay, couponUsed: useCoupon, payMode: 'wxpay', payParams, prepayId: wxRes.prepay_id } });
    } catch (e) {
      // 下单失败：关闭订单，避免脏数据
      db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'error', e.message);
      res.status(400).json({ ok: false, msg: e.message });
    }
  })();
});

// ---------- 微信小程序登录（wx.login code 换 openid，绑定到当前账号） ----------
app.post('/api/wx/session', auth.authUser, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, msg: '缺少 wx.login code' });
  try {
    const s = await wxpay.code2Session(code);
    db.prepare(`UPDATE users SET openid=? WHERE id=?`).run(s.openid, req.user.id);
    res.json({ ok: true, msg: '微信已绑定', openid: s.openid });
  } catch (e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

// ---------- 公众号网页授权登录（登录页"微信登录"入口） ----------
// 流程：微信登录 → 微信授权 → 回调换 openid → 一次性短码 → 前端换 token；
//       已绑定 openid 的用户直接登录；未绑定的引导填手机号+验证码绑定/注册。
const wxOAuthStore = new Map(); // 一次性短码 -> { openid, exp }（5分钟有效）
const wxOAuthState = new Map(); // 授权 state -> { exp }（10分钟有效）

function wxOAuthEnabled() {
  return !!(getSettingNumE('wx_oauth_appid', '') && getSettingNumE('wx_oauth_secret', ''));
}

// 1) 生成微信授权跳转地址
app.get('/api/auth/wechat-login', (req, res) => {
  const appid = getSettingNumE('wx_oauth_appid', '');
  if (!wxOAuthEnabled()) return res.status(400).json({ ok: false, msg: '微信登录未开启，请联系管理员配置' });
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  wxOAuthState.set(state, { exp: Date.now() + 10 * 60 * 1000 });
  const redirect = `${req.protocol}://${req.get('host')}/api/auth/wechat-callback`;
  const url = 'https://open.weixin.qq.com/connect/oauth2/authorize'
    + '?appid=' + encodeURIComponent(appid)
    + '&redirect_uri=' + encodeURIComponent(redirect)
    + '&response_type=code&scope=snsapi_base'
    + '&state=' + encodeURIComponent(state) + '#wechat_redirect';
  res.redirect(url);
});

// 2) 微信授权回调：code 换 openid → 生成一次性短码 → 302 回前端登录页
app.get('/api/auth/wechat-callback', async (req, res) => {
  const st = wxOAuthState.get(String(req.query.state || ''));
  if (!st || Date.now() > st.exp) return res.redirect('/#/login?wx_err=1');
  wxOAuthState.delete(String(req.query.state));
  let openid = '';
  if (process.env.NODE_ENV === 'test' && req.query.test_openid) {
    openid = String(req.query.test_openid); // 仅测试环境：绕过真实微信授权
  } else {
    const appid = getSettingNumE('wx_oauth_appid', '');
    const secret = getSettingNumE('wx_oauth_secret', '');
    if (!appid || !secret) return res.redirect('/#/login?wx_err=1');
    try {
      const r = await fetch('https://api.weixin.qq.com/sns/oauth2/access_token'
        + '?appid=' + encodeURIComponent(appid)
        + '&secret=' + encodeURIComponent(secret)
        + '&code=' + encodeURIComponent(String(req.query.code || ''))
        + '&grant_type=authorization_code');
      const d = await r.json();
      if (!d.openid) return res.redirect('/#/login?wx_err=1');
      openid = d.openid;
    } catch (e) { return res.redirect('/#/login?wx_err=1'); }
  }
  const shortCode = Math.random().toString(36).slice(2) + Date.now().toString(36);
  wxOAuthStore.set(shortCode, { openid, exp: Date.now() + 5 * 60 * 1000 });
  // 回跳前端登录页（history 路由为 /login?wx=xxx；跨域部署请配置 wx_oauth_redirect 完整地址）
  const home = getSettingNumE('wx_oauth_redirect', '') || '/login';
  res.redirect(home + (home.includes('?') ? '&' : '?') + 'wx=' + shortCode);
});

// 3) 前端用短码换登录态（已绑定 → 直接登录；未绑定 → needBind）
app.post('/api/auth/wechat-login', (req, res) => {
  const wxCode = String((req.body || {}).wxCode || '');
  const item = wxOAuthStore.get(wxCode);
  if (!item || Date.now() > item.exp) return res.status(400).json({ ok: false, msg: '微信登录已过期，请重新发起' });
  const user = db.prepare('SELECT * FROM users WHERE openid=?').get(item.openid);
  if (!user) return res.json({ ok: true, data: { needBind: true, wxCode } });
  wxOAuthStore.delete(wxCode);
  engine.ensureInviteCode(user);
  res.json({ ok: true, data: { token: auth.signUser(user), user: sanitizeUser(user) } });
});

// 4) 首次微信登录：手机号+短信验证码绑定/注册后登录（可同时设置密码）
app.post('/api/auth/wechat-bind', (req, res) => {
  const wxCode = String((req.body || {}).wxCode || '');
  const item = wxOAuthStore.get(wxCode);
  if (!item || Date.now() > item.exp) return res.status(400).json({ ok: false, msg: '微信登录已过期，请重新发起' });
  const ph = String((req.body || {}).phone || '').trim();
  const code = String((req.body || {}).code || '').trim();
  const password = String((req.body || {}).password || '').trim();
  const nickname = String((req.body || {}).nickname || '').trim();
  const inviteCode = (req.body || {}).inviteCode || (req.body || {}).referrerId || null;
  if (!/^1[3-9]\d{9}$/.test(ph)) return res.status(400).json({ ok: false, msg: '手机号格式不正确' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ ok: false, msg: '请输入6位数字验证码' });
  if (password && String(password).length < 6) return res.status(400).json({ ok: false, msg: '密码至少6位' });
  const smsItem = smsCodeStore.get(ph);
  if (!smsItem || Date.now() > smsItem.exp || smsItem.code !== code) {
    return res.status(400).json({ ok: false, msg: '验证码错误或已过期，请重新获取' });
  }
  smsCodeStore.delete(ph);
  wxOAuthStore.delete(wxCode);
  let user = db.prepare('SELECT * FROM users WHERE phone=?').get(ph);
  if (!user) {
    // 新手机号自动创建账号：按 PRD 必须填写有效邀请码
    const rv = engine.requireInvite(inviteCode);
    if (!rv.ok) return res.status(400).json({ ok: false, msg: rv.err, needAdmin: true });
    const hash = password ? bcrypt.hashSync(password, 10) : null;
    const info = db.prepare(`INSERT INTO users (phone, nickname, referrer_id, invite_code, identity, role, openid, password_hash) VALUES (?,?,?,?,?,?,?,?)`)
      .run(ph, nickname || ('学员' + ph.slice(-4)), rv.inviter ? rv.inviter.id : null, engine.uniqueInviteCode(), 'learner', 'user', item.openid, hash);
    user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    db.prepare(`INSERT INTO coupons (user_id, balance) VALUES (?,0)`).run(user.id);
  } else {
    db.prepare(`UPDATE users SET openid=? WHERE id=?`).run(item.openid, user.id);
  }
  engine.ensureInviteCode(user);
  res.json({ ok: true, data: { token: auth.signUser(user), user: sanitizeUser(user) } });
});

// ---------- 支付回调（微信服务器 → 本服务；验签+解密后结算，幂等） ----------
app.post('/api/pay/notify', async (req, res) => {
  const rawBody = req.rawBody || JSON.stringify(req.body);
  // 1. 验签（V3：时间戳+随机串+原始报文，用微信平台证书公钥）
  const v = wxpay.verifyNotifySignature(req.headers, rawBody);
  if (!v.ok) {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(null, 'notify', JSON.stringify({ verify: 'fail', msg: v.msg, serial: req.headers['wechatpay-serial'] }));
    return res.status(400).json({ code: 'FAIL', message: v.msg });
  }
  // 2. 解密 resource（AES-256-GCM）
  let decrypted;
  try {
    decrypted = wxpay.decryptResource(req.body.resource);
  } catch (e) {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(null, 'notify', JSON.stringify({ verify: 'decrypt-fail', msg: e.message }));
    return res.status(400).json({ code: 'FAIL', message: e.message });
  }
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
    .run(decrypted.out_trade_no || null, 'notify', rawBody.slice(0, 2000));
  // 3. 找到订单，校验并结算
  const order = db.prepare(`SELECT * FROM orders WHERE order_no=?`).get(decrypted.out_trade_no);
  if (!order) return res.json({ code: 'SUCCESS', message: '订单不存在，忽略' }); // 始终返回成功，避免微信重试风暴
  if (decrypted.trade_state !== 'SUCCESS') return res.json({ code: 'SUCCESS', message: '非成功交易，忽略' });
  // 金额校验：微信返回单位是【分】，必须整数精确比较（禁止 Math.round 引入一分钱误差）
  if (Number(decrypted.amount?.total) !== order.amount * 100) {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(order.order_no, 'error', '金额校验失败: ' + JSON.stringify(decrypted.amount));
    return res.status(400).json({ code: 'FAIL', message: '金额校验失败' });
  }
  if (decrypted.transaction_id) {
    db.prepare(`UPDATE orders SET wx_transaction_id=? WHERE id=?`).run(decrypted.transaction_id, order.id);
  }
  // 结算链路本身有事务 + 幂等保护（paid_at 已存在直接跳过），但异常需记录并返回失败，让微信稍后重试
  try {
    settlePaidOrder(order);
    return res.json({ code: 'SUCCESS', message: 'ok' });
  } catch (e) {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(order.order_no, 'settle_error', e.message + '\n' + (e.stack || ''));
    return res.status(500).json({ code: 'FAIL', message: '结算失败，稍后重试' });
  }
});

// ---------- 支付配置（公开：前端据此决定支付交互方式） ----------
app.get('/api/pay/config', (req, res) => {
  res.json({ ok: true, data: { mode: wxpay.getPayMode(), configured: wxpay.isConfigured() } });
});

// ---------- 线下收款信息（manual 模式展示给客户的收款码/账号；登录后可见） ----------
function getReceiveInfo() {
  const get = (k) => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
    if (!row) return '';
    try { return String(JSON.parse(row.value).v || ''); } catch (e) { return ''; }
  };
  return {
    wechatQr: get('pay_receive_wechat_qr'),
    wechatAccount: get('pay_receive_wechat_account'),
    alipayQr: get('pay_receive_alipay_qr'),
    alipayAccount: get('pay_receive_alipay_account'),
    bankName: get('pay_receive_bank_name'),
    bankAccount: get('pay_receive_bank_account'),
    bankHolder: get('pay_receive_bank_holder'),
    notice: get('pay_receive_notice'),
  };
}
app.get('/api/pay/receive-info', auth.authUser, (req, res) => {
  res.json({ ok: true, data: getReceiveInfo() });
});

// ---------- 订单状态查询（支付后前端轮询确认） ----------
app.get('/api/order/:orderNo', auth.authUser, (req, res) => {
  const order = db.prepare(`SELECT * FROM orders WHERE order_no=? AND user_id=?`).get(req.params.orderNo, req.user.id);
  if (!order) return res.status(404).json({ ok: false, msg: '订单不存在' });
  res.json({ ok: true, data: order });
});

// ---------- 我的订单列表（用户端，含待确认收款订单） ----------
app.get('/api/order/my', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT o.*, COALESCE(gc.title, c.title) AS course_title FROM orders o LEFT JOIN group_orders g ON g.id=o.group_id LEFT JOIN courses gc ON gc.id=g.course_id LEFT JOIN courses c ON c.level=o.product_type WHERE o.user_id=? ORDER BY o.id DESC LIMIT 50`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 关闭待支付订单 ----------
app.post('/api/order/:orderNo/close', auth.authUser, (req, res) => {
  const order = db.prepare(`SELECT * FROM orders WHERE order_no=? AND user_id=?`).get(req.params.orderNo, req.user.id);
  if (!order) return res.status(404).json({ ok: false, msg: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ ok: false, msg: '仅待支付订单可关闭' });
  db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'close', '用户关闭');
  res.json({ ok: true, msg: '订单已关闭' });
});

// ---------- 抵用券/奖励明细 ----------
app.get('/api/user/coupon-flows', auth.authUser, (req, res) => {
  const flows = db.prepare(`SELECT * FROM coupon_flows WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  res.json({ ok: true, data: flows });
});

// ---------- 介绍奖励明细 ----------
app.get('/api/user/commissions', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM direct_commissions WHERE referrer_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 培育奖进度 ----------
app.get('/api/user/help-rewards', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM help_rewards WHERE mentor_id=?`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 管培生状态/学习圈 ----------
// 返回两类：leader_id=我(我推荐的名额，含留给介绍人留店的，我负责补位) 或 helper_id=我(我帮扶的学习圈成员，我拿培育奖)
// 附加返回：每个名额的滚动考核期剩余时间(cycle_end_at / cycle_remaining_days) + 留店进度(slotProgress, N/2)
app.get('/api/user/trainees', auth.authUser, (req, res) => {
  // 带出帮扶主理人/介绍人昵称，供"谁归我管、谁归好友的介绍人管"展示（PRD 3.2.10）
  const list = db.prepare(`SELECT t.*, u.nickname, u.phone, hu.nickname AS helper_nickname, lu.nickname AS leader_nickname
    FROM trainees t
    LEFT JOIN users u ON u.id=t.user_id
    LEFT JOIN users hu ON hu.id=t.helper_id
    LEFT JOIN users lu ON lu.id=t.leader_id
    WHERE (t.leader_id=? OR t.helper_id=?) AND t.in_pool=1 ORDER BY t.id DESC`).all(req.user.id, req.user.id);

  // 滚动考核期：join_at 为真实入职起点，每 trainee_cycle_days 天一轮；当前周期 = 第(finished_cycle+1)轮
  const cycleDays = getSettingNumE('trainee_cycle_days', 30) || 30;
  const cycleMs = cycleDays * 24 * 3600 * 1000;
  const nowMs = Date.now();
  const fmtDay = dt => { const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0'); return `${y}-${m}-${d}` };
  for (const t of list) {
    const joinMs = new Date(String(t.join_at || '').replace(' ', 'T')).getTime();
    const hasJoin = !!joinMs;
    const fc = t.finished_cycle || 0;
    const cycleEndMs = hasJoin ? joinMs + (fc + 1) * cycleMs : 0;
    t.cycle_end_at = hasJoin ? fmtDay(new Date(cycleEndMs)) : null;
    t.cycle_remaining_days = hasJoin ? Math.max(0, Math.ceil((cycleEndMs - nowMs) / 86400000)) : null;
  }

  // 留店进度：我给介绍人留下的有效名额数 / 要求名额(slot_limit)，口径与 engine.assignTraineeSlot 一致
  const slotLimit = getSettingNumE('slot_limit', 2) || 2;
  const kept = db.prepare(`SELECT COUNT(*) c FROM trainees WHERE leader_id=? AND slot_no<=? AND in_pool=1 AND slot_status='normal'`).get(req.user.id, slotLimit).c;
  const slotProgress = { slotLimit, kept, need: Math.max(0, slotLimit - kept), unlocked: kept >= slotLimit };

  res.json({ ok: true, data: list, slotProgress });
});

// ---------- 主理人补位（用户端自发起） ----------
// 修复：原来只传 traineeId 缺新学员参数导致必失败；现支持传 newUserId(学员ID) 或 phone(手机号)
app.post('/api/user/fill-reserve', auth.authUser, (req, res) => {
  const { traineeId, newUserId, phone } = req.body;
  const t = db.prepare(`SELECT * FROM trainees WHERE id=?`).get(Number(traineeId));
  if (!t || t.leader_id !== req.user.id) return res.status(403).json({ ok: false, msg: '无权限操作该名额' });
  let nid = newUserId ? Number(newUserId) : null;
  if (!nid && phone) {
    const u = db.prepare(`SELECT id FROM users WHERE phone=?`).get(String(phone).trim());
    nid = u ? u.id : null;
    if (!nid) return res.json({ ok: false, msg: '未找到该手机号对应的学员' });
  }
  const r = engine.fillReserve(traineeId, nid);
  res.json(r);
});

// ---------- 主理人待遇明细 ----------
app.get('/api/user/allowances', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM leader_allowances WHERE leader_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 钱包与提现（奖励收益可提现；抵用券禁提现） ----------
function userEarned(userId) {
  const direct = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM direct_commissions WHERE referrer_id=? AND status='paid'`).get(userId).s;
  const allowance = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM leader_allowances WHERE leader_id=? AND status='paid'`).get(userId).s;
  const helpReward = getSettingNumE('help_reward', 200);
  // 培育奖按组统计：每名推荐人的前 slot_limit 名名额全部孵化合格 = 1组（去重 referrer_id，组数×200）
  const helpGroups = db.prepare(`SELECT COUNT(DISTINCT referrer_id) c FROM help_rewards WHERE mentor_id=? AND status='paid'`).get(userId).c;
  const help = helpGroups * helpReward;
  // 主理人培育奖：名下管培生每介绍1名付费分享学员得200
  const helpBonus = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM help_bonuses WHERE mentor_id=? AND status='paid'`).get(userId).s;
  return { direct, allowance, help, helpBonus, total: direct + allowance + help + helpBonus };
}
app.get('/api/user/wallet', auth.authUser, (req, res) => {
  const uid = req.user.id;
  const earned = userEarned(uid);
  const applied = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM withdrawals WHERE user_id=? AND status IN ('pending','approved')`).get(uid).s;
  const withdrawn = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM withdrawals WHERE user_id=? AND status='paid'`).get(uid).s;
  const minWithdraw = getSettingNumE('withdraw_min', 100);
  // 强约束：主理人名下有"冻结待补位"名额 → 收入冻结，不可提现（补位完成后自动解冻）
  const frozen = engine.hasPendingReserve(uid);
  const freezeMsg = frozen ? '您有待补位名额未完成，奖励收益已冻结，完成补位后自动恢复可提现。' : '';
  res.json({ ok: true, data: { withdrawable: frozen ? 0 : Math.max(0, earned.total - applied - withdrawn), applied, withdrawn, breakdown: earned, minWithdraw, frozen, freezeMsg } });
});
app.post('/api/user/withdraw', auth.authUser, (req, res) => {
  const uid = req.user.id;
  const { amount, payType, account, realName } = req.body;
  const a = Math.floor(Number(amount));
  if (!a || a <= 0) return res.status(400).json({ ok: false, msg: '请输入有效金额' });
  if (!payType) return res.status(400).json({ ok: false, msg: '请选择收款方式' });
  if (!account || !realName) return res.status(400).json({ ok: false, msg: '请填写收款账号与收款人姓名' });
  const minWithdraw = getSettingNumE('withdraw_min', 100);
  if (a < minWithdraw) return res.status(400).json({ ok: false, msg: `单笔提现最低 ${minWithdraw} 元` });
  // 强约束：有待补位名额 → 收入冻结，禁止提现
  if (engine.hasPendingReserve(uid)) {
    return res.status(400).json({ ok: false, msg: '您有待补位名额未完成，收入已冻结，完成补位后自动恢复可提现。' });
  }
  // 事务包裹：校验余额与插入申请原子执行，防止并发超额提现
  db.exec('BEGIN IMMEDIATE');
  try {
    const earned = userEarned(uid);
    const applied = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM withdrawals WHERE user_id=? AND status IN ('pending','approved')`).get(uid).s;
    const withdrawn = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM withdrawals WHERE user_id=? AND status='paid'`).get(uid).s;
    const avail = earned.total - applied - withdrawn;
    if (a > avail) {
      db.exec('ROLLBACK');
      return res.status(400).json({ ok: false, msg: `可提现余额不足（当前 ¥${avail}）` });
    }
    db.prepare(`INSERT INTO withdrawals (user_id, amount, pay_type, account, real_name) VALUES (?,?,?,?,?)`).run(uid, a, payType, account, realName);
    db.exec('COMMIT');
    res.json({ ok: true, msg: '提现申请已提交，等待财务审核' });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
});
app.get('/api/user/withdrawals', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 免费体验课预约 ----------
app.post('/api/trial/book', auth.authUser, (req, res) => {
  const { name, ageGroup, subject, mode, preferTime } = req.body;
  const phone = req.body.phone || req.user.phone;
  if (!subject) return res.status(400).json({ ok: false, msg: '请选择体验科目' });
  // 预约必填邀请码（PRD：无/无效邀请码 → 找管理员协助注册）；未注册用户先注册（注册时已绑定）
  const rv = engine.requireInvite(req.body.inviteCode);
  if (!rv.ok) return res.status(400).json({ ok: false, msg: rv.err, needAdmin: true });
  // 预约同时补齐邀请绑定：已登录但从未绑定介绍人的用户，按填写的邀请码建立归属
  let finalReferrer = req.user.referrer_id;
  if (rv.inviter && rv.inviter.id !== req.user.id && !req.user.referrer_id) {
    db.prepare(`UPDATE users SET referrer_id=? WHERE id=?`).run(rv.inviter.id, req.user.id);
    finalReferrer = rv.inviter.id;
  }
  db.prepare(`INSERT INTO trial_lessons (user_id, name, phone, age_group, subject, mode, prefer_time, referrer_id) VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.user.id, name || req.user.nickname, phone, ageGroup || 'child', subject, mode || 'online', preferTime || '', finalReferrer);
  res.json({ ok: true, msg: '预约成功！我们已收到您的体验课预约，客服将尽快与您联系。' });
});
app.get('/api/trial/my', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM trial_lessons WHERE user_id=? ORDER BY id DESC`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 广告（公开，按位置） ----------
app.get('/api/ads', (req, res) => {
  const pos = req.query.position || 'home_bottom';
  const list = db.prepare(`SELECT * FROM ads WHERE status='on' AND position=? ORDER BY sort, id`).all(pos);
  res.json({ ok: true, data: list });
});
// 管理端广告 CRUD
app.get('/api/admin/ads', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT * FROM ads ORDER BY position, sort, id`).all();
  res.json({ ok: true, data: list });
});
app.post('/api/admin/ads', auth.authAdmin, (req, res) => {
  const b = req.body;
  if (!b.title) return res.status(400).json({ ok: false, msg: '标题必填' });
  const r = db.prepare(`INSERT INTO ads (title, image, link, position, sort, status) VALUES (?,?,?,?,?,?)`)
    .run(b.title, b.image || null, b.link || null, b.position || 'home_bottom', b.sort || 0, b.status || 'on');
  res.json({ ok: true, msg: '广告已添加', id: r.lastInsertRowid });
});
app.post('/api/admin/ads/:id', auth.authAdmin, (req, res) => {
  const b = req.body;
  db.prepare(`UPDATE ads SET title=?, image=?, link=?, position=?, sort=?, status=? WHERE id=?`)
    .run(b.title, b.image, b.link, b.position, b.sort, b.status, Number(req.params.id));
  res.json({ ok: true, msg: '广告已更新' });
});
app.post('/api/admin/ads/:id/delete', auth.authAdmin, (req, res) => {
  db.prepare(`DELETE FROM ads WHERE id=?`).run(Number(req.params.id));
  res.json({ ok: true, msg: '广告已删除' });
});

// ---------- 公司介绍（公开） ----------
app.get('/api/company', (req, res) => {
  const info = db.prepare(`SELECT * FROM company_intro ORDER BY id DESC LIMIT 1`).get();
  res.json({ ok: true, data: info });
});

// ---------- 管理端：公司介绍读写 ----------
app.get('/api/admin/company', auth.authAdmin, (req, res) => {
  const info = db.prepare(`SELECT * FROM company_intro ORDER BY id DESC LIMIT 1`).get();
  res.json({ ok: true, data: info });
});
app.post('/api/admin/company', auth.authAdmin, (req, res) => {
  const { title, content } = req.body;
  const existing = db.prepare(`SELECT id FROM company_intro ORDER BY id DESC LIMIT 1`).get();
  const cleanContent = sanitizeHtml(String(content || ''));
  if (existing) {
    db.prepare(`UPDATE company_intro SET title=?, content=?, updated_at=datetime('now','localtime') WHERE id=?`).run(title || '为什么选择我们', cleanContent, existing.id);
  } else {
    db.prepare(`INSERT INTO company_intro (title, content) VALUES (?,?)`).run(title || '为什么选择我们', cleanContent);
  }
  res.json({ ok: true, msg: '公司介绍已保存' });
});

// ---------- 体验课可选科目/时段（公开） ----------
function getSettingArr(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return [];
  try { const v = JSON.parse(row.value).v; return Array.isArray(v) ? v : [v]; } catch (e) { return []; }
}
app.get('/api/trial/options', (req, res) => {
  res.json({ ok: true, data: { subjects: getSettingArr('trial_subjects'), slots: getSettingArr('trial_slots') } });
});

// ---------- 管理端：体验课预约列表/统计/处理 ----------
app.get('/api/admin/trials', auth.authAdmin, (req, res) => {
  const status = req.query.status;
  let sql = `SELECT t.*, u.nickname AS user_nickname FROM trial_lessons t LEFT JOIN users u ON u.id=t.user_id`;
  const params = [];
  if (status && status !== 'all') { sql += ` WHERE t.status=?`; params.push(status); }
  sql += ` ORDER BY t.id DESC LIMIT 300`;
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});

app.get('/api/admin/trial-stats', auth.authAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM trial_lessons').get().c;
  const online = db.prepare(`SELECT COUNT(*) c FROM trial_lessons WHERE mode='online'`).get().c;
  const offline = db.prepare(`SELECT COUNT(*) c FROM trial_lessons WHERE mode='offline'`).get().c;
  const booked = db.prepare(`SELECT COUNT(*) c FROM trial_lessons WHERE status='booked'`).get().c;
  const contacted = db.prepare(`SELECT COUNT(*) c FROM trial_lessons WHERE status='contacted'`).get().c;
  const finished = db.prepare(`SELECT COUNT(*) c FROM trial_lessons WHERE status='finished'`).get().c;
  // 按科目统计
  const bySubject = db.prepare(`SELECT subject, COUNT(*) c FROM trial_lessons WHERE subject IS NOT NULL GROUP BY subject`).all();
  const byAge = db.prepare(`SELECT age_group, COUNT(*) c FROM trial_lessons GROUP BY age_group`).all();
  res.json({ ok: true, data: { total, online, offline, booked, contacted, finished, bySubject, byAge } });
});

app.post('/api/admin/trial/:id', auth.authAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status, adminNote, reply } = req.body;
  const t = db.prepare('SELECT * FROM trial_lessons WHERE id=?').get(id);
  if (!t) return res.status(404).json({ ok: false, msg: '预约不存在' });
  const contactedAt = status === 'contacted' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : t.contacted_at;
  db.prepare(`UPDATE trial_lessons SET status=?, admin_note=?, reply=?, contacted_at=COALESCE(?, contacted_at) WHERE id=?`)
    .run(status || t.status, adminNote !== undefined ? adminNote : t.admin_note, reply !== undefined ? reply : t.reply, contactedAt, id);
  res.json({ ok: true, msg: '已更新' });
});

// ---------- 通知（补位预警/收入冻结提醒） ----------
app.get('/api/user/notices', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM notices WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  const unread = db.prepare(`SELECT COUNT(*) c FROM notices WHERE user_id=? AND is_read=0`).get(req.user.id).c;
  // 兼容旧调用：传 read=1 时读取即标记已读（如个人中心展示）
  if (req.query.read === '1' && unread > 0) {
    db.prepare(`UPDATE notices SET is_read=1 WHERE user_id=? AND is_read=0`).run(req.user.id);
  }
  res.json({ ok: true, data: list, unread });
});

// 全部标记已读
app.post('/api/user/notices/read', auth.authUser, (req, res) => {
  db.prepare(`UPDATE notices SET is_read=1 WHERE user_id=? AND is_read=0`).run(req.user.id);
  res.json({ ok: true, msg: '已全部标记为已读' });
});

// ---------- 拼团 ----------
app.get('/api/group/list', (req, res) => {
  const hours = getSettingNumE('group_hours', 48);
  const list = db.prepare(`SELECT g.*, c.title AS course_title, c.price, c.original_price, c.group_discount FROM group_orders g LEFT JOIN courses c ON c.id=g.course_id WHERE g.status='opening' AND (g.expire_at IS NULL OR datetime(g.expire_at) > datetime('now','localtime')) ORDER BY g.id DESC LIMIT 50`).all();
  list.forEach(g => { try { g.tier_snapshot = JSON.parse(g.tier_snapshot || '{}'); } catch (e) { g.tier_snapshot = {}; } });
  res.json({ ok: true, data: list });
});
// 我参与的拼团（含已结束）
app.get('/api/group/my', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT g.*, c.title AS course_title, c.price, c.original_price FROM group_members m LEFT JOIN group_orders g ON g.id=m.group_id LEFT JOIN courses c ON c.id=g.course_id WHERE m.user_id=? ORDER BY g.id DESC LIMIT 50`).all(req.user.id);
  list.forEach(g => { try { g.tier_snapshot = JSON.parse(g.tier_snapshot || '{}'); } catch (e) { g.tier_snapshot = {}; } });
  res.json({ ok: true, data: list });
});
// 拼团详情（含成员，公开用于分享落地页）
app.get('/api/group/:id', (req, res) => {
  const g = db.prepare(`SELECT g.*, c.title AS course_title, c.subtitle, c.cover, c.price, c.original_price, c.group_discount, c.level, u.nickname AS leader_nickname FROM group_orders g LEFT JOIN courses c ON c.id=g.course_id LEFT JOIN users u ON u.id=g.leader_user WHERE g.id=?`).get(Number(req.params.id));
  if (!g) return res.status(404).json({ ok: false, msg: '拼团不存在' });
  // 即时过期检查：opening 状态且已超时则置为 failed
  if (g.status === 'opening' && g.expire_at && new Date(g.expire_at) <= new Date()) {
    db.prepare(`UPDATE group_orders SET status='failed' WHERE id=?`).run(g.id);
    g.status = 'failed';
  }
  const members = db.prepare(`SELECT m.user_id, u.nickname, m.joined_at FROM group_members m LEFT JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.joined_at`).all(g.id);
  // 解析档位快照（服务/礼包）
  let tierSnapshot = {};
  try { tierSnapshot = JSON.parse(g.tier_snapshot || '{}'); } catch (e) {}
  res.json({ ok: true, data: { ...g, members, tierSnapshot } });
});
// 开团（支持后台配置的「人数:价格」分档：选择档位后成团人数与拼团价均按该档执行）
// 流程：创建拼团(pending) → 创建开团预付订单（按档位价/原价-固定抵扣）→ 支付确认后团才生效(opening)
app.post('/api/group/create', auth.authUser, (req, res) => {
  const { courseId, tierCount } = req.body;
  const course = db.prepare('SELECT * FROM courses WHERE id=?').get(courseId);
  if (!course) return res.status(400).json({ ok: false, msg: '课程不存在' });
  const tiers = getCourseGroupTiers(course);
  let minCount = tiers[0].n;
  let tierPrice = tiers[0].price;
  let tierSnapshot = tiers[0];
  if (tierCount) {
    const t = tiers.find(x => x.n === Number(tierCount));
    if (!t) return res.status(400).json({ ok: false, msg: '拼团档位不存在，请刷新后重新选择' });
    minCount = t.n; tierPrice = t.price; tierSnapshot = t;
  }
  // 预付金额：按所选档位价，作为开团购课款
  const basePrice = Number(course.price) || getSettingNumE('price_' + course.level, 499);
  const prepay = Math.min(Number(tierPrice), basePrice);
  if (prepay <= 0) return res.status(400).json({ ok: false, msg: '预付金额异常，请检查课程价格配置' });

  const groupNo = 'GP' + Date.now() + Math.floor(Math.random() * 1000);
  const groupHours = getSettingNumE('group_hours', 48);
  const expireAt = new Date(Date.now() + groupHours * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const info = db.prepare(`INSERT INTO group_orders (group_no, course_id, leader_user, member_count, min_count, discount_amount, tier_price, tier_snapshot, status, expire_at) VALUES (?,?,?,1,?,0,?,?,?,?)`)
    .run(groupNo, courseId, req.user.id, minCount, tierPrice, JSON.stringify(tierSnapshot), 'pending', expireAt);
  const gid = info.lastInsertRowid;
  db.prepare(`INSERT INTO group_members (group_id, user_id) VALUES (?,?)`).run(gid, req.user.id);

  // 创建开团预付订单（先付款后开团，走统一支付网关）
  const mode = wxpay.getPayMode();
  const orderNo = 'HM' + Date.now() + Math.floor(Math.random() * 1000);
  const productType = course.level || String(basePrice);
  // 财务风控：开团预付订单后端强制 forgo_share_reward=1（拼团优惠单不产生任何分享奖励，不采信前端参数）
  const oi = db.prepare(`INSERT INTO orders (order_no, user_id, product_type, amount, pay_type, referrer_id, status, join_fission, forgo_share_reward, biz_type, biz_id, course_id) VALUES (?,?,?,?,?,?,?,0,1,?,?,?)`)
    .run(orderNo, req.user.id, productType, prepay, 'group_start', req.user.referrer_id, mode === 'mock' ? 'paid' : 'pending', 'group_start', gid, courseId ? Number(courseId) : null);
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(oi.lastInsertRowid);
  db.prepare(`UPDATE group_orders SET order_id=? WHERE id=?`).run(order.id, gid);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(orderNo, 'create', JSON.stringify({ mode, type: 'group_start', prepay, minCount, tierPrice }));

  // 模拟支付：下单即支付，立即开团
  if (mode === 'mock') {
    const result = settlePaidOrder(order);
    return res.json({ ok: true, data: { groupId: gid, groupNo, minCount, tierPrice, order, pay: prepay, ...result }, msg: `开团成功！已支付 ${minCount}人团购课款 ¥${prepay}，可复制链接邀请好友参团` });
  }

  // 线下确认收款：展示收款码，管理员确认到账后开团
  if (mode === 'manual') {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'manual_pending', JSON.stringify({ msg: '等待后台确认收款(开团预付)', pay: prepay }));
    return res.json({
      ok: true,
      data: { groupId: gid, groupNo, minCount, tierPrice, order, pay: prepay, payMode: 'manual', receiveInfo: getReceiveInfo() },
      msg: '开团订单已提交，请按收款码完成转账，管理员确认到账后开团成功',
    });
  }

  // 微信支付：统一下单，支付成功后回调激活开团
  (async () => {
    try {
      if (!req.user.openid) throw new Error('请先通过微信登录授权（wx.login）后再支付');
      const wxRes = await wxpay.createJsapiOrder({
        outTradeNo: order.order_no,
        description: '翰墨书院·开团预付',
        amount: prepay,
        openid: req.user.openid,
      });
      const payParams = wxpay.buildJsapiPayParams(wxRes.prepay_id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'prepay', JSON.stringify({ prepay_id: wxRes.prepay_id, trade_type: wxRes.trade_type }));
      res.json({ ok: true, data: { groupId: gid, groupNo, minCount, tierPrice, order, pay: prepay, payMode: 'wxpay', payParams, prepayId: wxRes.prepay_id }, msg: '请完成支付，支付成功后自动开团' });
    } catch (e) {
      db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'error', e.message);
      res.status(400).json({ ok: false, msg: e.message });
    }
  })();
});
// 参团
app.post('/api/group/join', auth.authUser, (req, res) => {
  const { groupId } = req.body;
  const group = db.prepare(`SELECT * FROM group_orders WHERE id=? AND status='opening'`).get(groupId);
  if (!group) return res.status(400).json({ ok: false, msg: '拼团不存在或已结束' });
  if (group.expire_at && new Date(group.expire_at) <= new Date()) {
    db.prepare(`UPDATE group_orders SET status='failed' WHERE id=?`).run(groupId);
    return res.status(400).json({ ok: false, msg: '该拼团已过期' });
  }
  // 事务原子化：成员去重 + 名额占用（member_count 条件自增）+ 成员插入，防止并发超额入团
  db.exec('BEGIN IMMEDIATE');
  try {
    const already = db.prepare(`SELECT id FROM group_members WHERE group_id=? AND user_id=?`).get(groupId, req.user.id);
    if (already) { db.exec('ROLLBACK'); return res.status(400).json({ ok: false, msg: '您已加入该团' }); }
    const g2 = db.prepare(`SELECT * FROM group_orders WHERE id=? AND status='opening'`).get(groupId);
    if (!g2) { db.exec('ROLLBACK'); return res.status(400).json({ ok: false, msg: '拼团不存在或已结束' }); }
    const r = db.prepare(`UPDATE group_orders SET member_count=member_count+1 WHERE id=? AND member_count<? AND status='opening'`).run(groupId, g2.min_count);
    if (r.changes === 0) { db.exec('ROLLBACK'); return res.status(400).json({ ok: false, msg: '该团人数已满，无法加入' }); }
    db.prepare(`INSERT INTO group_members (group_id, user_id) VALUES (?,?)`).run(groupId, req.user.id);
    const newCount = g2.member_count + 1;
    const isSuccess = newCount >= g2.min_count;
    if (isSuccess) db.prepare(`UPDATE group_orders SET status='success' WHERE id=?`).run(groupId);
    db.exec('COMMIT');
    if (isSuccess) {
      // 成团：主理人开团时已预付购课款，自动为其开通课程（事务外执行，失败不影响参团）
      const leaderOrder = db.prepare(`SELECT * FROM orders WHERE biz_type='group_start' AND biz_id=? AND status='paid'`).get(groupId);
      let leaderOpened = false;
      if (leaderOrder) {
        openCourseForOrder(leaderOrder);
        db.prepare(`UPDATE orders SET pay_type='group' WHERE id=?`).run(leaderOrder.id);
        leaderOpened = true;
      }
      return res.json({ ok: true, msg: leaderOpened ? '拼团成功！团长已按团购价自动开通课程' : '拼团成功！可享拼团优惠价购课', success: true, leaderOpened });
    }
    res.json({ ok: true, msg: '已加入拼团，还需' + (g2.min_count - newCount) + '人成团' });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
});
// 取消拼团（仅团长；未成团且无人参团时可取消，预付购课款原路退回）
app.post('/api/group/:id/cancel', auth.authUser, (req, res) => {
  const g = db.prepare(`SELECT * FROM group_orders WHERE id=?`).get(Number(req.params.id));
  if (!g) return res.status(404).json({ ok: false, msg: '拼团不存在' });
  if (g.leader_user !== req.user.id) return res.status(400).json({ ok: false, msg: '仅团长可取消拼团' });
  if (g.status !== 'opening' && g.status !== 'pending') return res.status(400).json({ ok: false, msg: '当前状态不可取消' });
  if (g.status === 'opening' && g.member_count > 1) return res.status(400).json({ ok: false, msg: '已有好友参团，无法取消拼团' });
  const order = db.prepare(`SELECT * FROM orders WHERE biz_type='group_start' AND biz_id=?`).get(g.id);
  const wasPaid = order && order.status === 'paid';
  if (order) {
    db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'refund', JSON.stringify({ reason: '团长取消拼团', amount: order.amount }));
  }
  db.prepare(`UPDATE group_orders SET status='cancelled' WHERE id=?`).run(g.id);
  res.json({ ok: true, msg: '拼团已取消' + (wasPaid ? '，预付购课款已原路退回' : '') });
});

// ---------- 砍价 ----------
function getSettingNumE(key, def) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return def;
  try { return JSON.parse(row.value).v; } catch (e) { return def; }
}
// 解析 "人数:价格" 档位文本/数组 => [{n, price}, ...]（按人数升序）
function parseTierText(raw, def = []) {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const item of arr) {
    const m = String(item).match(/^(\d+)\s*[:：]\s*(\d+)$/);
    if (m) out.push({ n: Number(m[1]), price: Number(m[2]) });
  }
  out.sort((a, b) => a.n - b.n);
  return out.length ? out : def;
}
function getGroupTiers() { return parseTierText(getSettingArr('group_price_tiers')); }
function getBargainTiers() { return parseTierText(getSettingArr('bargain_price_tiers')); }
// 按已帮砍人数计算砍价目标价：tiers 档位价 / step 每人多减 / random 随机到底
function bargainTargetPrice(b) {
  if (b.tier_mode === 'tiers') {
    let cfg = [];
    try { cfg = JSON.parse(b.tier_config || '{}').tiers || []; } catch (e) {}
    let target = b.original_price;
    for (const t of cfg) { if (b.helps + 1 >= t.n) target = t.price; }
    return target;
  }
  if (b.tier_mode === 'step') {
    let step = 0;
    try { step = JSON.parse(b.tier_config || '{}').step || 0; } catch (e) {}
    return b.original_price - (b.helps + 1) * step;
  }
  return b.floor_price;
}
// 发起砍价（先付款后生效：创建砍价(pending) → 创建预付订单 → 支付确认后砍价才生效(active)并开始计时）
app.post('/api/bargain/start', auth.authUser, (req, res) => {
  const { courseId } = req.body;
  const course = db.prepare(`SELECT * FROM courses WHERE id=? AND status='on'`).get(Number(courseId));
  if (!course) return res.status(404).json({ ok: false, msg: '商品不存在' });
  if (!course.is_bargain) return res.status(400).json({ ok: false, msg: '该商品不支持砍价' });
  const cfg = getCourseBargainConfig(course);
  // 分档模式：tiers 档位价（帮砍达到人数→该档价）> step 每人多减 > random 随机砍到底价
  const floor = cfg.floor_price;
  const maxHelps = cfg.max_helps;
  const tierMode = cfg.mode;
  const tierConfig = JSON.stringify(cfg);
  // 每人同一商品只能有一个进行中/待确认的砍价
  const existing = db.prepare(`SELECT * FROM bargains WHERE initiator_id=? AND course_id=? AND status IN ('pending','active')`).get(req.user.id, course.id);
  if (existing) return res.json({ ok: true, data: existing, msg: existing.status === 'pending' ? '您有发起砍价订单待确认收款' : '您已有进行中的砍价' });

  // 预付金额 = 课程原价（砍价成功后按成交价结算，多退少补）
  const prepay = Number(course.price) || getSettingNumE('price_' + course.level, 499);
  if (prepay <= 0) return res.status(400).json({ ok: false, msg: '预付金额异常，请检查课程价格配置' });
  const r = db.prepare(`INSERT INTO bargains (course_id, initiator_id, original_price, floor_price, current_price, max_helps, tier_mode, tier_config, status) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(course.id, req.user.id, course.price, floor, course.price, maxHelps, tierMode, tierConfig, 'pending');
  const bid = r.lastInsertRowid;

  // 创建发起预付订单（先付款后生效，走统一支付网关）
  const mode = wxpay.getPayMode();
  const orderNo = 'HM' + Date.now() + Math.floor(Math.random() * 1000);
  const productType = course.level || String(course.price);
  // 财务风控：发起砍价预付订单后端强制 forgo_share_reward=1（砍价优惠单不产生任何分享奖励，不采信前端参数）
  const oi = db.prepare(`INSERT INTO orders (order_no, user_id, product_type, amount, pay_type, referrer_id, status, join_fission, forgo_share_reward, biz_type, biz_id, course_id) VALUES (?,?,?,?,?,?,?,0,1,?,?,?)`)
    .run(orderNo, req.user.id, productType, prepay, 'bargain_start', req.user.referrer_id, mode === 'mock' ? 'paid' : 'pending', 'bargain_start', bid, course.id);
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(oi.lastInsertRowid);
  db.prepare(`UPDATE bargains SET order_id=? WHERE id=?`).run(order.id, bid);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(orderNo, 'create', JSON.stringify({ mode, type: 'bargain_start', prepay }));

  // 模拟支付：下单即支付，砍价立即生效
  if (mode === 'mock') {
    const result = settlePaidOrder(order);
    const b = db.prepare('SELECT * FROM bargains WHERE id=?').get(bid);
    return res.json({ ok: true, data: { ...b, ...result, order, pay: prepay }, msg: `砍价已发起（预付购课款 ¥${prepay}），快邀请好友帮忙砍！` });
  }

  // 线下确认收款：展示收款码，管理员确认到账后砍价生效
  if (mode === 'manual') {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'manual_pending', JSON.stringify({ msg: '等待后台确认收款(发起砍价)', pay: prepay }));
    const b = db.prepare('SELECT * FROM bargains WHERE id=?').get(bid);
    return res.json({
      ok: true,
      data: { ...b, order, pay: prepay, payMode: 'manual', receiveInfo: getReceiveInfo() },
      msg: '发起砍价订单已提交，请按收款码完成转账，管理员确认到账后砍价生效',
    });
  }

  // 微信支付：统一下单，支付成功后回调激活砍价
  (async () => {
    try {
      if (!req.user.openid) throw new Error('请先通过微信登录授权（wx.login）后再支付');
      const wxRes = await wxpay.createJsapiOrder({
        outTradeNo: order.order_no,
        description: '翰墨书院·发起砍价',
        amount: prepay,
        openid: req.user.openid,
      });
      const payParams = wxpay.buildJsapiPayParams(wxRes.prepay_id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'prepay', JSON.stringify({ prepay_id: wxRes.prepay_id }));
      const b = db.prepare('SELECT * FROM bargains WHERE id=?').get(bid);
      res.json({ ok: true, data: { ...b, order, pay: prepay, payMode: 'wxpay', payParams, prepayId: wxRes.prepay_id }, msg: '请完成支付，支付成功后砍价生效' });
    } catch (e) {
      db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'error', e.message);
      res.status(400).json({ ok: false, msg: e.message });
    }
  })();
});

// 我的砍价列表
app.get('/api/bargain/my', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT b.*, c.title AS course_title, c.subtitle FROM bargains b LEFT JOIN courses c ON c.id=b.course_id WHERE b.initiator_id=? ORDER BY b.id DESC LIMIT 50`).all(req.user.id);
  res.json({ ok: true, data: list });
});
// 砍价详情（含帮砍记录，公开用于分享页）
app.get('/api/bargain/:id', (req, res) => {
  const b = db.prepare(`SELECT b.*, c.title AS course_title, c.subtitle, c.cover, u.nickname FROM bargains b LEFT JOIN courses c ON c.id=b.course_id LEFT JOIN users u ON u.id=b.initiator_id WHERE b.id=?`).get(Number(req.params.id));
  if (!b) return res.status(404).json({ ok: false, msg: '砍价不存在' });
  const helps = db.prepare(`SELECT bh.*, u.nickname FROM bargain_helps bh LEFT JOIN users u ON u.id=bh.user_id WHERE bh.bargain_id=? ORDER BY bh.id`).all(b.id);
  // 过期检查
  if (b.status === 'active' && b.expire_at && new Date().toISOString().replace('T', ' ').slice(0, 19) > b.expire_at) {
    db.prepare(`UPDATE bargains SET status='expired' WHERE id=?`).run(b.id);
    b.status = 'expired';
  }
  // helps(人数) 保留原字段，帮砍明细放 helpList，避免覆盖
  const { helps: _h, ...rest } = b;
  res.json({ ok: true, data: { ...rest, helps: b.helps, helpList: helps } });
});

// 帮砍一刀（事务原子化：帮砍次数/去重/降价在一个事务内完成，杜绝并发超额）
app.post('/api/bargain/:id/help', auth.authUser, (req, res) => {
  const b = db.prepare(`SELECT * FROM bargains WHERE id=?`).get(Number(req.params.id));
  if (!b) return res.status(404).json({ ok: false, msg: '砍价不存在' });
  if (b.status !== 'active') return res.status(400).json({ ok: false, msg: '砍价已结束' });
  // 过期检查
  if (b.expire_at && new Date().toISOString().replace('T', ' ').slice(0, 19) > b.expire_at) {
    db.prepare(`UPDATE bargains SET status='expired' WHERE id=?`).run(b.id);
    return res.status(400).json({ ok: false, msg: '砍价已过期' });
  }
  // 发起人不能帮自己砍
  if (b.initiator_id === req.user.id) return res.status(400).json({ ok: false, msg: '不能帮自己砍价' });
  // 已砍到底价
  if (b.current_price <= b.floor_price) {
    db.prepare(`UPDATE bargains SET status='success' WHERE id=?`).run(b.id);
    return res.status(400).json({ ok: false, msg: '已砍到底价，可直接购买' });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    // 每人只能帮同一活动砍一次（事务内去重）
    const dup = db.prepare(`SELECT id FROM bargain_helps WHERE bargain_id=? AND user_id=?`).get(b.id, req.user.id);
    if (dup) { db.exec('ROLLBACK'); return res.status(400).json({ ok: false, msg: '您已帮砍过了' }); }
    const b2 = db.prepare(`SELECT * FROM bargains WHERE id=?`).get(b.id);
    if (b2.status !== 'active') { db.exec('ROLLBACK'); return res.status(400).json({ ok: false, msg: '砍价已结束' }); }
    if (b2.helps >= b2.max_helps) { db.exec('ROLLBACK'); return res.status(400).json({ ok: false, msg: '砍价次数已用完' }); }
    // 分档模式：价格按帮砍人数档位落点（tiers/step）；随机模式：随机 5%~15% 剩余可砍空间，保底1元
    let newPrice;
    if (b2.tier_mode !== 'random') {
      newPrice = Math.max(b2.floor_price, bargainTargetPrice(b2));
    } else {
      const remaining = b2.current_price - b2.floor_price;
      const cut = Math.max(1, Math.floor(remaining * (0.05 + Math.random() * 0.1)));
      newPrice = Math.max(b2.floor_price, b2.current_price - cut);
    }
    const newHelps = b2.helps + 1;
    const actualCut = Math.max(0, b2.current_price - newPrice);
    const newStatus = newPrice <= b2.floor_price ? 'success' : 'active';
    db.prepare(`UPDATE bargains SET current_price=?, helps=?, status=? WHERE id=?`).run(newPrice, newHelps, newStatus, b.id);
    db.prepare(`INSERT INTO bargain_helps (bargain_id, user_id, cut_amount) VALUES (?,?,?)`).run(b.id, req.user.id, actualCut);
    db.exec('COMMIT');
    const msg = actualCut > 0 ? ('帮砍成功，砍掉¥' + actualCut) : ('已邀请 ' + newHelps + ' 人帮砍，再邀请几人可继续降价');
    res.json({ ok: true, msg, cutAmount: actualCut, currentPrice: newPrice, helps: newHelps });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
});

// 取消砍价（仅发起人；进行中/待付款可取消，预付购课款原路退回）
app.post('/api/bargain/:id/cancel', auth.authUser, (req, res) => {
  const b = db.prepare(`SELECT * FROM bargains WHERE id=?`).get(Number(req.params.id));
  if (!b) return res.status(404).json({ ok: false, msg: '砍价活动不存在' });
  if (b.initiator_id !== req.user.id) return res.status(400).json({ ok: false, msg: '仅发起人可取消砍价' });
  if (b.status !== 'active' && b.status !== 'pending') return res.status(400).json({ ok: false, msg: '当前状态不可取消' });
  const order = db.prepare(`SELECT * FROM orders WHERE biz_type='bargain_start' AND biz_id=?`).get(b.id);
  const wasPaid = order && order.status === 'paid';
  if (order) {
    db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'refund', JSON.stringify({ reason: '发起人取消砍价', amount: order.amount }));
  }
  db.prepare(`UPDATE bargains SET status='cancelled' WHERE id=?`).run(b.id);
  res.json({ ok: true, msg: '砍价已取消' + (wasPaid ? '，预付购课款已原路退回' : '') });
});

// 砍价成功购买（以砍价成交价结算；发起人已预付的订单直接按成交价开通课程，差额原路退回）
app.post('/api/bargain/:id/buy', auth.authUser, (req, res) => {
  const b = db.prepare(`SELECT b.*, c.level, c.price AS course_price FROM bargains b LEFT JOIN courses c ON c.id=b.course_id WHERE b.id=?`).get(Number(req.params.id));
  if (!b) return res.status(404).json({ ok: false, msg: '砍价活动不存在' });
  if (b.initiator_id !== req.user.id) return res.status(400).json({ ok: false, msg: '仅发起人可享受砍价价购买' });
  // 分档模式：有人帮砍降价即可按当前档位价购买；随机模式：须砍到底价才能购买
  if (b.status === 'pending') return res.status(400).json({ ok: false, msg: '发起付款待管理员确认，确认后即可购买' });
  if (b.status === 'expired') return res.status(400).json({ ok: false, msg: '砍价已过期' });
  if (b.status === 'active') {
    const discountOk = b.tier_mode !== 'random' ? b.current_price < b.original_price : b.current_price <= b.floor_price;
    if (!discountOk) return res.status(400).json({ ok: false, msg: b.tier_mode !== 'random' ? '邀请好友帮砍降价后即可购买' : '还未砍到底价，暂不能购买' });
  }

  // 产品档位：优先课程档位(level)，其次课程价格，砍价商品无档位则用当前价兜底
  const productType = b.level || String(b.course_price || b.current_price);
  const pay = b.current_price;
  if (pay <= 0) return res.status(400).json({ ok: false, msg: '成交价异常' });

  // 已购买过同档位则拒绝（防重复下单）
  const user = req.user;
  if (user.is_paid === 1 && user.product_type === productType) {
    return res.status(400).json({ ok: false, msg: '您已购买过该产品' });
  }

  // 发起预付订单：已支付则按成交价直接结算开通课程，预付差额原路退回；未支付则提示先完成发起付款
  const startOrder = db.prepare(`SELECT * FROM orders WHERE biz_type='bargain_start' AND biz_id=?`).get(b.id);
  if (startOrder) {
    if (startOrder.status !== 'paid') return res.status(400).json({ ok: false, msg: '请先完成发起砍价的付款，管理员确认到账后即可购买' });
    const diff = Math.max(0, Number(startOrder.amount) - pay);
    if (diff > 0) {
      db.prepare(`UPDATE orders SET amount=? WHERE id=?`).run(pay, startOrder.id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(startOrder.order_no, 'refund', JSON.stringify({ reason: '砍价成交价低于预付，差额原路退回', amount: diff }));
    }
    db.prepare(`UPDATE orders SET pay_type='bargain' WHERE id=?`).run(startOrder.id);
    openCourseForOrder(startOrder);
    db.prepare(`UPDATE bargains SET status='success' WHERE id=?`).run(b.id);
    return res.json({ ok: true, data: { settled: true, order: startOrder, pay, diff }, msg: '购买成功！成交价¥' + pay + (diff > 0 ? '，预付差额¥' + diff + '已原路退回' : '') });
  }

  const mode = wxpay.getPayMode();
  const orderNo = 'HM' + Date.now() + Math.floor(Math.random() * 1000);
  // 财务风控：砍价成交订单后端强制 forgo_share_reward=1（不产生任何分享奖励，不采信前端参数）
  const info = db.prepare(`INSERT INTO orders (order_no, user_id, product_type, amount, pay_type, referrer_id, status, join_fission, forgo_share_reward, course_id) VALUES (?,?,?,?,?,?,?,0,1,?)`)
    .run(orderNo, user.id, productType, pay, 'bargain', user.referrer_id, mode === 'mock' ? 'paid' : 'pending', b.course_id || null);
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(orderNo, 'create', JSON.stringify({ mode, type: 'bargain', pay }));

  // 模拟支付模式：下单即支付，立即结算
  if (mode === 'mock') {
    const result = settlePaidOrder(order);
    return res.json({ ok: true, data: { order, pay, ...result }, msg: '购买成功！成交价¥' + pay });
  }

  // 线下确认收款模式（默认）：展示收款码，后台确认到账后开通
  if (mode === 'manual') {
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'manual_pending', JSON.stringify({ msg: '等待后台确认收款(砍价)', pay }));
    return res.json({
      ok: true,
      data: { order, pay, payMode: 'manual', receiveInfo: getReceiveInfo() },
      msg: '订单已提交，请按收款码完成转账，管理员确认到账后开通',
    });
  }

  // 微信支付模式：统一下单，返回调起支付参数
  (async () => {
    try {
      if (!user.openid) throw new Error('请先通过微信登录授权（wx.login）后再下单支付');
      const wxRes = await wxpay.createJsapiOrder({
        outTradeNo: order.order_no,
        description: '翰墨书院·砍价购课',
        amount: pay,
        openid: user.openid,
      });
      const payParams = wxpay.buildJsapiPayParams(wxRes.prepay_id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'prepay', JSON.stringify({ prepay_id: wxRes.prepay_id }));
      res.json({ ok: true, data: { order, pay, payMode: 'wxpay', payParams, prepayId: wxRes.prepay_id }, msg: '请完成微信支付' });
    } catch (e) {
      db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
      db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'error', e.message);
      res.status(400).json({ ok: false, msg: e.message });
    }
  })();
});

// ---------- 打卡任务 ----------
// 连续打卡天数（从今天往前数，今天没打则从昨天算）
function calcStreak(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const doneList = db.prepare(`SELECT DISTINCT date FROM checkins WHERE user_id=?`).all(uid).map(d => d.date);
  const hasToday = doneList.includes(today);
  let cursor = hasToday ? today : (() => { const y = new Date(); y.setDate(y.getDate() - 1); return y.toISOString().slice(0, 10); })();
  let streak = 0;
  while (doneList.includes(cursor)) {
    streak++;
    const d = new Date(cursor); d.setDate(d.getDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}
// 连续打卡阶梯奖励配置
const CHECKIN_BONUS = [
  { days: 7, reward: 10,  name: '一周坚持', icon: '🌱' },
  { days: 14, reward: 20, name: '两周磨砺', icon: '🌿' },
  { days: 21, reward: 30, name: '三周渐入', icon: '🎋' },
  { days: 30, reward: 50, name: '满月小成', icon: '🏆' },
];

// 完成一次打卡（发放奖励+阶梯奖励），返回结果对象
function finishCheckin(uid, taskType) {
  const today = new Date().toISOString().slice(0, 10);
  const reward = engine.getSettingNum('checkin_reward') || 2;
  // 原子打卡：依赖 (user_id,date,task_type) 唯一索引，并发重复打卡只成功一次
  const r = db.prepare(`INSERT OR IGNORE INTO checkins (user_id, task_type, date, reward) VALUES (?,?,?,?)`).run(uid, taskType, today, reward);
  if (r.changes === 0) return { ok: false, msg: '今日该任务已打卡' };
  db.prepare(`UPDATE coupons SET balance=balance+?, total_earned=total_earned+? WHERE user_id=?`).run(reward, reward, uid);
  const c = db.prepare(`SELECT * FROM coupons WHERE user_id=?`).get(uid);
  db.prepare(`INSERT INTO coupon_flows (user_id, change_amount, balance_after, type, remark) VALUES (?,?,?,?,?)`).run(uid, reward, c.balance, 'task', '打卡奖励');
  // 连续打卡阶梯奖励：达到 7/14/21/30 天时额外发放
  const streakNow = calcStreak(uid);
  const bonus = CHECKIN_BONUS.find(b => b.days === streakNow);
  let extraMsg = '';
  if (bonus) {
    db.prepare(`UPDATE coupons SET balance=balance+?, total_earned=total_earned+? WHERE user_id=?`).run(bonus.reward, bonus.reward, uid);
    const c2 = db.prepare(`SELECT * FROM coupons WHERE user_id=?`).get(uid);
    db.prepare(`INSERT INTO coupon_flows (user_id, change_amount, balance_after, type, remark) VALUES (?,?,?,?,?)`).run(uid, bonus.reward, c2.balance, 'task_bonus', `连续打卡${streakNow}天奖励`);
    extraMsg = `，达成连续${streakNow}天「${bonus.name}」额外奖励+${bonus.reward}抵用金 🎉`;
  }
  return { ok: true, msg: '打卡成功，+'+reward+'抵用金' + extraMsg, streak: streakNow, bonus: bonus || null };
}

// 直发打卡已停用：必须完成对应动作（上传作业/看课/做题/写心得）后由系统触发，防止"点一点就发钱"
app.post('/api/task/checkin', auth.authUser, (req, res) => {
  return res.status(400).json({ ok: false, msg: '请先完成对应任务（上传作业/看课/做题/写心得）后再打卡' });
});

// 动作完成后由前端调用（作业提交/看完视频/做完题后）完成对应打卡
app.post('/api/task/checkin-by-action', auth.authUser, (req, res) => {
  const { taskType } = req.body; // calligraphy/class/review
  if (!['calligraphy', 'class', 'review'].includes(String(taskType))) {
    return res.status(400).json({ ok: false, msg: '打卡任务类型无效' });
  }
  res.json(finishCheckin(req.user.id, taskType));
});

// 今日打卡进度 + 连续打卡天数 + 打卡日历 + 阶梯奖励
app.get('/api/task/today', auth.authUser, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const doneList = db.prepare(`SELECT task_type FROM checkins WHERE user_id=? AND date=?`).all(req.user.id);
  const doneSet = {};
  doneList.forEach(d => doneSet[d.task_type] = true);
  const streak = calcStreak(req.user.id);
  // 最近 35 天打卡日期集合（日历用）
  const days = db.prepare(`SELECT DISTINCT date FROM checkins WHERE user_id=? AND date >= date('now','-35 days')`).all(req.user.id).map(d => d.date);
  // 本月打卡次数
  const monthCount = db.prepare(`SELECT COUNT(DISTINCT date) c FROM checkins WHERE user_id=? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`).get(req.user.id).c;
  res.json({ ok: true, data: {
    today, done: doneSet, streak, days, monthCount,
    bonus: CHECKIN_BONUS,
    taskDefs: [
      { key: 'calligraphy', label: '练字打卡', icon: '✍️' },
      { key: 'class', label: '课堂签到', icon: '🏫' },
      { key: 'review', label: '学情复盘', icon: '📖' },
    ],
  } });
});

// 提交学习任务（支持上传图片/文件 + 留言）
// 当 checkinType 为 calligraphy/review 时，提交作业的同时完成对应打卡奖励
app.post('/api/task/learning', auth.authUser, (req, res) => {
  const { taskType, content, image, file, checkinType } = req.body;
  if (!taskType) return res.status(400).json({ ok: false, msg: '任务类型必填' });
  // 打卡硬性门槛：练字打卡必须上传练字作业图片，学情复盘必须填写学习心得
  if (checkinType === 'calligraphy' && !String(image || '').trim()) {
    return res.status(400).json({ ok: false, msg: '练字打卡需先上传练字作业图片，上传后才能获得打卡奖励' });
  }
  if (checkinType === 'review' && !String(content || '').trim()) {
    return res.status(400).json({ ok: false, msg: '学情复盘需先写下学习心得体会，填写后才能获得打卡奖励' });
  }
  // 心得/留言敏感词拦截（与交流社区同一敏感词库）
  if (content) {
    const hits = hitSensitive(String(content));
    if (hits.length) return res.status(400).json({ ok: false, msg: '内容包含敏感词（' + hits.join('、') + '），请修改后重试' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const reward = engine.getSettingNum('task_reward') || 1;
  const info = db.prepare(`INSERT INTO learning_tasks (user_id, task_type, reward, date, content, image, file) VALUES (?,?,?,?,?,?,?)`)
    .run(req.user.id, taskType, reward, today, sanitizeHtml(String(content || '')), image || null, file || null);
  db.prepare(`UPDATE coupons SET balance=balance+?, total_earned=total_earned+? WHERE user_id=?`).run(reward, reward, req.user.id);
  const c = db.prepare(`SELECT * FROM coupons WHERE user_id=?`).get(req.user.id);
  db.prepare(`INSERT INTO coupon_flows (user_id, change_amount, balance_after, type, remark) VALUES (?,?,?,?,?)`).run(req.user.id, reward, c.balance, 'task', '学习任务奖励');
  let checkinMsg = '';
  if (['calligraphy', 'review'].includes(String(checkinType))) {
    const ck = finishCheckin(req.user.id, checkinType);
    if (ck.ok) checkinMsg = '；' + ck.msg;
  }
  res.json({ ok: true, msg: '学习任务已提交，+'+reward+'抵用金' + checkinMsg, id: info.lastInsertRowid });
});

// 我的学习任务记录
app.get('/api/task/my-learning', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM learning_tasks WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// ---------- 习题 / 练习模块 ----------
function safeParse(str, fallback) {
  try { const v = JSON.parse(str || ''); return Array.isArray(v) ? v : fallback; } catch (e) { return fallback; }
}
function isAnswerRight(q, userAnswer) {
  const ua = String(userAnswer || '').toUpperCase().replace(/\s+/g, '');
  if (!ua) return false;
  if (q.type === 'multi') {
    const right = String(q.answer).toUpperCase().split(',').map(s => s.trim()).filter(Boolean).sort().join(',');
    const mine = ua.split(',').map(s => s.trim()).filter(Boolean).sort().join(',');
    return right === mine;
  }
  return ua === String(q.answer).toUpperCase();
}

// 有题库的课程列表（练习入口）
app.get('/api/practice/courses', (req, res) => {
  const list = db.prepare(`SELECT q.course_id AS id, IFNULL(c.title,'通用练习') AS title, c.level, COUNT(*) AS qcount
    FROM questions q LEFT JOIN courses c ON c.id=q.course_id
    WHERE q.status='on' GROUP BY q.course_id ORDER BY qcount DESC`).all();
  res.json({ ok: true, data: list });
});

// 开始练习：随机抽题（不返回答案，交卷后统一判分）
app.get('/api/practice/start', auth.authUser, (req, res) => {
  const courseId = Number(req.query.courseId) || 0;
  const count = Math.min(20, Math.max(5, Number(req.query.count) || 10));
  const rows = courseId
    ? db.prepare(`SELECT * FROM questions WHERE course_id=? AND status='on' ORDER BY RANDOM() LIMIT ?`).all(courseId, count)
    : db.prepare(`SELECT * FROM questions WHERE status='on' ORDER BY RANDOM() LIMIT ?`).all(count);
  if (!rows.length) return res.status(400).json({ ok: false, msg: '该课程暂无题目，可到管理端录入' });
  const list = rows.map(q => ({ id: q.id, course_id: q.course_id, type: q.type, question: q.question, options: safeParse(q.options, []) }));
  res.json({ ok: true, data: { total: list.length, questions: list } });
});

// 提交答案：判分 + 记录 + 返回逐题解析
app.post('/api/practice/submit', auth.authUser, (req, res) => {
  const { courseId, courseTitle, duration, answers } = req.body;
  if (!Array.isArray(answers) || !answers.length) return res.status(400).json({ ok: false, msg: '请先作答' });
  let correct = 0;
  const detail = [];
  db.exec('BEGIN');
  try {
    for (const a of answers) {
      const q = db.prepare(`SELECT * FROM questions WHERE id=?`).get(Number(a.questionId));
      if (!q) continue;
      const ok = isAnswerRight(q, a.answer);
      if (ok) correct++;
      db.prepare(`INSERT INTO practice_records (user_id, course_id, question_id, answer, correct) VALUES (?,?,?,?,?)`).run(req.user.id, q.course_id, q.id, String(a.answer || ''), ok ? 1 : 0);
      detail.push({ id: q.id, type: q.type, question: q.question, options: safeParse(q.options, []), userAnswer: String(a.answer || ''), rightAnswer: q.answer, correct: ok, analysis: q.analysis || '' });
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  const total = detail.length;
  const score = total ? Math.round(correct / total * 100) : 0;
  const title = courseTitle || (courseId ? (db.prepare(`SELECT title FROM courses WHERE id=?`).get(courseId) || {}).title : '综合练习') || '综合练习';
  db.prepare(`INSERT INTO practice_sessions (user_id, course_id, course_title, total, correct, score, duration) VALUES (?,?,?,?,?,?,?)`)
    .run(req.user.id, Number(courseId) || 0, title, total, correct, score, Number(duration) || 0);
  res.json({ ok: true, data: { total, correct, score, detail } });
});

// 我的练习历史（成绩单）
app.get('/api/practice/history', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM practice_sessions WHERE user_id=? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  res.json({ ok: true, data: list });
});

// 我的错题本（去重）
app.get('/api/practice/wrong', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT q.*, p.answer AS my_answer FROM practice_records p JOIN questions q ON q.id=p.question_id WHERE p.user_id=? AND p.correct=0 ORDER BY p.id DESC LIMIT 200`).all(req.user.id);
  const seen = new Set(); const out = [];
  for (const w of list) { if (seen.has(w.id)) continue; seen.add(w.id); w.options = safeParse(w.options, []); out.push(w); }
  res.json({ ok: true, data: out });
});

// 管理端：题库列表（可按课程/关键词过滤）
app.get('/api/admin/questions', auth.authAdmin, (req, res) => {
  const courseId = Number(req.query.courseId) || 0;
  const kw = String(req.query.kw || '').trim();
  let sql = `SELECT * FROM questions WHERE 1=1`, params = [];
  if (courseId) { sql += ` AND course_id=?`; params.push(courseId); }
  if (kw) { sql += ` AND (question LIKE ? OR answer LIKE ?)`; params.push(`%${kw}%`, `%${kw}%`); }
  sql += ` ORDER BY course_id, sort, id`;
  const list = db.prepare(sql).all(...params).map(q => { q.options = safeParse(q.options, []); return q; });
  res.json({ ok: true, data: list });
});

// 管理端：新增/更新题目
app.post('/api/admin/questions', auth.authAdmin, (req, res) => {
  const { id, courseId, type, question, options, answer, analysis, sort, status } = req.body;
  if (!question || !Array.isArray(options) || !options.length || !answer) return res.status(400).json({ ok: false, msg: '题目、选项、答案均必填' });
  const clean = options.map(o => ({ k: String(o.k || '').trim(), t: String(o.t || '').trim() })).filter(o => o.k && o.t);
  if (!clean.length) return res.status(400).json({ ok: false, msg: '至少需要一个有效选项' });
  const qType = ['single', 'multi', 'judge'].includes(type) ? type : 'single';
  const cid = Number(courseId) || 0;
  if (id) {
    db.prepare(`UPDATE questions SET course_id=?, type=?, question=?, options=?, answer=?, analysis=?, sort=?, status=? WHERE id=?`)
      .run(cid, qType, sanitizeHtml(String(question)), JSON.stringify(clean), String(answer), sanitizeHtml(String(analysis || '')), Number(sort) || 0, status === 'off' ? 'off' : 'on', Number(id));
  } else {
    db.prepare(`INSERT INTO questions (course_id, type, question, options, answer, analysis, sort, status) VALUES (?,?,?,?,?,?,?,'on')`)
      .run(cid, qType, sanitizeHtml(String(question)), JSON.stringify(clean), String(answer), sanitizeHtml(String(analysis || '')), Number(sort) || 0);
  }
  res.json({ ok: true, msg: '保存成功' });
});

// 管理端：删除题目
app.delete('/api/admin/questions/:id', auth.authAdmin, (req, res) => {
  db.prepare(`DELETE FROM questions WHERE id=?`).run(Number(req.params.id));
  res.json({ ok: true, msg: '已删除' });
});

// 管理端：批量导入题目
app.post('/api/admin/questions/batch', auth.authAdmin, (req, res) => {
  const { courseId, items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok: false, msg: '请提供题目数据' });
  const cid = Number(courseId) || 0;
  let n = 0;
  const ins = db.prepare(`INSERT INTO questions (course_id, type, question, options, answer, analysis, sort) VALUES (?,?,?,?,?,?,?)`);
  for (const it of items) {
    const q = sanitizeHtml(String(it.question || '')).trim();
    const type = ['single', 'multi', 'judge'].includes(it.type) ? it.type : 'single';
    let options = Array.isArray(it.options) ? it.options.map(o => ({ k: String(o.k || ''), t: String(o.t || '') })).filter(o => o.k && o.t) : [];
    if (type === 'judge' && !options.length) options = [{ k: 'A', t: '对' }, { k: 'B', t: '错' }];
    if (!q || !options.length || !String(it.answer || '').trim()) continue;
    ins.run(cid, type, q, JSON.stringify(options), String(it.answer).trim(), sanitizeHtml(String(it.analysis || '')), n + 1);
    n++;
  }
  res.json({ ok: true, msg: `成功导入 ${n} 道题` });
});

// ---------- 敏感词屏蔽 ----------
// 默认敏感词库（后台「内容审核」页可维护）
const DEFAULT_SENSITIVE_WORDS = '代开发票,刷单,兼职刷单,博彩,赌博,裸聊,贷款,加微信,加QQ,招嫖,外挂,破解版,代刷,赌博网站';
function getSensitiveWords() {
  const row = db.prepare(`SELECT value FROM settings WHERE key='sensitive_words'`).get();
  if (!row || !row.value) {
    db.prepare(`INSERT INTO settings (key, value, remark) VALUES ('sensitive_words', ?, '交流社区敏感词，逗号分隔') ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run(DEFAULT_SENSITIVE_WORDS);
    return DEFAULT_SENSITIVE_WORDS.split(/[,，\s]+/).map(w => w.trim()).filter(Boolean);
  }
  return String(row.value).split(/[,，\s]+/).map(w => w.trim()).filter(Boolean);
}
// 返回命中敏感词列表（富文本内容先提取纯文本再检测，避免 HTML 标签干扰）
function hitSensitive(text) {
  if (!text) return [];
  const words = getSensitiveWords();
  const plain = stripHtml(String(text));
  return words.filter(w => w && plain.includes(w));
}

// 提取纯文本（富文本摘要 / 敏感词检测用）
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, ' ')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// 富文本 HTML 白名单清洗（防 XSS）：仅保留安全标签与属性，移除脚本/事件/危险协议/内联样式
function sanitizeHtml(input) {
  if (!input) return '';
  const ALLOW_TAGS = new Set([
    'p', 'br', 'img', 'video', 'audio', 'source', 'a', 'strong', 'b', 'em', 'i',
    'u', 's', 'strike', 'del', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol',
    'li', 'span', 'div', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr',
    'td', 'th', 'figure', 'figcaption', 'iframe',
  ]);
  const IFRAME_ALLOW_HOSTS = new Set([
    'player.bilibili.com', 'bilibili.com', 'www.bilibili.com', 'player.youku.com',
    'youku.com', 'v.qq.com', 'open.video.qq.com', 'v.youku.com',
  ]);
  let s = String(input)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '');
  // iframe 单独白名单校验（仅允许主流视频平台嵌入域名）
  s = s.replace(/<\s*iframe[\s\S]*?(?:\/\s*>|<\s*\/\s*iframe\s*>)/gi, (m) => {
    const srcM = /src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(m);
    const url = srcM ? (srcM[1] || srcM[2] || srcM[3] || '') : '';
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
    if (!url || !IFRAME_ALLOW_HOSTS.has(host)) return '';
    return '<iframe src="' + url.replace(/"/g, '&quot;') + '" frameborder="0" allowfullscreen loading="lazy"></iframe>';
  });
  // 逐个标签清洗：移除黑名单标签、清理属性
  s = s.replace(/<\/?([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g, (m, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOW_TAGS.has(t)) {
      // 非白名单标签：剥离标签外壳，保留内部文本
      return m.replace(/^<\//, '&lt;/').replace(/^</, '&lt;').replace(/>$/, '&gt;');
    }
    const out = [];
    const re = /\s+([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let mm;
    while ((mm = re.exec(attrs))) {
      const name = mm[1].toLowerCase();
      const val = (mm[2] ?? mm[3] ?? mm[4] ?? '').trim();
      if (!val) continue;
      if (name.startsWith('on')) continue;                 // 事件属性一律移除
      if (name === 'style') continue;                       // 移除内联样式（防 CSS 注入，由前端统一排版）
      if (name === 'class' || name === 'id') continue;
      if (/^\s*javascript:|^\s*vbscript:|^\s*data:\s*text\//i.test(val)) continue; // 危险协议
      if (name === 'src') {
        const v = val.toLowerCase();
        const okSrc = v.startsWith('/uploads/') || v.startsWith('/') || /^https?:\/\//.test(v) || /^data:image\//.test(v);
        if (!okSrc) continue;
        if (t === 'video' || t === 'audio' || t === 'source') {
          if (!/\.(mp4|webm|ogg|mp3|m4a|m3u8)(\?|$)/.test(val.toLowerCase())) continue;
        }
        out.push(' ' + name + '="' + val.replace(/"/g, '&quot;') + '"');
        continue;
      }
      if (name === 'href' && t === 'a') {
        const v = val.toLowerCase();
        if (!(/^https?:\/\//.test(v) || v.startsWith('/') || v.startsWith('#') || v.startsWith('mailto:'))) continue;
        out.push(' href="' + val.replace(/"/g, '&quot;') + '" rel="noopener nofollow"');
        continue;
      }
      out.push(' ' + name + '="' + val.replace(/"/g, '&quot;') + '"');
    }
    return '<' + t + out.join('') + '>';
  });
  return s;
}

// ---------- 交流社区（类微博/论坛，BBS 监管合规） ----------
// 合规口径：文章仅在个人中心或管理后台发表，审核通过(approved)后才在栏目展示；栏目版面不设发表入口。
// 帖子栏目分类：公开（启用的栏目，供版面tabs/发布表单动态加载）
app.get('/api/post-categories', (req, res) => {
  const list = db.prepare(`SELECT name, value, sort FROM post_categories WHERE status='on' ORDER BY sort, id`).all();
  res.json({ ok: true, data: list });
});
// 管理端：帖子栏目分类管理（增删改，删除=停用不影响历史帖子）
app.get('/api/admin/post-categories', auth.authAdmin, (req, res) => {
  res.json({ ok: true, data: db.prepare(`SELECT * FROM post_categories ORDER BY sort, id`).all() });
});
app.post('/api/admin/post-categories', auth.authAdmin, (req, res) => {
  const { name, value, sort } = req.body || {};
  const n = String(name || '').trim();
  const v = String(value || '').trim().toLowerCase();
  if (!n || !v) return res.status(400).json({ ok: false, msg: '栏目名称和标识不能为空' });
  if (!/^[a-z0-9_]{1,30}$/.test(v)) return res.status(400).json({ ok: false, msg: '标识仅支持小写字母/数字/下划线，最长30位' });
  try {
    const r = db.prepare(`INSERT INTO post_categories (name, value, sort) VALUES (?,?,?)`).run(n, v, Number(sort) || 0);
    res.json({ ok: true, msg: '已添加栏目', id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ ok: false, msg: '标识已存在，请换一个' }); }
});
app.post('/api/admin/post-categories/:id', auth.authAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { name, value, sort } = req.body || {};
  const n = String(name || '').trim();
  const v = String(value || '').trim().toLowerCase();
  if (!n || !v) return res.status(400).json({ ok: false, msg: '栏目名称和标识不能为空' });
  if (!/^[a-z0-9_]{1,30}$/.test(v)) return res.status(400).json({ ok: false, msg: '标识仅支持小写字母/数字/下划线，最长30位' });
  try {
    const r = db.prepare(`UPDATE post_categories SET name=?, value=?, sort=? WHERE id=?`).run(n, v, Number(sort) || 0, id);
    if (!r.changes) return res.status(404).json({ ok: false, msg: '栏目不存在' });
    res.json({ ok: true, msg: '已保存' });
  } catch (e) { res.status(400).json({ ok: false, msg: '标识已存在，请换一个' }); }
});
app.post('/api/admin/post-categories/:id/delete', auth.authAdmin, (req, res) => {
  const r = db.prepare(`UPDATE post_categories SET status='off' WHERE id=?`).run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ ok: false, msg: '栏目不存在' });
  res.json({ ok: true, msg: '已停用该栏目（不影响历史帖子）' });
});
// 帖子列表（公开，只显示已通过）
app.get('/api/community/posts', (req, res) => {
  const cat = req.query.category;
  let sql = `SELECT p.*, COALESCE(u.nickname,'官方') AS nickname FROM posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.status='approved' AND COALESCE(p.hidden,0)=0`;
  const params = [];
  if (cat && cat !== 'all') { sql += ` AND p.category=?`; params.push(cat); }
  sql += ` ORDER BY p.id DESC LIMIT 100`;
  const list = db.prepare(sql).all(...params);
  list.forEach(p => { try { p.images = JSON.parse(p.images || '[]'); } catch (e) { p.images = []; } try { p.attachment = JSON.parse(p.attachment || '[]'); } catch (e) { p.attachment = []; } });
  res.json({ ok: true, data: list });
});
// 帖子详情（公开；先审后发：非作者只能看已审核通过(approved)的帖子，隐藏帖仅作者本人可见，非本人视为不存在）
app.get('/api/community/posts/:id', auth.optionalUser, (req, res) => {
  const p = db.prepare(`SELECT p.*, u.nickname, u.avatar FROM posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(Number(req.params.id));
  if (!p) return res.status(404).json({ ok: false, msg: '帖子不存在' });
  const mine = p.user_id === (req.user && req.user.id);
  if (p.status !== 'approved' && !mine) return res.status(404).json({ ok: false, msg: '帖子不存在' });
  if (p.hidden && !mine) return res.status(404).json({ ok: false, msg: '帖子不存在' });
  try { p.images = JSON.parse(p.images || '[]'); } catch (e) { p.images = []; }
  try { p.attachment = JSON.parse(p.attachment || '[]'); } catch (e) { p.attachment = []; }
  const comments = db.prepare(`SELECT c.*, u.nickname FROM post_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND c.status='approved' ORDER BY c.id`).all(p.id);
  res.json({ ok: true, data: { ...p, comments } });
});
// 编辑自己的帖子（标题/内容/分类/图片；已通过内容修改后仍通过，驳回内容修改后重新送审）
app.put('/api/community/posts/:id', auth.authUser, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(id);
  if (!p || p.user_id !== req.user.id) return res.status(404).json({ ok: false, msg: '内容不存在' });
  const { title, content, images } = req.body;
  if (!content) return res.status(400).json({ ok: false, msg: '内容不能为空' });
  const cat = String(req.body.category || '').trim();
  if (cat && !db.prepare(`SELECT 1 FROM post_categories WHERE value=? AND status='on'`).get(cat))
    return res.status(400).json({ ok: false, msg: '请选择有效的栏目分类' });
  const hits = hitSensitive((title || '') + content);
  if (hits.length) return res.status(400).json({ ok: false, msg: '内容包含敏感词（' + hits.join('、') + '），请修改后重新发布' });
  const cleanContent = sanitizeHtml(content);
  // 状态流转：已通过保持通过；已驳回改为待审核（重新送审）；待审核保持待审核
  const status = p.status === 'rejected' ? 'pending' : p.status;
  db.prepare(`UPDATE posts SET title=?, content=?, category=?, images=?, status=? WHERE id=?`)
    .run(title || '', cleanContent, cat || p.category, JSON.stringify(images || []), status, id);
  res.json({ ok: true, msg: status === 'approved' ? '修改已保存' : '修改已保存，待管理员审核通过后展示', status });
});
// 隐藏/恢复自己的帖子（隐藏后仅自己可见，不影响审核状态）
app.post('/api/community/posts/:id/hide', auth.authUser, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(id);
  if (!p || p.user_id !== req.user.id) return res.status(404).json({ ok: false, msg: '内容不存在' });
  const hidden = req.body.hidden ? 1 : 0;
  db.prepare(`UPDATE posts SET hidden=? WHERE id=?`).run(hidden, id);
  res.json({ ok: true, msg: hidden ? '已隐藏，仅自己可见' : '已恢复公开' });
});
// 发帖（需登录，仅个人中心"我的动态"调用；栏目分类取自动态栏目配置）
app.post('/api/community/posts', auth.authUser, (req, res) => {
  const { title, content, images, category } = req.body;
  if (!content) return res.status(400).json({ ok: false, msg: '内容不能为空' });
  const cat = String(category || '').trim() || 'works';
  if (!db.prepare(`SELECT 1 FROM post_categories WHERE value=? AND status='on'`).get(cat))
    return res.status(400).json({ ok: false, msg: '请选择有效的栏目分类' });
  const hits = hitSensitive((title || '') + content);
  if (hits.length) return res.status(400).json({ ok: false, msg: '内容包含敏感词（' + hits.join('、') + '），请修改后重新发布' });
  const r = db.prepare(`INSERT INTO posts (user_id, title, content, images, category, status) VALUES (?,?,?,?,?,'pending')`)
    .run(req.user.id, title || '', sanitizeHtml(content), JSON.stringify(images || []), cat);
  res.json({ ok: true, msg: '发布成功，待管理员审核通过后展示', id: r.lastInsertRowid });
});
// 评论（需登录，默认待审核；审核通过后展示并计入评论数）
app.post('/api/community/posts/:id/comment', auth.authUser, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ ok: false, msg: '评论不能为空' });
  const hits = hitSensitive(content);
  if (hits.length) return res.status(400).json({ ok: false, msg: '评论包含敏感词（' + hits.join('、') + '），请修改后重试' });
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ ok: false, msg: '帖子不存在' });
  db.prepare(`INSERT INTO post_comments (post_id, user_id, content, status) VALUES (?,?,?,'pending')`).run(post.id, req.user.id, content);
  res.json({ ok: true, msg: '评论已提交，待管理员审核通过后展示' });
});
// 点赞
// 点赞：必须登录，且每人每帖只能赞一次（post_likes 唯一约束兜底，防刷赞）
app.post('/api/community/posts/:id/like', auth.authUser, (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare(`SELECT id FROM posts WHERE id=?`).get(postId);
  if (!post) return res.status(404).json({ ok: false, msg: '帖子不存在' });
  const r = db.prepare(`INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?,?)`).run(postId, req.user.id);
  if (r.changes === 0) return res.json({ ok: false, msg: '您已点过赞了' });
  db.prepare(`UPDATE posts SET like_count=like_count+1 WHERE id=?`).run(postId);
  res.json({ ok: true, msg: '已点赞' });
});
// 我的帖子
app.get('/api/community/my', auth.authUser, (req, res) => {
  const list = db.prepare(`SELECT * FROM posts WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(req.user.id);
  list.forEach(p => { try { p.images = JSON.parse(p.images || '[]'); } catch (e) { p.images = []; } try { p.attachment = JSON.parse(p.attachment || '[]'); } catch (e) { p.attachment = []; } });
  res.json({ ok: true, data: list });
});
// 撤回自己的待审核内容
app.post('/api/community/posts/:id/retract', auth.authUser, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(id);
  if (!p) return res.status(404).json({ ok: false, msg: '帖子不存在' });
  if (p.user_id !== req.user.id) return res.status(403).json({ ok: false, msg: '只能撤回自己的内容' });
  if (p.status !== 'pending') return res.status(400).json({ ok: false, msg: '仅待审核内容可撤回' });
  db.prepare(`UPDATE posts SET status='deleted' WHERE id=?`).run(id);
  res.json({ ok: true, msg: '已撤回' });
});

// 管理端：帖子审核（状态/分类筛选）
app.get('/api/admin/posts', auth.authAdmin, (req, res) => {
  const status = req.query.status;
  const cat = req.query.category;
  let sql = `SELECT p.*, COALESCE(u.nickname,'官方') AS nickname FROM posts p LEFT JOIN users u ON u.id=p.user_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { sql += ` AND p.status=?`; params.push(status); }
  if (cat && cat !== 'all') { sql += ` AND p.category=?`; params.push(cat); }
  sql += ` ORDER BY p.id DESC LIMIT 300`;
  const list = db.prepare(sql).all(...params);
  list.forEach(p => { try { p.images = JSON.parse(p.images || '[]'); } catch (e) { p.images = []; } try { p.attachment = JSON.parse(p.attachment || '[]'); } catch (e) { p.attachment = []; } });
  res.json({ ok: true, data: list });
});
// 管理端：管理员发帖（官方内容，直接通过展示；栏目分类取自动态栏目配置）
app.post('/api/admin/posts', auth.authAdmin, (req, res) => {
  const { title, content, images, category, attachment } = req.body;
  if (!content) return res.status(400).json({ ok: false, msg: '内容不能为空' });
  const cat = String(category || '').trim() || 'company';
  if (!db.prepare(`SELECT 1 FROM post_categories WHERE value=? AND status='on'`).get(cat))
    return res.status(400).json({ ok: false, msg: '请选择有效的栏目分类' });
  const hits = hitSensitive((title || '') + content);
  if (hits.length) return res.status(400).json({ ok: false, msg: '内容包含敏感词（' + hits.join('、') + '），请修改后发布' });
  const r = db.prepare(`INSERT INTO posts (user_id, title, content, images, attachment, category, status) VALUES (?,?,?,?,?,?,'approved')`)
    .run(0, title || '', sanitizeHtml(content), JSON.stringify(images || []), JSON.stringify(attachment || []), cat); // user_id=0 表示官方发布
  res.json({ ok: true, msg: '发布成功，已直接展示', id: r.lastInsertRowid });
});
app.post('/api/admin/posts/:id/status', auth.authAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE posts SET status=? WHERE id=?`).run(status, Number(req.params.id));
  res.json({ ok: true, msg: '状态已更新' });
});
app.post('/api/admin/posts/:id/delete', auth.authAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE posts SET status='deleted' WHERE id=?`).run(id);
  db.prepare(`UPDATE post_comments SET status='deleted' WHERE post_id=? AND status!='deleted'`).run(id);
  res.json({ ok: true, msg: '帖子已删除，关联评论已一并移除' });
});

// 管理端：评论审核（待审核/通过/驳回/删除）
app.get('/api/admin/comments', auth.authAdmin, (req, res) => {
  const status = req.query.status;
  let sql = `SELECT c.*, u.nickname AS user_name, u.phone AS user_phone, p.title AS post_title
    FROM post_comments c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN posts p ON p.id=c.post_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { sql += ` AND c.status=?`; params.push(status); }
  sql += ` ORDER BY c.id DESC LIMIT 300`;
  res.json({ ok: true, data: db.prepare(sql).all(...params) });
});
app.post('/api/admin/comments/:id/status', auth.authAdmin, (req, res) => {
  const { status } = req.body;
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM post_comments WHERE id=?').get(id);
  if (!c) return res.status(404).json({ ok: false, msg: '评论不存在' });
  db.prepare(`UPDATE post_comments SET status=? WHERE id=?`).run(status, id);
  // 审核通过首次计入评论数；驳回/删除回退计数
  if (status === 'approved' && c.status !== 'approved') db.prepare(`UPDATE posts SET comment_count=comment_count+1 WHERE id=?`).run(c.post_id);
  if (status === 'rejected' && c.status === 'approved') db.prepare(`UPDATE posts SET comment_count=MAX(comment_count-1,0) WHERE id=?`).run(c.post_id);
  res.json({ ok: true, msg: '状态已更新' });
});
app.post('/api/admin/comments/:id/delete', auth.authAdmin, (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM post_comments WHERE id=?').get(id);
  if (!c) return res.status(404).json({ ok: false, msg: '评论不存在' });
  db.prepare(`UPDATE post_comments SET status='deleted' WHERE id=?`).run(id);
  if (c.status === 'approved') db.prepare(`UPDATE posts SET comment_count=MAX(comment_count-1,0) WHERE id=?`).run(c.post_id);
  res.json({ ok: true, msg: '评论已删除' });
});

// 管理端：敏感词库（查看/保存）
app.get('/api/admin/sensitive-words', auth.authAdmin, (req, res) => {
  res.json({ ok: true, data: getSensitiveWords() });
});
app.post('/api/admin/sensitive-words', auth.authAdmin, (req, res) => {
  const { words } = req.body;
  const list = Array.isArray(words)
    ? words.map(w => String(w).trim()).filter(Boolean)
    : String(words || '').split(/[,，\s]+/).map(w => w.trim()).filter(Boolean);
  const dedup = [...new Set(list)];
  db.prepare(`INSERT INTO settings (key, value, remark) VALUES ('sensitive_words', ?, '交流社区敏感词，逗号分隔') ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`)
    .run(dedup.join(','));
  res.json({ ok: true, msg: '敏感词已保存，共 ' + dedup.length + ' 个', data: dedup });
});

// ================= 管理后台 API =================
// ---------- 类目管理 ----------
app.get('/api/admin/categories', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT * FROM categories ORDER BY sort, id`).all();
  res.json({ ok: true, data: list });
});
app.post('/api/admin/categories', auth.authAdmin, (req, res) => {
  const { name, icon, sort } = req.body;
  if (!name) return res.status(400).json({ ok: false, msg: '类目名称必填' });
  const r = db.prepare(`INSERT INTO categories (name, icon, sort) VALUES (?,?,?)`).run(name, icon || '📦', sort || 0);
  res.json({ ok: true, msg: '类目已添加', id: r.lastInsertRowid });
});
app.post('/api/admin/categories/:id', auth.authAdmin, (req, res) => {
  const { name, icon, sort, status } = req.body;
  db.prepare(`UPDATE categories SET name=?, icon=?, sort=?, status=? WHERE id=?`)
    .run(name, icon, sort, status || 'on', Number(req.params.id));
  res.json({ ok: true, msg: '类目已更新' });
});

// ---------- 商品管理 ----------
app.get('/api/admin/courses', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT c.*, cat.name AS category_name FROM courses c LEFT JOIN categories cat ON cat.id=c.category_id ORDER BY c.id DESC LIMIT 300`).all();
  list.forEach(c => {
    try { c.images = JSON.parse(c.images || '[]'); } catch (e) { c.images = []; }
    try { c.group_tiers = JSON.parse(c.group_tiers || '[]'); } catch (e) { c.group_tiers = []; }
    try { c.bargain_config = JSON.parse(c.bargain_config || '{}'); } catch (e) { c.bargain_config = {}; }
  });
  res.json({ ok: true, data: list });
});
app.post('/api/admin/courses', auth.authAdmin, (req, res) => {
  const b = req.body;
  if (!b.title || !b.price) return res.status(400).json({ ok: false, msg: '标题和价格必填' });
  const r = db.prepare(`INSERT INTO courses (title, subtitle, price, original_price, validity, level, type, category_id, cover, images, content, teacher, faq, is_group, group_min, group_discount, is_bargain, stock, status, group_tiers, bargain_config) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(b.title, b.subtitle || '', b.price, b.original_price || null, b.validity || '1year', b.level || String(b.price), b.type || 'course', b.category_id || null, b.cover || null, JSON.stringify(b.images || []), sanitizeHtml(String(b.content || '')), sanitizeHtml(String(b.teacher || '')), b.faq !== undefined ? JSON.stringify(b.faq) : '[]', b.is_group ? 1 : 0, b.group_min || 2, b.group_discount || 0, b.is_bargain ? 1 : 0, b.stock != null ? b.stock : -1, b.status || 'on', JSON.stringify(b.group_tiers || []), JSON.stringify(b.bargain_config || {}));
  res.json({ ok: true, msg: '商品已创建', id: r.lastInsertRowid });
});
app.post('/api/admin/courses/:id', auth.authAdmin, (req, res) => {
  const b = req.body;
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM courses WHERE id=?').get(id);
  if (!c) return res.status(404).json({ ok: false, msg: '商品不存在' });
  db.prepare(`UPDATE courses SET title=?, subtitle=?, price=?, original_price=?, validity=?, level=?, type=?, category_id=?, cover=?, images=?, content=?, teacher=?, faq=?, is_group=?, group_min=?, group_discount=?, is_bargain=?, stock=?, status=?, group_tiers=?, bargain_config=? WHERE id=?`)
    .run(b.title ?? c.title, b.subtitle ?? c.subtitle, b.price ?? c.price, b.original_price !== undefined ? b.original_price : c.original_price, b.validity ?? c.validity, b.level ?? c.level, b.type ?? c.type, b.category_id !== undefined ? b.category_id : c.category_id, b.cover !== undefined ? b.cover : c.cover, b.images !== undefined ? JSON.stringify(b.images) : c.images, b.content !== undefined ? sanitizeHtml(String(b.content)) : c.content, b.teacher !== undefined ? sanitizeHtml(String(b.teacher)) : c.teacher, b.faq !== undefined ? JSON.stringify(b.faq) : c.faq, b.is_group ? 1 : 0, b.group_min ?? c.group_min, b.group_discount ?? c.group_discount, b.is_bargain ? 1 : 0, b.stock !== undefined ? b.stock : c.stock, b.status ?? c.status, b.group_tiers !== undefined ? JSON.stringify(b.group_tiers) : c.group_tiers, b.bargain_config !== undefined ? JSON.stringify(b.bargain_config) : c.bargain_config, id);
  res.json({ ok: true, msg: '商品已更新' });
});
app.post('/api/admin/courses/:id/delete', auth.authAdmin, (req, res) => {
  db.prepare(`UPDATE courses SET status='off' WHERE id=?`).run(Number(req.params.id));
  res.json({ ok: true, msg: '商品已下架' });
});

// ---------- 评价管理 ----------
app.get('/api/admin/reviews', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT r.*, c.title AS course_title, u.nickname, u.phone FROM reviews r LEFT JOIN courses c ON c.id=r.course_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 300`).all();
  res.json({ ok: true, data: list });
});
app.post('/api/admin/reviews/:id', auth.authAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM reviews WHERE id=?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ ok: false, msg: '评价不存在' });
  const status = req.body.status === 'off' ? 'off' : 'on';
  db.prepare(`UPDATE reviews SET status=? WHERE id=?`).run(status, r.id);
  res.json({ ok: true, msg: status === 'off' ? '已隐藏该评价' : '已恢复展示' });
});

// ---------- 学习任务管理（查看+点评） ----------
app.get('/api/admin/learning-tasks', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT t.*, u.nickname, u.phone FROM learning_tasks t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 300`).all();
  res.json({ ok: true, data: list });
});
app.post('/api/admin/learning-tasks/:id', auth.authAdmin, (req, res) => {
  const { teacherComment, status } = req.body;
  const t = db.prepare('SELECT * FROM learning_tasks WHERE id=?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ ok: false, msg: '任务不存在' });
  db.prepare(`UPDATE learning_tasks SET teacher_comment=?, status=? WHERE id=?`)
    .run(teacherComment !== undefined ? teacherComment : t.teacher_comment, status || 'reviewed', t.id);
  res.json({ ok: true, msg: '已点评' });
});

// ---------- 配置参数 ----------
// 后台参数配置：补充无 remark 配置项的中文名称（兼容运行时动态写入的 key）
const SETTING_LABEL = {
  group_price_tiers: '拼团分档配置',
  jwt_secret: 'JWT 签名密钥',
  last_daily_check_date: '上次每日考核日期',
  last_settle_month: '上月待遇结算月份',
  sensitive_words: '社区敏感词库',
};
app.get('/api/admin/settings', auth.authAdmin, (req, res) => {
  // 支付相关参数走专用「支付配置」接口（含敏感密钥，不做通用展示）
  const rows = db.prepare(`SELECT * FROM settings WHERE key NOT LIKE 'wxpay_%' AND key != 'pay_mode'`).all();
  rows.forEach(r => { if (!r.remark) r.remark = SETTING_LABEL[r.key] || r.key; });
  res.json({ ok: true, data: rows });
});
app.post('/api/admin/settings', auth.authAdmin, (req, res) => {
  const { key, value } = req.body;
  if (!key || key === 'pay_mode' || String(key).startsWith('wxpay_')) {
    return res.status(400).json({ ok: false, msg: '该配置项请在「支付配置」页面管理' });
  }
  // 修复：按配置类型存储，禁止无条件 Number() 强转（字符串/开关配置会被写坏为 NaN）
  const f = MARKETING_GROUPS.flatMap(g => g.fields).find(x => x.key === key);
  let v;
  if (f) {
    if (f.type === 'switch') v = (value === true || value === 1 || value === '1' || value === 'on') ? 1 : 0;
    else if (f.type === 'array') { try { v = Array.isArray(value) ? value : String(value).split(/[,，]/).map(s => s.trim()).filter(Boolean); } catch (e) { return res.status(400).json({ ok: false, msg: '数组配置格式错误' }); } }
    else if (f.type === 'select') v = String(value);
    else { v = Number(value); if (isNaN(v)) return res.status(400).json({ ok: false, msg: f.label + ' 须为数字' }); }
  } else {
    v = String(value); // 非营销元数据配置按原样保存
  }
  db.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`)
    .run(key, JSON.stringify({ v }));
  res.json({ ok: true, msg: '配置已更新' });
});

// 修改管理后台路径前缀（防破解）：保存后旧 /admin 路径立即失效，需用新路径访问
app.post('/api/admin/prefix', auth.authAdmin, (req, res) => {
  const raw = String((req.body || {}).prefix || '').trim();
  const p = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'admin';
  if (p.length < 2) return res.status(400).json({ ok: false, msg: '前缀至少2位字符（字母/数字/下划线/中划线）' });
  if (p === 'login') return res.status(400).json({ ok: false, msg: '该前缀不可用，请换一个' });
  db.prepare(`INSERT INTO settings (key, value) VALUES ('admin_prefix',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`)
    .run(JSON.stringify({ v: p }));
  res.json({ ok: true, msg: p === 'admin' ? '后台路径已恢复为 /admin' : ('后台路径已更新为 /' + p + '，默认 /admin 已失效。请立即使用新地址访问后台'), prefix: p });
});

// ---------- 营销参数（分组可视化管理） ----------
// 营销参数元数据：type = number数字 / percent比例(0-1) / switch开关 / array数组
const MARKETING_GROUPS = [
  {
    group: 'price', label: '课程价格体系',
    fields: [
      { key: 'price_499', label: '基础班价格', type: 'number', unit: '元', hint: '对应课程档位 499' },
      { key: 'price_1299', label: '进阶班价格', type: 'number', unit: '元', hint: '对应课程档位 1299' },
      { key: 'price_2999', label: '终身班价格', type: 'number', unit: '元', hint: '对应课程档位 2999' },
    ],
  },
  {
    group: 'commission', label: '介绍奖励（梯度）',
    fields: [
      { key: 'direct_499', label: '499 档介绍奖', type: 'number', unit: '元', hint: '推荐人每单立得，可提现' },
      { key: 'direct_1299', label: '1299 档介绍奖', type: 'number', unit: '元', hint: '推荐人每单立得，可提现' },
      { key: 'direct_2999', label: '2999 档介绍奖', type: 'number', unit: '元', hint: '推荐人每单立得，可提现' },
      { key: 'require_paid_referrer', label: '奖励资格：推荐人须已付费', type: 'switch', hint: '开=推荐人须先购课升级(付费)才可获得奖励' },
    ],
  },
  {
    group: 'help', label: '培育奖',
    fields: [
      { key: 'help_reward', label: '培育奖全额', type: 'number', unit: '元', hint: '前N名名额全部孵化合格后发放(每组固定此金额)' },
      { key: 'help_reward_half', label: '培育奖半额', type: 'number', unit: '元', hint: '见习管培生收益减半时使用' },
      { key: 'help_advance', label: '培育奖预发机制', type: 'switch', hint: '开=启用预发机制' },
      { key: 'help_bonus_per_order', label: '主理人培育奖', type: 'number', unit: '元', hint: '名下管培生每介绍1名付费分享学员，主理人得此奖励' },
    ],
  },
  {
    group: 'assessment', label: '管培生考核规则（滚动周期）',
    fields: [
      { key: 'trainee_cycle_days', label: '考核滚动周期', type: 'number', unit: '天', hint: '从成为管培生(join_at)起算，每N天为一个完整考核周期；每个管培生独立滚动，不按自然月，不满一个完整周期不考核（保护月中/月底新加入成员）' },
      { key: 'qualify_perf', label: '合格业绩门槛', type: 'number', unit: '元', hint: '单个考核周期内业绩≥该值判定合格' },
      { key: 'qualify_orders', label: '合格单数门槛', type: 'number', unit: '单', hint: '单个考核周期内单数≥该值判定合格' },
      { key: 'clear_months', label: '连续零业绩清退周期数', type: 'number', unit: '个周期', hint: '连续N个完整考核周期零业绩自动清退（默认2）' },
      { key: 'slot_limit', label: '孵化考核名额数', type: 'number', unit: '名', hint: '主理人名下前N名计孵化名额（参与补位/培育奖），其后学员终身绑定' },
      { key: 'probation_half', label: '见习收益减半', type: 'switch', hint: '开=见习管培生介绍奖/待遇减半' },
    ],
  },
  {
    group: 'reserve', label: '名额补位 & 学习圈待遇',
    fields: [
      { key: 'reserve_days', label: '补位时效', type: 'number', unit: '天', hint: '名额冻结后须在N天内补位，逾期永久作废' },
      { key: 'reserve_max', label: '单名额最大补位次数', type: 'number', unit: '次', hint: '超过后名额永久终止' },
      { key: 'leader_pause_months', label: '主理人待遇暂停月数', type: 'number', unit: '个月', hint: '连续N个月无合格管培生/学习圈业绩则暂停待遇' },
      { key: 'leader_rate', label: '主理人待遇比例', type: 'percent', unit: '(0~1)', hint: '管培生工资(奖励收入)的福利比例，如 0.1=10%；建议谨慎调高' },
      { key: 'leader_rate_base', label: '待遇基数口径', type: 'select', options: [{ v: 'commission', label: '奖励收入(工资)' }, { v: 'sales', label: '销售额' }], hint: '奖励收入=该管培生当月实得介绍奖+培育奖等工资性收入(推荐)；销售额=该管培生当月成交业绩(一般不建议)' },
      { key: 'allowance_freeze', label: '待遇冻结/恢复机制', type: 'switch', hint: '开=启用冻结与恢复' },
      { key: 'commission_freeze_days', label: '介绍奖励冻结期', type: 'number', unit: '天', hint: '奖励发放后N天内不可提现(防退款)，0=即时到账' },
    ],
  },
  {
    group: 'tools', label: '营销工具（打卡/任务/抵用）',
    fields: [
      { key: 'checkin_reward', label: '单次打卡抵现金额', type: 'number', unit: '元' },
      { key: 'checkin_daily_limit', label: '每日打卡上限', type: 'number', unit: '次' },
      { key: 'task_reward', label: '单次学习任务奖励', type: 'number', unit: '元' },
      { key: 'coupon_expire_days', label: '抵现金过期周期', type: 'number', unit: '天', hint: '0=不过期' },
      { key: 'withdraw_min', label: '单笔提现最低金额', type: 'number', unit: '元', hint: '提现申请金额须≥该值' },
      { key: 'trial_subjects', label: '体验课可选科目', type: 'array', hint: '多个科目用逗号分隔' },
      { key: 'trial_slots', label: '体验课可选时段', type: 'array', hint: '多个时段用逗号分隔' },
    ],
  },
  {
    group: 'group_bargain', label: '拼团 & 砍价',
    fields: [
      { key: 'group_min', label: '默认拼团人数', type: 'number', unit: '人' },
      { key: 'group_hours', label: '拼团时长', type: 'number', unit: '小时' },
      { key: 'group_price_tiers', label: '拼团档位价（人数:价格，逗号分隔）', type: 'array', hint: '如 2:599,3:549,5:499,8:399。填写后开团时客户可按人数档位选择，每档对应不同拼团价；留空则退回固定抵扣' },
      { key: 'bargain_max_helps', label: '砍价最大帮砍人数', type: 'number', unit: '人' },
      { key: 'bargain_floor_rate', label: '砍价底价比例', type: 'percent', unit: '(0~1)', hint: '如 0.5=最低可砍至原价50%' },
      { key: 'bargain_hours', label: '砍价有效期', type: 'number', unit: '小时' },
      { key: 'bargain_price_tiers', label: '砍价档位价（帮砍人数:价格，逗号分隔）', type: 'array', hint: '如 2:599,5:549,10:499,15:449,20:399。达到对应帮砍人数即可按该档价格购买；留空则不启用分档' },
      { key: 'bargain_step_reduce', label: '砍价每增加1人减价', type: 'number', unit: '元', hint: '如 10=每多1人帮砍减10元（与档位价二选一，填写档位价时此项忽略），0=不使用' },
    ],
  },
];

app.get('/api/admin/marketing-config', auth.authAdmin, (req, res) => {
  const data = MARKETING_GROUPS.map(g => ({
    ...g,
    fields: g.fields.map(f => {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(f.key);
      let value = null;
      if (row) { try { value = JSON.parse(row.value).v; } catch (e) {} }
      return { ...f, value };
    }),
  }));
  res.json({ ok: true, data });
});

app.post('/api/admin/marketing-config', auth.authAdmin, (req, res) => {
  const b = req.body || {};
  const errs = [];
  let count = 0;
  const validKeys = new Set();
  for (const g of MARKETING_GROUPS) for (const f of g.fields) validKeys.add(f.key);
  for (const key of Object.keys(b)) {
    if (!validKeys.has(key)) continue;
    const f = MARKETING_GROUPS.flatMap(g => g.fields).find(x => x.key === key);
    const raw = b[key];
    let v;
    if (f.type === 'switch') {
      v = (raw === true || raw === 1 || raw === '1' || raw === 'on') ? 1 : 0;
    } else if (f.type === 'percent') {
      v = Number(raw);
      if (isNaN(v) || v < 0 || v > 1) { errs.push(`${f.label} 须为 0~1 的小数`); continue; }
    } else if (f.type === 'array') {
      try { v = Array.isArray(raw) ? raw : String(raw).split(/[,，]/).map(s => s.trim()).filter(Boolean); } catch (e) { errs.push(`${f.label} 格式错误`); continue; }
    } else {
      v = Number(raw);
      if (isNaN(v)) { errs.push(`${f.label} 须为数字`); continue; }
    }
    db.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`)
      .run(f.key, JSON.stringify({ v }));
    count++;
  }
  res.json({
    ok: true,
    msg: errs.length ? `已保存 ${count} 项，${errs.length} 项未通过校验：${errs.join('；')}` : `已保存 ${count} 项配置，实时生效`,
    errors: errs,
  });
});

// 用户列表（has_password 用于前端判断是否显示"设置/重置密码"）
app.get('/api/admin/users', auth.authAdmin, (req, res) => {
  const kw = String((req.query || {}).kw || '').trim();
  const cols = `id, phone, nickname, identity, role, is_paid, product_type, month_orders, month_perf, referrer_id, created_at, (password_hash IS NOT NULL AND password_hash!='') AS has_password`;
  let list;
  if (kw) {
    list = db.prepare(`SELECT ${cols} FROM users WHERE phone LIKE ? OR nickname LIKE ? ORDER BY id DESC LIMIT 200`)
      .all('%' + kw + '%', '%' + kw + '%');
  } else {
    list = db.prepare(`SELECT ${cols} FROM users ORDER BY id DESC LIMIT 200`).all();
  }
  res.json({ ok: true, data: list });
});

// 记录推荐关系绑定变更日志（后台管理员 或 用户端自助操作）
function logRebind({ operator, operatorType, user, oldReferrer, newReferrer, action, note }) {
  db.prepare(`INSERT INTO rebind_logs
    (operator, operator_type, user_id, user_name, old_referrer_id, old_referrer_name, new_referrer_id, new_referrer_name, action, note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(
      operator, operatorType,
      user.id, user.nickname,
      oldReferrer ? oldReferrer.id : null, oldReferrer ? oldReferrer.nickname : null,
      newReferrer ? newReferrer.id : null, newReferrer ? newReferrer.nickname : null,
      action, note || ''
    );
}

// 手动更改推荐关系绑定关系（解绑 / 重新绑定）——管理员
app.post('/api/admin/rebind', auth.authAdmin, (req, res) => {
  const { userId, newReferrerId, note } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, msg: '请填写要操作的学员用户ID' });

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user) return res.status(400).json({ ok: false, msg: '学员用户不存在' });
  if (user.is_admin === 1 || user.role === 'admin') return res.status(400).json({ ok: false, msg: '不能更改管理员的绑定关系' });

  const oldReferrerId = user.referrer_id;
  let oldReferrer = null;
  if (oldReferrerId) oldReferrer = db.prepare('SELECT id, nickname, phone, identity FROM users WHERE id=?').get(oldReferrerId);

  // 解绑：不指定新推荐人 → 清除 referrer_id
  if (!newReferrerId) {
    db.prepare(`UPDATE users SET referrer_id=NULL WHERE id=?`).run(userId);
    // 同步清除顶级主理人标记
    db.prepare(`UPDATE users SET top_leader_id=NULL WHERE id=?`).run(userId);
    logRebind({
      operator: req.adminName, operatorType: 'admin',
      user, oldReferrer, newReferrer: null, action: 'unbind', note,
    });
    return res.json({
      ok: true, msg: '已解绑',
      data: {
        user: { id: user.id, nickname: user.nickname },
        oldReferrer: oldReferrer ? { id: oldReferrer.id, nickname: oldReferrer.nickname } : null,
        newReferrer: null,
      },
    });
  }

  // 重新绑定
  const newRef = db.prepare('SELECT * FROM users WHERE id=?').get(newReferrerId);
  if (!newRef) return res.status(400).json({ ok: false, msg: '新的推荐人用户不存在' });
  if (newRef.id === userId) return res.status(400).json({ ok: false, msg: '不能把自己绑定为自己' });
  if (newRef.is_admin === 1 || newRef.role === 'admin') return res.status(400).json({ ok: false, msg: '管理员不能作为好友推荐人' });

  // 防循环：沿新推荐人的介绍人链向上追溯，若出现当前用户则构成循环
  let walkId = newReferrerId;
  const visited = new Set();
  let cycle = false;
  while (walkId && walkId !== userId) {
    if (visited.has(walkId)) break; // 既有关系本身已含环，终止
    visited.add(walkId);
    const parent = db.prepare('SELECT referrer_id FROM users WHERE id=?').get(walkId);
    if (!parent || !parent.referrer_id) break;
    walkId = parent.referrer_id;
    if (walkId === userId) { cycle = true; break; }
  }
  if (cycle) return res.status(400).json({ ok: false, msg: '不能绑定为自己的好友，否则会产生循环绑定' });

  db.prepare(`UPDATE users SET referrer_id=? WHERE id=?`).run(newReferrerId, userId);
  // 同步顶级主理人标记（重新绑定后暂时置空，由后续结算逻辑重算）
  db.prepare(`UPDATE users SET top_leader_id=NULL WHERE id=?`).run(userId);

  logRebind({
    operator: req.adminName, operatorType: 'admin',
    user, oldReferrer, newReferrer: newRef, action: 'rebind', note,
  });

  return res.json({
    ok: true, msg: '已重新绑定',
    data: {
      user: { id: user.id, nickname: user.nickname },
      oldReferrer: oldReferrer ? { id: oldReferrer.id, nickname: oldReferrer.nickname } : null,
      newReferrer: { id: newRef.id, nickname: newRef.nickname },
    },
  });
});

// 转绑定记录（管理员查看，含操作人身份/时间/备注）
app.get('/api/admin/rebind-logs', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT * FROM rebind_logs ORDER BY id DESC LIMIT 200`).all();
  res.json({ ok: true, data: list });
});

// 管培生列表
app.get('/api/admin/trainees', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT t.*, u.nickname FROM trainees t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200`).all();
  res.json({ ok: true, data: list });
});

// 订单列表（支持按状态筛选 / 关键词搜索 + 统计）
app.get('/api/admin/orders', auth.authAdmin, (req, res) => {
  const { status, kw } = req.query;
  let sql = `SELECT o.*, u.nickname, u.phone FROM orders o LEFT JOIN users u ON u.id=o.user_id`;
  const cond = [];
  const params = [];
  if (status && status !== 'all') { cond.push(`o.status=?`); params.push(status); }
  if (kw) {
    cond.push(`(o.order_no LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ? OR o.product_type LIKE ?)`);
    const like = `%${kw}%`;
    params.push(like, like, like, like);
  }
  if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
  sql += ' ORDER BY o.id DESC LIMIT 300';
  const list = db.prepare(sql).all(...params);
  const stats = {
    total: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders`).get(),
    pending: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders WHERE status='pending'`).get(),
    paid: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders WHERE status='paid'`).get(),
    closed: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders WHERE status='closed'`).get(),
    refunded: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders WHERE status='refunded'`).get(),
  };
  res.json({ ok: true, data: { list, stats } });
});

// 管理端：关闭待支付订单（用户未完成支付时运营可代关闭）
app.post('/api/admin/orders/:id/close', auth.authAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(req.params.id));
  if (!order) return res.status(400).json({ ok: false, msg: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ ok: false, msg: '仅待支付订单可关闭' });
  db.prepare(`UPDATE orders SET status='closed', closed_at=datetime('now','localtime') WHERE id=?`).run(order.id);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`).run(order.order_no, 'close', '管理员关闭');
  res.json({ ok: true, msg: '订单已关闭' });
});

// 管理端：确认线下已收款（manual 模式核心）——确认后立即结算全部业务（开通课程/分享身份/名额/介绍奖/管培生业绩/培育奖）
app.post('/api/admin/orders/:id/confirm-pay', auth.authAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(req.params.id));
  if (!order) return res.status(400).json({ ok: false, msg: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ ok: false, msg: '仅待收款订单可确认已收款' });
  const { payType, note } = req.body || {};
  const pt = ['wechat', 'alipay', 'bank'].includes(payType) ? payType : 'wechat';
  const result = settlePaidOrder(order);
  db.prepare(`UPDATE orders SET pay_type=? WHERE id=?`).run(pt, order.id);
  db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
    .run(order.order_no, 'admin_confirm', JSON.stringify({ payType: pt, note: note || '', admin: req.adminName || 'admin' }));
  res.json({
    ok: true,
    msg: result.bizMsg ? ('已确认收款，' + result.bizMsg) : '已确认收款，订单开通完成，相关奖励/名额/培育奖励已结算',
    data: { ...result, payType: pt, note: note || '' },
  });
});

// 订单退款（回滚介绍奖励 + 主理人培育奖 + 冲减管培生业绩）
app.post('/api/admin/orders/:id/refund', auth.authAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(400).json({ ok: false, msg: '订单不存在' });
  if (order.status === 'refunded') return res.status(400).json({ ok: false, msg: '该订单已是退款状态' });
  if (order.status === 'pending') return res.status(400).json({ ok: false, msg: '该订单尚未支付，请直接关闭订单' });
  const { note } = req.body || {};
  // 事务包裹：标记退款/奖励回滚/培育奖回滚/业绩冲减/资格恢复原子执行
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE orders SET status='refunded' WHERE id=?`).run(order.id);
    // 0. 统一写入退款对账日志（无论是否使用抵用券，均留痕）
    db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
      .run(order.order_no, 'refund', JSON.stringify({ reason: note || '订单退款', amount: order.amount, order_id: order.id }));
    // 1. 退回订单使用的抵用券（实付=原价-抵用券，退款须全额退回抵用券+流水记账）
    if (order.coupon_used > 0) {
      db.prepare(`UPDATE coupons SET balance=balance+? WHERE user_id=?`).run(order.coupon_used, order.user_id);
      const c2 = db.prepare(`SELECT balance FROM coupons WHERE user_id=?`).get(order.user_id) || { balance: 0 };
      db.prepare(`INSERT INTO coupon_flows (user_id, change_amount, balance_after, type, remark) VALUES (?,?,?,?,?)`)
        .run(order.user_id, order.coupon_used, c2.balance, 'refund', '订单退款，抵用券退回');
    }
    // 1. 回滚该订单已发放的介绍奖励（标记 refunded，不再计入收益）
    const rollback = db.prepare(`UPDATE direct_commissions SET status='refunded' WHERE order_id=? AND status!='refunded'`).run(order.id);
    // 2. 回滚该订单产生的主理人培育奖
    const bonusRollback = db.prepare(`UPDATE help_bonuses SET status='refunded' WHERE order_id=? AND status!='refunded'`).run(order.id);
    // 3. 冲减管培生业绩（买家自购 + 推荐人介绍各冲减一笔）
    let perfRollback = 0;
    const pay = order.amount;
    if (pay > 0) {
      const buyerT = db.prepare(`SELECT id FROM trainees WHERE user_id=? AND in_pool=1`).get(order.user_id);
      if (buyerT) { db.prepare(`UPDATE trainees SET month_perf=MAX(0,month_perf-?), month_orders=MAX(0,month_orders-1) WHERE id=?`).run(pay, buyerT.id); perfRollback++; }
      if (order.referrer_id) {
        const refT = db.prepare(`SELECT id FROM trainees WHERE user_id=? AND in_pool=1`).get(order.referrer_id);
        if (refT) { db.prepare(`UPDATE trainees SET month_perf=MAX(0,month_perf-?), month_orders=MAX(0,month_orders-1) WHERE id=?`).run(pay, refT.id); perfRollback++; }
      }
    }
    // 3.5 撤销用户付费资格：退款后无其他有效付费订单则恢复未付费状态（我的课程/身份按订单状态自动失效）
    const otherPaid = db.prepare(`SELECT COUNT(*) c FROM orders WHERE user_id=? AND status='paid' AND id<>?`).get(order.user_id, order.id).c;
    if (otherPaid === 0) {
      db.prepare(`UPDATE users SET is_paid=0, product_type=NULL WHERE id=?`).run(order.user_id);
    }
    // 4. 结算后风险提示：若该订单对应名额已结算过待遇/培育奖，退款后需人工冲正（奖励与培育奖已自动回滚，待遇无法按订单追溯）
    let settledRisk = null;
    const buyerT2 = db.prepare(`SELECT id FROM trainees WHERE user_id=? AND in_pool=1`).get(order.user_id);
    if (buyerT2) {
      const laCnt = db.prepare(`SELECT COUNT(*) c FROM leader_allowances WHERE trainee_id=? AND status='paid'`).get(buyerT2.id).c;
      const hrCnt = db.prepare(`SELECT COUNT(*) c FROM help_rewards WHERE newbie_id=? AND status='paid'`).get(order.user_id).c;
      if (laCnt > 0 || hrCnt > 0) {
        settledRisk = { leaderAllowances: laCnt, helpRewards: hrCnt };
        db.prepare(`INSERT INTO pay_logs (order_no, event, payload) VALUES (?,?,?)`)
          .run(order.order_no, 'refund_after_settle', JSON.stringify({ reason: '订单在结算后退款，涉及已发放待遇/培育奖，需人工核对冲正', ...settledRisk, note: note || '' }));
      }
    }
    db.exec('COMMIT');
    const baseMsg = '已标记退款，介绍奖励与培育奖已回滚，管培生业绩已冲减，用户付费资格已同步调整';
    const riskMsg = settledRisk ? `。注意：该订单对应名额已结算待遇/培育奖（${settledRisk.leaderAllowances}笔待遇、${settledRisk.helpRewards}笔培育奖），已写入对账日志，请人工核对冲正！` : '';
    res.json({ ok: true, msg: baseMsg + riskMsg, rollback: rollback.changes, bonusRollback: bonusRollback.changes, perfRollback, settledRisk });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (e2) { /* 已回滚 */ }
    throw e;
  }
});

// ---------- 管理端：支付网关配置读写（含敏感密钥，仅管理员可见） ----------
const PAY_CONFIG_KEYS = ['pay_mode', 'wxpay_appid', 'wxpay_appsecret', 'wxpay_mchid', 'wxpay_api_v3_key', 'wxpay_apiclient_serial', 'wxpay_apiclient_key', 'wxpay_notify_url', 'wxpay_platform_pub', 'pay_receive_wechat_qr', 'pay_receive_wechat_account', 'pay_receive_alipay_qr', 'pay_receive_alipay_account', 'pay_receive_bank_name', 'pay_receive_bank_account', 'pay_receive_bank_holder', 'pay_receive_notice'];
app.get('/api/admin/pay-config', auth.authAdmin, (req, res) => {
  const ph = PAY_CONFIG_KEYS.map(() => '?').join(',');
  const rows = db.prepare(`SELECT key, value, remark FROM settings WHERE key IN (${ph})`).all(...PAY_CONFIG_KEYS);
  const data = {};
  rows.forEach(r => {
    let v = null;
    try { v = JSON.parse(r.value).v; } catch (e) { v = r.value; }
    data[r.key] = { value: v, remark: r.remark };
  });
  // 敏感字段脱敏返回：已填写的显示为占位符，避免明文回显
  for (const k of ['wxpay_appsecret', 'wxpay_api_v3_key', 'wxpay_apiclient_key', 'wxpay_platform_pub']) {
    if (data[k] && data[k].value) data[k].filled = true;
  }
  data._configured = wxpay.isConfigured();
  data._mode = wxpay.getPayMode();
  res.json({ ok: true, data });
});
app.post('/api/admin/pay-config', auth.authAdmin, (req, res) => {
  const b = req.body || {};
  const secretKeys = ['wxpay_appsecret', 'wxpay_api_v3_key', 'wxpay_apiclient_key', 'wxpay_platform_pub'];
  for (const k of PAY_CONFIG_KEYS) {
    if (!(k in b)) continue;
    if (k === 'pay_mode' && !['manual', 'mock', 'wxpay'].includes(b[k])) continue;
    const v = String(b[k] ?? '');
    // 敏感字段留空 = 保持不变，避免误覆盖已填写的密钥
    if (v === '' && secretKeys.includes(k)) {
      const cur = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
      if (cur) { try { if (JSON.parse(cur.value).v) continue; } catch (e) {} }
    }
    db.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`)
      .run(k, JSON.stringify({ v }));
  }
  const ok = wxpay.isConfigured();
  res.json({ ok: true, msg: ok ? '支付配置已保存，参数完整，可切换微信支付模式' : '支付配置已保存，但参数尚未完整（微信支付模式下将自动回落模拟支付）' });
});

// 拼团活动管理列表
app.get('/api/admin/groups', auth.authAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT g.*, c.title AS course_title FROM group_orders g LEFT JOIN courses c ON c.id=g.course_id`;
  const params = [];
  if (status && status !== 'all') { sql += ' WHERE g.status=?'; params.push(status); }
  sql += ' ORDER BY g.id DESC LIMIT 200';
  const list = db.prepare(sql).all(...params);
  const withMembers = list.map(g => {
    const members = db.prepare(`SELECT m.*, u.nickname, u.phone, u.avatar FROM group_members m LEFT JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.id ASC`).all(g.id);
    return { ...g, members, memberCount: members.length };
  });
  res.json({ ok: true, data: withMembers });
});

// 砍价活动管理列表
app.get('/api/admin/bargains', auth.authAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT b.*, c.title AS course_title FROM bargains b LEFT JOIN courses c ON c.id=b.course_id`;
  const params = [];
  if (status && status !== 'all') { sql += ' WHERE b.status=?'; params.push(status); }
  sql += ' ORDER BY b.id DESC LIMIT 200';
  const list = db.prepare(sql).all(...params);
  const withHelpers = list.map(b => {
    const helps = db.prepare(`SELECT h.*, u.nickname FROM bargain_helps h LEFT JOIN users u ON u.id=h.user_id WHERE h.bargain_id=? ORDER BY h.id ASC`).all(b.id);
    return { ...b, helpsList: helps };
  });
  res.json({ ok: true, data: withHelpers });
});

// 手动执行补位
app.post('/api/admin/fill-reserve', auth.authAdmin, (req, res) => {
  const { traineeId, newUserId } = req.body;
  const r = engine.fillReserve(traineeId, newUserId ? Number(newUserId) : null);
  res.json(r);
});

// 手动发放培育奖
app.post('/api/admin/pay-help-reward', auth.authAdmin, (req, res) => {
  const { mentorId } = req.body;
  const r = engine.payHelpReward(mentorId);
  res.json(r);
});

// 手动执行每日检测/待遇结算（用于测试）
app.post('/api/admin/run-daily-check', auth.authAdmin, (req, res) => {
  engine.dailyCheck();
  engine.evaluateHelpRewards();
  engine.settleLeaderAllowance();
  res.json({ ok: true, msg: '已执行考核检测+待遇结算' });
});

// 手动清理过期营销活动（超时拼团→失败、过期砍价→过期）
app.post('/api/admin/marketing/cleanup', auth.authAdmin, (req, res) => {
  const r = engine.cleanupMarketing();
  res.json({ ok: true, msg: `已清理：${r.expiredGroups} 个超时拼团、${r.expiredBargains} 个过期砍价` });
});

// ---------- 奖励流水明细（管理端） ----------
// 主理人培育奖流水（成员每介绍1名付费分享学员，主理人得固定奖励）
app.get('/api/admin/help-bonuses', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT h.*, m.nickname AS mentor_name, m.phone AS mentor_phone, r.nickname AS referrer_name, r.phone AS referrer_phone
    FROM help_bonuses h
    LEFT JOIN users m ON m.id=h.mentor_id
    LEFT JOIN users r ON r.id=h.referrer_id
    ORDER BY h.id DESC LIMIT 300`).all();
  const stats = db.prepare(`SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM help_bonuses WHERE status='paid'`).get();
  res.json({ ok: true, data: { list, stats } });
});
// 介绍奖励流水（支持状态/关键词筛选 + 统计）
app.get('/api/admin/commissions', auth.authAdmin, (req, res) => {
  const { status, kw } = req.query;
  let sql = `SELECT c.*, r.nickname AS referrer_name, r.phone AS referrer_phone, u.nickname AS user_name, u.phone AS user_phone
             FROM direct_commissions c LEFT JOIN users r ON r.id=c.referrer_id LEFT JOIN users u ON u.id=c.user_id`;
  const cond = [];
  const params = [];
  if (status && status !== 'all') { cond.push(`c.status=?`); params.push(status); }
  if (kw) {
    cond.push(`(r.nickname LIKE ? OR r.phone LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ? OR c.product_type LIKE ?)`);
    const like = `%${kw}%`;
    params.push(like, like, like, like, like);
  }
  if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
  sql += ' ORDER BY c.id DESC LIMIT 500';
  const list = db.prepare(sql).all(...params);
  const stats = {
    paid: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM direct_commissions WHERE status='paid'`).get(),
    refunded: db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM direct_commissions WHERE status='refunded'`).get(),
  };
  res.json({ ok: true, data: { list, stats } });
});

// 主理人10%待遇流水
app.get('/api/admin/allowances', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT a.*, l.nickname AS leader_name, u.nickname AS trainee_name
    FROM leader_allowances a
    LEFT JOIN users l ON l.id=a.leader_id
    LEFT JOIN users u ON u.id=a.trainee_id
    ORDER BY a.id DESC LIMIT 500`).all();
  const stats = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM leader_allowances WHERE status='paid'`).get();
  res.json({ ok: true, data: { list, stats } });
});

// 培育奖流水
app.get('/api/admin/help-rewards', auth.authAdmin, (req, res) => {
  const list = db.prepare(`SELECT h.*, m.nickname AS mentor_name, u.nickname AS newbie_name, u.phone AS newbie_phone
    FROM help_rewards h
    LEFT JOIN users m ON m.id=h.mentor_id
    LEFT JOIN users u ON u.id=h.newbie_id
    ORDER BY h.id DESC LIMIT 500`).all();
  const stats = db.prepare(`SELECT COUNT(DISTINCT referrer_id) c FROM help_rewards WHERE status='paid'`).get();
  res.json({ ok: true, data: { list, stats } });
});

// 分享分析
app.get('/api/admin/fission', auth.authAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const promoters = db.prepare(`SELECT COUNT(*) c FROM users WHERE identity='promoter'`).get().c;
  const paid = db.prepare(`SELECT COUNT(*) c FROM users WHERE is_paid=1`).get().c;
  const referralCount = db.prepare(`SELECT COUNT(*) c FROM users WHERE referrer_id IS NOT NULL`).get().c;
  const totalDirect = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM direct_commissions WHERE status='paid'`).get().s;
  const totalAllowance = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM leader_allowances`).get().s;
  const totalHelp = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM coupon_flows WHERE type='reward'`).get().s;
  res.json({ ok: true, data: { totalUsers, promoters, paid, referralCount, totalDirect, totalAllowance, totalHelp } });
});

// ---------- 数据导出（CSV） ----------
function toCsv(headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  };
  const head = headers.map(h => esc(h.label)).join(',');
  const body = rows.map(r => headers.map(h => esc(r[h.key])).join(','));
  return '\ufeff' + [head, ...body].join('\n');
}
app.get('/api/admin/export/:type', auth.authAdmin, (req, res) => {
  const type = req.params.type;
  const today = new Date().toISOString().slice(0, 10);
  let headers = [], rows = [];
  const orderStatus = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' };
  const commStatus = { paid: '已发放', refunded: '已回滚' };
  const traineeStatus = { qualified: '合格', probation: '见习', invalid: '失效', cleared: '已清退', pending: '待定' };
  const slotStatus = { normal: '正常', frozen: '冻结待补位', void: '永久作废' };
  const reviewStatus = { on: '展示中', off: '已隐藏' };

  if (type === 'orders') {
    headers = [
      { key: 'id', label: '订单ID' }, { key: 'order_no', label: '订单号' },
      { key: 'nickname', label: '学员昵称' }, { key: 'phone', label: '手机号' },
      { key: 'product_type', label: '产品档位' }, { key: 'amount', label: '实付金额' },
      { key: 'coupon_used', label: '抵用券抵扣' }, { key: 'pay_type', label: '支付方式' },
      { key: 'referrer_id', label: '推荐人ID' }, { key: 'status', label: '状态' },
      { key: 'created_at', label: '下单时间' },
    ];
    rows = db.prepare(`SELECT o.*, u.nickname, u.phone FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`).all()
      .map(r => ({ ...r, status: orderStatus[r.status] || r.status }));
  } else if (type === 'commissions') {
    headers = [
      { key: 'id', label: 'ID' }, { key: 'order_id', label: '订单ID' },
      { key: 'referrer_name', label: '推荐人' }, { key: 'referrer_phone', label: '推荐人手机' },
      { key: 'user_name', label: '学员' }, { key: 'product_type', label: '产品' },
      { key: 'amount', label: '奖励' }, { key: 'status', label: '状态' },
      { key: 'created_at', label: '时间' },
    ];
    rows = db.prepare(`SELECT c.*, r.nickname AS referrer_name, r.phone AS referrer_phone, u.nickname AS user_name
      FROM direct_commissions c LEFT JOIN users r ON r.id=c.referrer_id LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC`).all()
      .map(r => ({ ...r, status: commStatus[r.status] || r.status }));
  } else if (type === 'allowances') {
    headers = [
      { key: 'id', label: 'ID' }, { key: 'leader_name', label: '主理人' },
      { key: 'trainee_name', label: '管培生' }, { key: 'month', label: '月份' },
      { key: 'valid_perf', label: '业绩' }, { key: 'amount', label: '待遇' },
      { key: 'status', label: '状态' }, { key: 'created_at', label: '时间' },
    ];
    rows = db.prepare(`SELECT a.*, l.nickname AS leader_name, u.nickname AS trainee_name
      FROM leader_allowances a LEFT JOIN users l ON l.id=a.leader_id LEFT JOIN users u ON u.id=a.trainee_id ORDER BY a.id DESC`).all();
  } else if (type === 'help-rewards') {
    headers = [
      { key: 'id', label: 'ID' }, { key: 'mentor_name', label: '帮扶人' },
      { key: 'newbie_name', label: '新学员' }, { key: 'newbie_phone', label: '新学员手机' },
      { key: 'slot_no', label: '名额序号' }, { key: 'status', label: '状态' },
      { key: 'paid_at', label: '发放时间' },
    ];
    rows = db.prepare(`SELECT h.*, m.nickname AS mentor_name, u.nickname AS newbie_name, u.phone AS newbie_phone
      FROM help_rewards h LEFT JOIN users m ON m.id=h.mentor_id LEFT JOIN users u ON u.id=h.newbie_id ORDER BY h.id DESC`).all();
  } else if (type === 'trainees') {
    headers = [
      { key: 'id', label: 'ID' }, { key: 'nickname', label: '学员' },
      { key: 'leader_id', label: '主理人ID' }, { key: 'slot_no', label: '名额序号' },
      { key: 'month_perf', label: '当月业绩' }, { key: 'month_orders', label: '当月单数' },
      { key: 'month_status', label: '当月状态' }, { key: 'zero_perf_months', label: '连续零业绩' },
      { key: 'reserve_count', label: '补位次数' }, { key: 'reserve_deadline', label: '补位截止' },
      { key: 'slot_status', label: '名额状态' }, { key: 'in_pool', label: '在库' },
      { key: 'join_at', label: '加入时间' }, { key: 'exit_at', label: '退出时间' },
    ];
    rows = db.prepare(`SELECT t.*, u.nickname FROM trainees t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC`).all()
      .map(r => ({
        ...r,
        month_status: traineeStatus[r.month_status] || r.month_status,
        slot_status: slotStatus[r.slot_status] || r.slot_status,
        in_pool: r.in_pool ? '在库' : '已出库',
      }));
  } else if (type === 'users') {
    headers = [
      { key: 'id', label: 'ID' }, { key: 'phone', label: '手机号' },
      { key: 'nickname', label: '昵称' }, { key: 'identity', label: '身份' },
      { key: 'is_paid', label: '付费' }, { key: 'product_type', label: '产品' },
      { key: 'month_orders', label: '当月单数' }, { key: 'month_perf', label: '当月业绩' },
      { key: 'referrer_id', label: '推荐人ID' }, { key: 'created_at', label: '注册时间' },
    ];
    rows = db.prepare(`SELECT id, phone, nickname, identity, is_paid, product_type, month_orders, month_perf, referrer_id, created_at FROM users ORDER BY id DESC`).all()
      .map(r => ({
        ...r,
        identity: r.identity === 'promoter' ? '创业推广' : '纯学习',
        is_paid: r.is_paid ? '已付费' : '未付费',
      }));
  } else if (type === 'reviews') {
    headers = [
      { key: 'id', label: 'ID' }, { key: 'course_title', label: '课程' },
      { key: 'nickname', label: '学员' }, { key: 'phone', label: '手机号' },
      { key: 'rating', label: '评分' }, { key: 'content', label: '内容' },
      { key: 'status', label: '状态' }, { key: 'created_at', label: '时间' },
    ];
    rows = db.prepare(`SELECT r.*, c.title AS course_title, u.nickname, u.phone FROM reviews r LEFT JOIN courses c ON c.id=r.course_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC`).all()
      .map(r => ({ ...r, status: reviewStatus[r.status] || r.status }));
  } else {
    return res.status(400).json({ ok: false, msg: '不支持的导出类型' });
  }

  const csv = toCsv(headers, rows);
  const filename = `hanmo_${type}_${today}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ---------- 提现审核 ----------
app.get('/api/admin/withdrawals', auth.authAdmin, (req, res) => {
  const { status } = req.query;
  const rows = (status && status !== 'all')
    ? db.prepare(`SELECT w.*, u.nickname, u.phone FROM withdrawals w LEFT JOIN users u ON u.id=w.user_id WHERE w.status=? ORDER BY w.id DESC`).all(status)
    : db.prepare(`SELECT w.*, u.nickname, u.phone FROM withdrawals w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.id DESC`).all();
  const stats = db.prepare(`SELECT status, COUNT(*) c, COALESCE(SUM(amount),0) s FROM withdrawals GROUP BY status`).all();
  res.json({ ok: true, data: rows, stats });
});
app.post('/api/admin/withdrawals/:id', auth.authAdmin, (req, res) => {
  const { action, remark } = req.body;
  const w = db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(Number(req.params.id));
  if (!w) return res.status(400).json({ ok: false, msg: '提现单不存在' });
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  if (action === 'approve') {
    if (w.status !== 'pending') return res.status(400).json({ ok: false, msg: '仅待审核单可通过' });
    db.prepare(`UPDATE withdrawals SET status='approved', admin_remark=?, processed_at=? WHERE id=?`).run(remark || '', nowStr, w.id);
    return res.json({ ok: true, msg: '已通过，等待打款' });
  }
  if (action === 'pay') {
    if (w.status !== 'approved') return res.status(400).json({ ok: false, msg: '仅已通过单可确认打款' });
    db.prepare(`UPDATE withdrawals SET status='paid', admin_remark=?, processed_at=? WHERE id=?`).run(remark || '', nowStr, w.id);
    return res.json({ ok: true, msg: '已确认打款' });
  }
  if (action === 'reject') {
    if (w.status !== 'pending') return res.status(400).json({ ok: false, msg: '仅待审核单可驳回' });
    db.prepare(`UPDATE withdrawals SET status='rejected', admin_remark=?, processed_at=? WHERE id=?`).run(remark || '', nowStr, w.id);
    return res.json({ ok: true, msg: '已驳回，金额释放回可提现余额' });
  }
  res.status(400).json({ ok: false, msg: '不支持的操作' });
});

// 待办中心：聚合所有需要管理员处理的事件数量
app.get('/api/admin/todo-stats', auth.authAdmin, (req, res) => {
  const one = (sql) => { try { return db.prepare(sql).get().c || 0; } catch (e) { return 0; } };
  const data = {
    posts: one(`SELECT COUNT(*) c FROM posts WHERE status='pending'`),                             // 客户发表文章待审核
    comments: one(`SELECT COUNT(*) c FROM post_comments WHERE status='pending'`),                   // 评论待审核
    orders: one(`SELECT COUNT(*) c FROM orders WHERE status='pending'`),                            // 订单待确认收款
    withdrawals: one(`SELECT COUNT(*) c FROM withdrawals WHERE status='pending'`),                  // 提现待审核
    withdrawalsPay: one(`SELECT COUNT(*) c FROM withdrawals WHERE status='approved'`),              // 提现待打款
    trials: one(`SELECT COUNT(*) c FROM trial_lessons WHERE status='booked'`),                      // 体验课待联系
    learningTasks: one(`SELECT COUNT(*) c FROM learning_tasks WHERE status='submitted'`),           // 作业待点评
    groups: one(`SELECT COUNT(*) c FROM group_orders WHERE status='pending'`),                      // 拼团待确认收款
    bargains: one(`SELECT COUNT(*) c FROM bargains WHERE status='pending'`),                        // 砍价待确认收款
    helpRewards: one(`SELECT COUNT(*) c FROM help_rewards WHERE status='full'`),                    // 培育奖待发放
    fills: one(`SELECT COUNT(*) c FROM trainees WHERE slot_status='frozen'`),                       // 管培生待补位
  };
  data.total = Object.values(data).reduce((a, b) => a + b, 0);
  res.json({ ok: true, data });
});

// 数据看板
app.get('/api/admin/dashboard', auth.authAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const promoters = db.prepare(`SELECT COUNT(*) c FROM users WHERE identity='promoter'`).get().c;
  const paid = db.prepare(`SELECT COUNT(*) c FROM users WHERE is_paid=1`).get().c;
  const orders = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders`).get();
  const trainees = db.prepare(`SELECT COUNT(*) c FROM trainees WHERE in_pool=1`).get().c;
  const qualified = db.prepare(`SELECT COUNT(*) c FROM trainees WHERE in_pool=1 AND month_status='qualified'`).get().c;
  res.json({ ok: true, data: { users, promoters, paid, orders: orders.c, revenue: orders.s, trainees, qualified } });
});

// 运营数据趋势（数据看板图表用）
// 支持 ?days=7/14/30/90 切换统计窗口；每个窗口同时返回"上一窗口"数据用于环比对比
app.get('/api/admin/trends', auth.authAdmin, (req, res) => {
  const fmtDay = dt => { const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0'); return `${y}-${m}-${d}` };
  const N = Math.min(90, Math.max(7, parseInt(req.query.days) || 14));
  const todayDate = new Date();
  const days = [], dayMap = {};
  // 填充两个窗口的日期骨架：上一窗口 [start-P, start) + 本期窗口 [start, today]
  const fill = (offsetDays) => {
    const dt = new Date(todayDate); dt.setDate(dt.getDate() - offsetDays);
    const k = fmtDay(dt);
    if (!dayMap[k]) { days.push(k); dayMap[k] = { d: k, revenue: 0, orders: 0, users: 0, paidUsers: 0, commCost: 0 }; }
  };
  for (let i = N * 2 - 1; i >= 0; i--) fill(i);
  const applyOrderDay = r => { if (dayMap[r.d]) { dayMap[r.d].revenue = r.s; dayMap[r.d].orders = r.c } };
  const applyUserDay = r => { if (dayMap[r.d]) dayMap[r.d].users = r.c };
  const applyPaidDay = r => { if (dayMap[r.d]) dayMap[r.d].paidUsers = r.c };
  const applyCommDay = r => { if (dayMap[r.d]) dayMap[r.d].commCost = r.s };
  db.prepare(`SELECT substr(created_at,1,10) d, COUNT(*) c, COALESCE(SUM(amount),0) s FROM orders WHERE status='paid' GROUP BY d`).all().forEach(applyOrderDay);
  db.prepare(`SELECT substr(created_at,1,10) d, COUNT(*) c FROM users GROUP BY d`).all().forEach(applyUserDay);
  db.prepare(`SELECT substr(paid_at,1,10) d, COUNT(*) c FROM orders WHERE status='paid' AND paid_at IS NOT NULL GROUP BY d`).all().forEach(applyPaidDay);
  db.prepare(`SELECT substr(created_at,1,10) d, COALESCE(SUM(amount),0) s FROM direct_commissions WHERE status='paid' GROUP BY d`).all().forEach(applyCommDay);
  const curDays = days.slice(N), prevDays = days.slice(0, N);
  const byDay = curDays.map(k => dayMap[k]);
  const sumArr = (arr, f) => arr.reduce((s, k) => s + (dayMap[k][f] || 0), 0);
  // 环比对比：本期 vs 上一窗口
  const period = (arr) => ({ revenue: sumArr(arr, 'revenue'), orders: sumArr(arr, 'orders'), users: sumArr(arr, 'users'), paidUsers: sumArr(arr, 'paidUsers'), commCost: sumArr(arr, 'commCost') });
  const prev = period(prevDays);
  const cur = period(curDays);
  const diffPct = (c, p) => (p > 0 ? Math.round((c - p) / p * 100) : (c > 0 ? 100 : 0));

  const productSplit = db.prepare(`SELECT product_type, COUNT(*) orders, COALESCE(SUM(amount),0) revenue FROM orders WHERE status='paid' GROUP BY product_type ORDER BY revenue DESC`).all();
  const traineeStatus = db.prepare(`SELECT month_status status, COUNT(*) c FROM trainees WHERE in_pool=1 GROUP BY month_status`).all();
  const helpAmount = getSettingNumE('help_reward', 200);
  const comm = {
    direct: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM direct_commissions WHERE status='paid'`).get().s,
    allowance: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM leader_allowances WHERE status='paid'`).get().s,
    help: db.prepare(`SELECT COUNT(DISTINCT referrer_id) c FROM help_rewards WHERE status='paid'`).get().c * helpAmount,
    helpBonus: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM help_bonuses WHERE status='paid'`).get().s,
  };
  comm.total = comm.direct + comm.allowance + comm.help + comm.helpBonus;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = fmtDay(now);
  const kpi = {
    totalRevenue: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status='paid'`).get().s,
    monthRevenue: db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status='paid' AND substr(created_at,1,7)=?`).get(ym).s,
    todayRevenue: dayMap[today]?.revenue || 0,
    todayOrders: dayMap[today]?.orders || 0,
    totalUsers: db.prepare(`SELECT COUNT(*) c FROM users`).get().c,
    paidUsers: db.prepare(`SELECT COUNT(*) c FROM users WHERE is_paid=1`).get().c,
    couponUsed: db.prepare(`SELECT COALESCE(SUM(coupon_used),0) s FROM orders WHERE status='paid'`).get().s,
    orders: db.prepare(`SELECT COUNT(*) c FROM orders WHERE status='paid'`).get().c,
  };
  // 环比对比
  const compare = {
    prev, cur,
    diff: {
      revenue: diffPct(cur.revenue, prev.revenue),
      orders: diffPct(cur.orders, prev.orders),
      users: diffPct(cur.users, prev.users),
      paidUsers: diffPct(cur.paidUsers, prev.paidUsers),
      commCost: diffPct(cur.commCost, prev.commCost),
    },
  };
  res.json({ ok: true, data: { range: { days: N }, byDay, productSplit, traineeStatus, comm, kpi, compare } });
});

// 数据洞察（数据看板增强）：分享漏斗 / 管培生考核进度 / 主理人学习圈排行 / 介绍人数分布
app.get('/api/admin/insights', auth.authAdmin, (req, res) => {
  const fmtDay = dt => { const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0'); return `${y}-${m}-${d}` };

  // ---------- 1. 分享漏斗 ----------
  // 用户路径：注册用户 → 分享成员(promoter) → 付费学员 → 在库管培生 → 合格管培生 → 主理人
  const totalUsers = db.prepare(`SELECT COUNT(*) c FROM users`).get().c;
  const promoters = db.prepare(`SELECT COUNT(*) c FROM users WHERE identity='promoter'`).get().c;
  const paid = db.prepare(`SELECT COUNT(*) c FROM users WHERE is_paid=1`).get().c;
  const traineeCount = db.prepare(`SELECT COUNT(*) c FROM trainees WHERE in_pool=1`).get().c;
  const qualified = db.prepare(`SELECT COUNT(*) c FROM trainees WHERE in_pool=1 AND month_status='qualified'`).get().c;
  const leaders = db.prepare(`SELECT COUNT(DISTINCT leader_id) c FROM trainees WHERE in_pool=1`).get().c;
  const funnelSteps = [
    { key: 'users', label: '注册用户', count: totalUsers },
    { key: 'promoters', label: '分享成员', count: promoters },
    { key: 'paid', label: '付费学员', count: paid },
    { key: 'trainees', label: '在库管培生', count: traineeCount },
    { key: 'qualified', label: '合格管培生', count: qualified },
    { key: 'leaders', label: '主理人', count: leaders },
  ];
  const funnel = funnelSteps.map((s, i) => {
    const prev = i === 0 ? s.count : funnelSteps[i - 1].count;
    return { ...s, pct: i === 0 ? null : (prev > 0 ? Math.round(s.count / prev * 100) : 0) };
  });

  // ---------- 2. 管培生考核进度（滚动周期） ----------
  const cycleDays = getSettingNumE('trainee_cycle_days', 30) || 30;
  const qualifyPerf = getSettingNumE('qualify_perf', 1000) || 1000;
  const qualifyOrders = getSettingNumE('qualify_orders', 2) || 2;
  const clearMonths = getSettingNumE('clear_months', 2) || 2;
  const cycleMs = cycleDays * 24 * 3600 * 1000;
  const nowMs = Date.now();
  const nameMap = {};
  db.prepare(`SELECT id, nickname, phone FROM users`).all().forEach(u => { nameMap[u.id] = { nickname: u.nickname || ('用户' + u.id), phone: u.phone || '' }; });
  const tRows = db.prepare(`SELECT t.*, u.nickname, u.phone FROM trainees t LEFT JOIN users u ON u.id=t.user_id WHERE t.in_pool=1 ORDER BY t.month_status='qualified' DESC, t.month_perf DESC, t.id DESC`).all();
  const tItems = tRows.map(t => {
    // 滚动周期：join_at = 真实入职时间（不再被改写）；finished_cycle = 已考核完成的周期轮数，
    // 当前周期 = 第 (finished_cycle+1) 轮，起点 = join_at + finished_cycle*cycleDays
    const joinMs = new Date(String(t.join_at || '').replace(' ', 'T')).getTime();
    const fc = t.finished_cycle || 0;
    const hasJoin = !!joinMs;
    const cycleStartMs = hasJoin ? joinMs + fc * cycleMs : 0;
    const cycleEndMs = hasJoin ? cycleStartMs + cycleMs : 0;
    const remainDays = hasJoin ? Math.max(0, Math.ceil((cycleEndMs - nowMs) / 86400000)) : 0;
    const started = hasJoin && nowMs >= joinMs + cycleMs; // 是否已走完至少一个完整周期
    const perfPct = t.month_perf >= qualifyPerf ? 100 : Math.round(t.month_perf / qualifyPerf * 100);
    const orderPct = t.month_orders >= qualifyOrders ? 100 : Math.round(t.month_orders / qualifyOrders * 100);
    return {
      id: t.id, userId: t.user_id, nickname: t.nickname || nameMap[t.user_id]?.nickname, phone: t.phone || nameMap[t.user_id]?.phone,
      leaderId: t.leader_id, leaderNickname: nameMap[t.leader_id]?.nickname,
      slotNo: t.slot_no, monthPerf: t.month_perf, monthOrders: t.month_orders,
      status: t.month_status, started, zeroPerfMonths: t.zero_perf_months || 0,
      slotStatus: t.slot_status,
      cycleStart: fmtDay(new Date(cycleStartMs)), cycleEnd: fmtDay(new Date(cycleEndMs)), remainDays,
      perfPct, orderPct, progressPct: Math.min(100, Math.max(perfPct, orderPct)),
    };
  });
  const summary = { total: tRows.length };
  ['qualified', 'probation', 'invalid', 'cleared', 'pending'].forEach(s => summary[s] = tItems.filter(x => x.status === s).length);

  // ---------- 3. 主理人学习圈排行 ----------
  const allowanceMap = {};
  db.prepare(`SELECT leader_id, COALESCE(SUM(amount),0) s FROM leader_allowances WHERE status='paid' GROUP BY leader_id`).all()
    .forEach(r => allowanceMap[r.leader_id] = r.s);
  const rankRows = db.prepare(`
    SELECT leader_id, COUNT(*) c,
      COALESCE(SUM(CASE WHEN month_status='qualified' THEN 1 ELSE 0 END),0) q,
      COALESCE(SUM(month_perf),0) perf,
      COALESCE(SUM(CASE WHEN month_status='qualified' THEN month_perf ELSE 0 END),0) qperf,
      COALESCE(SUM(CASE WHEN slot_status='frozen' THEN 1 ELSE 0 END),0) frozen
    FROM trainees WHERE in_pool=1 GROUP BY leader_id`).all();
  const leaderRank = rankRows.map(r => ({
    leaderId: r.leader_id,
    nickname: nameMap[r.leader_id]?.nickname,
    phone: nameMap[r.leader_id]?.phone,
    traineeCount: r.c, qualifiedCount: r.q,
    teamPerf: r.perf, qualifiedPerf: r.qperf,
    allowanceTotal: allowanceMap[r.leader_id] || 0,
    frozenSlots: r.frozen,
  })).sort((a, b) => b.qualifiedPerf - a.qualifiedPerf || b.teamPerf - a.teamPerf).slice(0, 10);

  // ---------- 4. 介绍人数分布（学习圈规模） ----------
  const refCnt = {};
  db.prepare(`SELECT referrer_id, COUNT(*) c FROM users WHERE referrer_id IS NOT NULL GROUP BY referrer_id`).all()
    .forEach(r => refCnt[r.referrer_id] = r.c);
  const buckets = [
    { key: '0', label: '0 人', min: 0, max: 0 },
    { key: '1', label: '1 人', min: 1, max: 1 },
    { key: '2', label: '2 人', min: 2, max: 2 },
    { key: '3_5', label: '3~5 人', min: 3, max: 5 },
    { key: '6_10', label: '6~10 人', min: 6, max: 10 },
    { key: '11', label: '10 人以上', min: 11, max: Infinity },
  ];
  // 0 人桶 = 从未介绍过任何人的用户数；其余桶 = 介绍人数落在 [min,max] 区间的用户数
  const hasReferralUsers = Object.keys(refCnt).length; // 介绍过至少1人的用户数
  const directDist = buckets.map(b => ({
    ...b,
    count: totalUsers === 0 ? 0 : (b.min === 0
      ? Math.max(0, totalUsers - hasReferralUsers)
      : Object.values(refCnt).filter(c => c >= b.min && c <= b.max).length),
  }));

  res.json({ ok: true, data: { funnel, traineeProgress: { config: { cycleDays, qualifyPerf, qualifyOrders, clearMonths }, summary, items: tItems }, leaderRank, directDist } });
});

// 404 兜底
app.use((req, res) => {
  res.status(404).json({ ok: false, msg: '接口不存在' });
});

// 全局错误处理：统一 500，不向客户端泄露堆栈
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.path, err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, msg: '服务器开小差了，请稍后重试' });
});

// 未捕获异常兜底：记录日志防止进程静默崩溃
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); });
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e); });

// 启动
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`翰墨分享服务已启动: http://localhost:${PORT}`);
  // 安全提示：检测默认管理员密码 + 生产环境运行模式提醒
  try {
    const adminRow = db.prepare('SELECT password_hash FROM admin_auth WHERE username=?').get('admin');
    if (adminRow && bcrypt.compareSync('admin123', adminRow.password_hash)) {
      console.warn('\x1b[33m[安全警告] 管理后台仍在使用默认密码 admin/admin123，正式部署后请第一时间修改！\x1b[0m');
    }
  } catch (e) {}
  console.log('[部署提醒] 生产环境请单进程运行，避免多实例重复执行定时任务与消息推送。');
});