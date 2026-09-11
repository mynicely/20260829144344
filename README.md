# 翰墨裂变 · 线上书法培训全栈项目

线上书法培训 + 裂变分销 + 管培生考核体系的 Web 全栈 MVP。

## 技术栈
- 前端：Vue3 + Vite + Vue Router + Pinia
- 后端：Node.js + Express
- 数据库：better-sqlite3（零配置，后续可迁 MySQL）

## 快速启动

### 后端
```bash
cd server
npm install
npm run dev        # 启动 http://localhost:3000
```

### 前端
```bash
cd web
npm install
npm run dev        # 启动 http://localhost:5173
```

> 默认前端代理 /api → http://localhost:3000

## 初始化
- 首次启动后端会自动建库建表，并写入默认后台可配置参数与示例课程。
- 默认管理员账号：`admin` / `admin123`（在 /admin 登录）

## 目录结构
```
server/   # 后端：API、数据库、定时任务、奖励结算引擎
web/      # 前端：用户端 + 管理后台
docs/     # 文档
```

## 说明
- 本阶段为 Web MVP，用于验证商业模式与奖励结算引擎；后续升级微信小程序。
- 全项目所有奖励、待遇参数均可在管理后台动态配置，无需改代码。

## 上线注意点（重要）
1. **生产环境必须单进程运行**（`node src/index.js`），禁止 pm2 cluster 多进程模式：SQLite 不支持多进程并发写入
2. **正式部署后第一时间修改默认管理员密码** `admin/admin123`（服务启动时会检测并在日志打印警告）
3. 内容安全 `msgSecCheck` 暂不接入，帖子内容靠「先审后发」机制管控；发布小程序版本时再配置 appid/secret 开启
4. 退款佣金约束：退款标记奖励流水为 `refunded`，未提现余额自动剔除；已提现部分靠 `pay_logs` 对账日志人工核对、线下协商（详见 `docs/部署运行指南.md` 第八节）
