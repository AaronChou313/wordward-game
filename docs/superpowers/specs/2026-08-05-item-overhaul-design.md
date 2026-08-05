# 玩法大改设计：货币拆分、装备系统、排行榜、UI 优化

## 目标

对已部署到 Cloudflare preview 的三国文字塔防做一轮玩法与体验大改，共 12 项：铲子掉率、列表滑动、背包改名与入口合并、固定头像、军功排行榜修复、商城刷新、货币拆分、装备升级/词条/洗练/羁绊、武器佩戴范围、道具顶部已装备栏、README、分批提交。

所有改动在独立开发分支 `dev/item-overhaul` 上分批提交，全部完成后推送，由用户手动 PR 到 `preview`，核验后再 PR 到 `main`。

## 一、铲子掉率提升

### 现状
`src/config/economy.js`：`SHOVEL_DROP_CHANCE = 0.45`、`SHOVEL_PITY = 3`。简单难度 `shovelAdd: 0`。

### 改动
- `SHOVEL_DROP_CHANCE` 提到 `0.55`。
- `SHOVEL_PITY` 降到 `2`（连续 2 次刷新未掉必掉）。
- 简单难度 `shovelAdd` 从 0 提到 `0.05`（与普通一致）。
- `RefreshBar.refresh()` 增加随波次递增：掉率 `+ min(0.15, wave * 0.004)`，防止后期格子解锁停滞。

### 测试
- `refreshBar.test.js`：更新概率断言；验证保底逻辑（连续 2 次必得）。
- `economy.test.js`（若有）：常量断言。

## 二、装备列表滑动

### 现状
`src/meta/equipScene.js` 拥有列表不可滚动，手指触碰即触发装备。

### 改动
`EquipScene` 增加 `scroll` 状态，复用背包/抽奖的拖拽判定模式：
- 按下记录起点，位移 `>10px` 判定为滑动，只滚动不触发装备。
- 松开位移 `<10px` 才判定为点击（玩家装备 tab：装备/卸下；将士武器 tab：选中武器）。
- 列表超出可视区可滚动到底（`maxScroll()` 按行数计算）。

### 测试
- `equipScene` 相关测试：按下+拖动不触发装备；短按触发；滚动范围钳制。

## 三、背包改名、入口合并、顶部已装备栏

### 背包改名与入口
- `HomeScene` 按钮 `背 包` 改名 `道 具`，`装备` 按钮与其相邻（商城/道具/抽奖一行，装备/图鉴一行，排行/账号一行）。
- `InventoryScene` 面板标题 `背 包` 改为 `道 具`。

### 顶部已装备栏
`InventoryScene` 顶部（列表上方）常驻一条 `[已装备]` 栏：
- 列出当前 `equippedActive` + `equippedPassive` 的道具名称，金框高亮，点击可直接卸下。
- 下方仍是完整可滑动列表。

### 测试
- `inventory` 相关测试：顶部栏渲染已装备项、点击卸下生效、列表仍可滚动。

## 四、固定头像

### 现状
个人资料页有 `头像 HTTPS 地址` 输入框，排行榜行首绘制远程头像。

### 改动
- `ProfileScene` 移除 `avatarUrl` 输入框，固定显示内置头像（canvas 绘制：金边圆 + 主公头像），保存时传 `avatarUrl: null`。
- 排行榜 `drawAvatar` 在没有远程头像时绘制同一内置头像。
- 后端 `profile` 的 `avatar_url` 字段保留（兼容已有数据），`normalizeProfile` 允许 `avatarUrl` 为 null。

### 测试
- `profileScene` 相关测试：无 avatarUrl 输入、保存传 null。
- 排行渲染：内置头像兜底。

## 五、军功排行榜修复与排序

### 第 5 项：通关军功不上榜（bug 排查）
`battleScene.handleBossDefeated` 本地加军功 + `queueMeritClaim` 异步提交。可能失败点：
- 未登录时 `queueMeritClaim` 返回 `not-authenticated`，登录后已有 `flushMeritClaims` 补发机制。
- 服务端 `recordMeritClaim` 被 `PROGRESSION_LOCKED` 卡住（前置军功未提交）。
- 提交成功但 `users.merit_total` 未更新（服务端 SQL 条件不满足）。

**修复**：排查上述链路，确保登录后自动补发、前置条件满足时成功落库。补充测试覆盖"先打 Boss 后登录再补发"场景。

### 第 6 项：军功为 0 上榜 + 排序
后端需要记录每个用户历史最高难度+波数：

- **D1 migration `0002_leaderboard_best.sql`**：`users` 表新增 `best_difficulty TEXT`、`best_wave INTEGER`（默认 NULL）。
- 军功提交时（`merit/service.js attemptClaim`）同步更新历史最高：难度优先级 `endless > hard > normal > easy`，同难度比波数，更高才覆盖。
- 排行榜 SQL 去掉 `merit_total > 0` 过滤，改为：
  `ORDER BY merit_total DESC, best_difficulty_rank ASC, best_wave DESC, merit_reached_at ASC`（`best_difficulty_rank` 由 CASE 表达式映射）。
- `/api/leaderboard/me` 同步调整：不再以 `merit_total <= 0` 判"未上榜"，而是总是返回名次（含军功 0）。
- 前端 `rankingScene` 显示军功 0 的用户，名次高亮逻辑不变。

### 测试
- worker 侧：leaderboard 排序断言（军功 0 显示、同军功按难度/波数排序）、migration 应用。
- 前端：排行渲染军功 0 用户。

## 六、战斗后商城刷新

### 现状
`gameOver()` 已调用 `refreshShopAfterBattle`，用户反馈不生效。

### 排查与修复
- 确认 `gameOver` 在胜利、失败、中途退出路径都调用。
- 修复 `ShopScene.enter()` 中 `ensureShopStock` 把空库存过滤掉的问题（刷新后应保留新库存）。
- 确保"战斗结束即刷新"：本轮库存全部重抽（未拥有道具）。

### 测试
- `shopStock.test.js`：战斗后刷新重抽、已拥有道具不进入新库存、空库存保留。

## 七、货币拆分

### 现状
单货币 `gold`。抽奖 `GACHA_COST=100` 金，奖池金币/进阶字/道具。

### 改动
- 存档新增 `gems`、`soulJade`，新手 10 / 3，`version` 升 3，`migrateSave` 补默认值。
- 金币：商城买道具、升级道具、抽奖（不变）。
- 宝石：升级装备/武器（`10 + 5 * (lvl-1)` 起步递增）。
- 魂玉：洗练装备/武器（1 次 1 枚）。
- 产出：
  - 战斗结算金币（原有）。
  - 精英/Boss 击杀概率掉宝石 1-3。
  - Boss 概率掉魂玉 1。
  - 抽奖奖池含金币/宝石/魂玉/进阶字。

### 抽奖奖池（`gacha.js`）
- 普通：金币 60/120（原样）。
- 稀有：进阶字 / 道具 / 宝石 20-40。
- 珍贵：进阶字（未解锁优先）/ 道具 / 宝石 50-80 / 魂玉 1-2。

### 测试
- `saveData.test.js`：migrate 补 gems/soulJade。
- `gachaEngine.test.js`：新奖池奖励分发。
- `economy` 相关：宝石升级费用曲线。

## 八、装备系列/羁绊、词条/洗练、武器佩戴范围

### 系列与羁绊（3 系列 × 3 槽位）
- **虎啸（攻）**：虎啸刀（武器）/ 虎纹铠（护甲）/ 虎符（饰品）—— 2件攻+8%，3件攻+15%攻速+8%。
- **龙腾（守）**：青龙戟 / 龙鳞甲 / 龙珠 —— 2件主公生命+2，3件生命+4阻挡兵血+20%。
- **凤仪（辅）**：凤翎扇 / 锦凤袍 / 凤钗 —— 2件金币+15%，3件金币+25%眩晕-30%。

### 词条系统
- 每件装备 `基础词条`（装备类型固定）+ `附加词条`（随机池抽取，稀有度越高条数越多/数值越高）。
- 附加词条池：攻击/攻速/暴击/射程/金币/生命。
- 洗练（1 魂玉）刷新附加词条，基础词条不变。

### 装备实例结构
现有 `{uid, id, rarity, lvl}` 增加 `affixes: [...]`。`migrateSave` 给旧装备按稀有度补随机附加词条。

### 武器佩戴范围
- 槽位从固定 `兵骑枪弓炮` 改为动态：基础兵种 5 个 + 已解锁进阶武将（如赵云、吕布、诸葛亮，来自 `unlockedChars` 组词解锁）。
- 每槽可戴一把武器，属性作用于该兵种/武将。
- `battleScene` 的 `unitGear` 支持武将槽位；羁绊加成并入战斗属性计算。

### 测试
- 羁绊：2 件/3 件加成计算。
- 词条：洗练刷新附加词条、魂玉扣减、基础词条不变。
- 武器佩戴：武将槽位出现/作用。
- 存档迁移：旧装备补 affixes。

## 九、README 与分支策略

- 完整 `README.md`：游戏简介、核心玩法、系统架构（Vite+Canvas 前端 / Cloudflare Worker+D1 后端 / Turnstile）、本地开发、部署流程、技术栈与目录结构。
- 分支 `dev/item-overhaul` 分批提交：
  1. 批次1（纯前端小改）：铲子、背包/道具改名+入口、列表滑动、商城刷新、固定头像。
  2. 批次2：货币拆分 + 装备升级宝石 + 抽奖奖池。
  3. 批次3：装备系列/羁绊 + 词条/洗练 + 武器佩戴。
  4. 批次4：排行榜军功修复 + 排序（后端 + D1 migration）。
  5. 批次5：README + 全量测试。
- 全部完成后推送，用户手动 PR 到 preview。

## 发布边界

- 数据库改动仅新增 `users` 表列（迁移 0002），不改既有列语义。
- 存档结构向后兼容（migrate 补默认值）。
- 头像仅前端内置绘制，不引入外部图片。
- 所有测试（前端 + worker）通过后再推送分支。
