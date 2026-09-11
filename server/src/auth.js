// 认证中间件：用户 JWT + 管理员校验
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

// 密钥解析：优先环境变量 JWT_SECRET；否则首次启动自动生成 64 位随机密钥持久化到 settings
// （不再硬编码弱默认值，生产环境必须配置 JWT_SECRET）
function resolveSecret() {
  if (process.env.JWT_SECRET) {
    if (String(process.env.JWT_SECRET).length < 16) {
      console.warn('[auth] 警告：JWT_SECRET 过短（<16位），生产环境请使用 32 位以上随机字符串');
    }
    return String(process.env.JWT_SECRET);
  }
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key='jwt_secret'`).get();
    if (row && row.value) {
      try { const v = JSON.parse(row.value).v; if (v) return String(v); } catch (e) {}
    }
  } catch (e) { /* settings 表可能尚未就绪 */ }
  const s = crypto.randomBytes(32).toString('hex');
  try {
    db.prepare(`INSERT INTO settings (key, value) VALUES ('jwt_secret',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run(JSON.stringify({ v: s }));
  } catch (e) { /* 忽略 */ }
  return s;
}
const SECRET = resolveSecret();

function signUser(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' });
}
function signAdmin(admin) {
  // payload 携带管理员 ID + 用户名；校验时查库确认账号仍有效（禁用/删除后 token 立即失效）
  return jwt.sign({ admin: true, aid: admin.id, name: admin.username || 'admin' }, SECRET, { expiresIn: '12h' });
}

// 校验用户（推广/学习均可）
function authUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ ok: false, msg: '未登录' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.uid);
    if (!user) return res.status(401).json({ ok: false, msg: '用户不存在' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, msg: '登录已过期' });
  }
}

// 可选登录：有 token 则识别用户，无 token 视为匿名（用于公开接口返回个性化数据）
function optionalUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  req.user = null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.uid) || null;
  } catch (e) { req.user = null; }
  next();
}

// 校验管理员（关联数据库：管理员被禁用/删除后已签发 token 立即失效）
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ ok: false, msg: '未登录' });
  try {
    const payload = jwt.verify(token, SECRET);
    if (!payload.admin || !payload.aid) return res.status(403).json({ ok: false, msg: '无权限' });
    const admin = db.prepare('SELECT * FROM admin_auth WHERE id=? AND status=1').get(payload.aid);
    if (!admin) return res.status(401).json({ ok: false, msg: '管理员账号已失效，请重新登录' });
    req.admin = admin;
    req.adminName = admin.username;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, msg: '登录已过期' });
  }
}

module.exports = { signUser, signAdmin, authUser, authAdmin, optionalUser, SECRET };
