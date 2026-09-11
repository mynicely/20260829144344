// ============================================================
// 微信支付 API v3 核心模块（零依赖，Node 内置 crypto）
// 提供：JSAPI 统一下单 / 商户请求签名 / 回调验签 / 报文解密
// 说明：对接真实微信支付需在管理后台「支付配置」填入商户参数，
//       未配置完整时支付网关自动回落「模拟支付」模式，演示不受影响。
// ============================================================
const crypto = require('crypto');
const db = require('./db');

const WXPAY_API = 'https://api.mch.weixin.qq.com';

// 读取配置值
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value).v; } catch (e) { return null; }
}

// 读取全部支付配置
function getPayConfig() {
  return {
    appid: getSetting('wxpay_appid') || '',
    appsecret: getSetting('wxpay_appsecret') || '',
    mchid: getSetting('wxpay_mchid') || '',
    apiV3Key: getSetting('wxpay_api_v3_key') || '',
    serialNo: getSetting('wxpay_apiclient_serial') || '',
    privateKey: getSetting('wxpay_apiclient_key') || '',   // 商户API私钥(PEM内容)
    notifyUrl: getSetting('wxpay_notify_url') || '',
    platformPub: getSetting('wxpay_platform_pub') || '',   // 微信平台证书公钥(PEM)
  };
}

// 配置是否齐全（影响 pay_mode 是否可切到 wxpay）
function isConfigured(cfg) {
  cfg = cfg || getPayConfig();
  return !!(cfg.appid && cfg.mchid && cfg.apiV3Key && cfg.serialNo && cfg.privateKey && cfg.notifyUrl && cfg.platformPub);
}

// 当前支付模式：manual 线下确认收款 / mock 模拟 / wxpay 微信支付
// manual：未开通微信商户收款前，客户下单后展示后台配置的收款码，线下转账由后台确认已收款后再执行业务
function getPayMode() {
  const mode = getSetting('pay_mode') || 'manual';
  if (mode === 'wxpay' && !isConfigured()) return 'mock'; // 参数不完整时强制回落模拟模式
  return mode;
}

// ---------- 商户请求签名（生成 Authorization 头） ----------
function buildAuthorization(method, url, body, cfg) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const msg = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(msg);
  const signature = signer.sign(cfg.privateKey, 'base64');
  return {
    authorization:
      `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonceStr}",` +
      `signature="${signature}",timestamp="${timestamp}",serial_no="${cfg.serialNo}"`,
    timestamp,
    nonceStr,
  };
}

// ---------- JSAPI 统一下单 ----------
// amount 单位：元（支持小数），内部转为分
async function createJsapiOrder({ outTradeNo, description, amount, openid }) {
  const cfg = getPayConfig();
  if (!isConfigured(cfg)) throw new Error('微信支付参数未配置完整，请先到管理后台「支付配置」填写');
  if (!openid) throw new Error('缺少用户 openid，请先通过微信登录授权');
  const url = '/v3/pay/transactions/jsapi';
  const body = JSON.stringify({
    appid: cfg.appid,
    mchid: cfg.mchid,
    description: (description || '翰墨书院课程').slice(0, 120),
    out_trade_no: outTradeNo,
    notify_url: cfg.notifyUrl,
    amount: { total: Math.round(Number(amount) * 100) }, // 分
    payer: { openid },
  });
  const { authorization } = buildAuthorization('POST', url, body, cfg);
  const resp = await fetch(WXPAY_API + url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'hanmo-liebian/1.0',
      'Authorization': authorization,
    },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error('微信下单失败[' + resp.status + ']: ' + (data.message || JSON.stringify(data)));
  }
  return data; // { prepay_id, trade_type, ... }
}

// ---------- 生成前端 wx.requestPayment 参数 ----------
function buildJsapiPayParams(prepayId) {
  const cfg = getPayConfig();
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const pkg = 'prepay_id=' + prepayId;
  const msg = `${cfg.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(msg);
  const paySign = signer.sign(cfg.privateKey, 'base64');
  return { appId: cfg.appid, timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };
}

// ---------- 支付回调验签（V3 规范：时间戳+nonce+原始报文 拼串 RSA 验签） ----------
function verifyNotifySignature(headers, rawBody) {
  const ts = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const signature = headers['wechatpay-signature'];
  const serial = headers['wechatpay-serial'];
  if (!ts || !nonce || !signature || !serial) return { ok: false, msg: '缺少回调签名头' };
  // 时间戳容差 5 分钟，防重放攻击
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, msg: '回调时间戳过期' };
  const cfg = getPayConfig();
  if (!cfg.platformPub) return { ok: false, msg: '未配置微信平台证书公钥，无法验签' };
  const msg = `${ts}\n${nonce}\n${rawBody}\n`;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(msg);
    const ok = verifier.verify(cfg.platformPub, signature, 'base64');
    return ok ? { ok: true, serial } : { ok: false, msg: '回调验签失败' };
  } catch (e) {
    return { ok: false, msg: '回调验签异常: ' + e.message };
  }
}

// ---------- 解密回调 resource（AES-256-GCM，key=APIv3密钥） ----------
// 微信规范：ciphertext = base64( 密文 || 16字节认证标签 )
function decryptResource(resource) {
  const cfg = getPayConfig();
  if (!cfg.apiV3Key) throw new Error('未配置 APIv3 密钥，无法解密回调');
  const { ciphertext, nonce, associated_data } = resource || {};
  if (!ciphertext || !nonce) throw new Error('回调报文缺少 resource 密文');
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < 16) throw new Error('回调密文长度异常');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const key = Buffer.from(cfg.apiV3Key, 'utf8'); // APIv3 密钥固定 32 字节
  const iv = Buffer.from(nonce, 'utf8');          // 12 字节随机串
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  if (associated_data) decipher.setAAD(Buffer.from(associated_data, 'utf8'));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ---------- 微信小程序 code2session（换 openid） ----------
async function code2Session(code) {
  const cfg = getPayConfig();
  if (!cfg.appid || !cfg.appsecret) throw new Error('未配置小程序 AppID/AppSecret，无法微信登录');
  const url =
    'https://api.weixin.qq.com/sns/jscode2session?appid=' + encodeURIComponent(cfg.appid) +
    '&secret=' + encodeURIComponent(cfg.appsecret) +
    '&js_code=' + encodeURIComponent(code) +
    '&grant_type=authorization_code';
  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json().catch(() => ({}));
  if (!data.openid) throw new Error('微信登录失败: ' + (data.errmsg || '无效的 code'));
  return data; // { openid, session_key, unionid? }
}

module.exports = {
  getPayConfig,
  isConfigured,
  getPayMode,
  buildAuthorization,
  createJsapiOrder,
  buildJsapiPayParams,
  verifyNotifySignature,
  decryptResource,
  code2Session,
};
