# Wordward — 三国汉字塔防

一个以**汉字组词**为核心的三国主题塔防游戏。玩家将汉字拖放到棋盘上组成词语、召唤武将，抵御一波波敌军；通过军功进阶、装备养成和云存档，构建属于自己的三国阵容。

- 前端：Vite + Canvas 2D（纯 ES Modules，无框架依赖）
- 后端：Cloudflare Worker（Hono）+ D1 数据库
- 安全：Cloudflare Turnstile 人机校验、HMAC 会话、密码哈希（PBKDF2-SHA-256）

## 游戏简介

在棋盘网格上，把汉字拖拽到一起组成词语，即可召唤对应的英雄或单位迎敌。汉字通过「刷新将士」随机补充，「铲子」用于激活棋盘上被封锁的格位。击败波次 BOSS 可获得**军功**，用于解锁更高难度与无尽楼层；装备与武器可强化、洗练，套装配件可触发羁绊加成。

## 核心玩法

### 组词布阵

将汉字从将士栏拖拽到棋盘格上，凑成合法词语即召唤对应单位：

- 基础兵种：兵 / 骑 / 枪 / 弓 / 炮
- 进阶英雄：赵云、吕布、诸葛亮、关羽、张飞、曹操、周瑜、马超、黄忠、貂蝉、孙尚香（需先解锁人名包含的全部汉字）

每个波次结束结算金币与击杀奖励，击杀可以缩短刷新冷却。

### 刷新将士

- 将士栏固定 5 个槽位，刷新按钮有冷却时间（初始 30 秒，每次刷新 +5 秒）
- 击杀一只敌军可缩短剩余冷却 0.5 秒
- 拖动汉字上棋盘组词召唤，或直接召唤单字单位

### 铲子激活

棋盘上存在被封锁的格位，需要用「铲子」将其激活后才能布阵：

- 每次刷新有 55% 概率掉落铲子
- 连续 2 次刷新未掉铲子则必掉（保底）

### 军功进阶

击败波次 BOSS 可获得军功，军功用于解锁更高难度（困难、无尽等）与无尽楼层。军功数据由服务端校验并计入全球排行榜：

- 领取军功需满足进度解锁条件（由服务端验证之前关卡是否已通关）
- 玩家可在「排行 / 账号」场景查看军功与排名

### 装备词条羁绊

玩家装备共 3 个槽位：**武器 / 护甲 / 饰品**，分 3 个系列：**虎啸 / 龙腾 / 凤仪**：

- 同系列穿戴 2 件触发 2 件套羁绊，穿 3 件触发 3 件套羁绊（攻击、主公生命、金币收益、攻速等）
- 每件装备 = 基础属性 × 稀有度倍率 × 等级成长 + 附加词条（词条数量由稀有度决定：普通 1 条 / 精良 1 条 / 稀有 2 条 / 传说 3 条）
- **强化**消耗宝石，**洗练**消耗魂玉重随附加词条

将士武器按兵种佩戴（兵 / 骑 / 枪 / 弓 / 炮 + 已解锁英雄），作用于该兵种全体将士。

### 货币系统

| 货币 | 初始 | 来源 | 用途 |
| --- | --- | --- | --- |
| 金币 | 300 | 战斗结算、抽奖掉落 | 商店购买道具、道具升级、抽奖（每次 100 金） |
| 宝石 | 10 | 精英 / BOSS 掉落、抽奖池 | 装备 / 武器强化：每次消耗 `10 + 5 × (等级 - 1)` |
| 魂玉 | 3 | BOSS 掉落、抽奖池 | 装备洗练：每次消耗 1 个，重随附加词条 |

## 系统架构

```text
浏览器（Vite + Canvas 2D 前端）
  ├── src/battle   战斗逻辑（塔 / 敌人 / 词系统 / 刷新 / 铲子 / 羁绊）
  ├── src/config   数值配置（难度 / 波次 / 单位 / 装备 / 经济 / 图鉴）
  ├── src/meta     元游戏场景（主页 / 商城 / 道具 / 抽奖 / 装备 / 排行 / 账号）
  ├── src/net      API 客户端 / 云存档 / 军功提交 / Turnstile
  ├── src/ui       可复用 UI 组件（按钮 / 面板 / 提示）
  └── src/core     渲染循环 / 输入 / 存储

Cloudflare Worker（Hono）后端
  ├── worker/modules   auth / merit（军功）/ leaderboard / profile / save
  ├── worker/security  JWT / HMAC / 密码哈希 / Cookie 处理
  └── worker/db        D1 查询封装

Cloudflare D1 数据库 + SQL 迁移（migrations/）
Cloudflare Turnstile  注册 / 登录人机校验
```

### 部署环境

| 环境 | Worker 名称 | D1 数据库 | 域名 |
| --- | --- | --- | --- |
| 预览 | `wordward-game-preview` | `wordward-preview` | `preview.sheepgame.top` |
| 正式 | `wordward-game` | `wordward-production` | `sheepgame.top` |

预览与正式环境使用独立的 D1 数据库、Turnstile 密钥与 Worker secrets，不得混用。

## 本地开发

要求：Node.js（建议 20+）。

```bash
# 安装锁定版本的依赖
npm ci

# 启动 Vite 开发服务器
npm run dev
```

### 测试

```bash
# 前端测试（Vitest，运行 src 目录）
npm test

# Worker 测试（Vitest，运行 worker 目录）
npm run worker:test

# 生产构建
npm run build
```

### 一键验证 Worker

```bash
# 完整 Worker 验证：前端测试 + Worker 测试 + 生产构建 + 部署预检（dry-run）
npm run verify:worker
```

## 部署

部署基于 Cloudflare Workers + D1，静态资源由 Vite 构建到 `dist/`，Worker 托管 `/api/*` 并服务静态文件。完整上线步骤见 `docs/cloudflare-release.md`（遗留的 Docker / PostgreSQL 部署手册见 `docs/deployment.md`，仅作回退参考）。

### 预览环境

```bash
# 应用 D1 迁移到预览数据库
npm run d1:migrate:preview

# 部署预览 Worker
npm run deploy:preview
```

### 正式环境

```bash
# 应用 D1 迁移到正式数据库
npm run d1:migrate:production

# 部署正式 Worker
npm run deploy:production
```

建议的发布流程：

1. 在功能分支完成开发并通过 `npm run verify:worker`
2. 合并到 `preview` 分支，触发预览部署，在 `preview.sheepgame.top` 验证
3. 验证通过后合并到 `main`，触发正式部署到 `sheepgame.top`

## 技术栈

| 层 | 技术 |
| --- | --- |
| 构建 | Vite 8 |
| 运行时 | 浏览器 Canvas 2D、ES Modules |
| 测试 | Vitest |
| 后端 | Cloudflare Workers、Hono、Wrangler |
| 数据 | Cloudflare D1（SQLite） |
| 安全 | Cloudflare Turnstile、PBKDF2-SHA-256、JWT / HMAC |

## 目录结构

```text
.
├── src/              前端（Vite + Canvas）
│   ├── battle/       战斗逻辑与测试
│   ├── config/       数值配置（难度 / 波次 / 单位 / 装备 / 经济 / 图鉴）
│   ├── meta/         元游戏场景：主页 / 商城 / 道具 / 抽奖 / 装备 / 排行 / 账号
│   ├── net/          API 客户端 / 云存档 / 军功 / Turnstile
│   ├── ui/           可复用 UI 组件
│   ├── core/         渲染循环 / 输入 / 存储
│   ├── main.js       画布初始化与主循环入口
│   └── startup.js    启动逻辑
├── worker/           Cloudflare Worker（Hono）
│   ├── modules/      auth / merit / leaderboard / profile / save
│   ├── security/     Cookie / 编码 / HMAC / JWT / 密码哈希
│   ├── db/           D1 查询与错误处理
│   ├── middleware/   鉴权 / 限流 / 错误 / 来源校验
│   ├── app.js        Hono 应用组装
│   └── index.js      Worker 入口
├── migrations/       D1 SQL 迁移
├── scripts/          运维脚本（冒烟测试 / 发布检查）
├── deploy/           Nginx 配置与备份脚本（遗留 Docker 部署）
├── server/           遗留 Node.js / PostgreSQL API（Docker 回退方案）
└── docs/             设计文档与实施计划（Superpowers 工作流）
```
