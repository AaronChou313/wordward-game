# 三国文字塔防：Cloudflare Workers 与 D1 完整迁移设计

## 1. 背景与目标

项目当前由 Vite 浏览器游戏、Fastify API、Prisma 和 PostgreSQL 组成，并已有账号、资料、云存档、功勋验证和排行榜功能。本次迁移将完整保留这些在线功能，把生产环境改为 Cloudflare Workers Free 与 D1，不再依赖长期运行的云服务器、Docker、Nginx 或 Caddy。

迁移后的正式站点为 `https://sheepgame.top`。`https://www.sheepgame.top` 仅作为入口，永久跳转到主域名并保留路径与查询参数。代码从 GitHub `main` 分支自动构建和部署，同时保留 Wrangler 手动部署作为故障备用方式。

当前 PostgreSQL 中没有正式用户数据，因此无需迁移旧账号、密码哈希或游戏数据。旧 Docker/PostgreSQL 部署方案保留为备用资料，但不会与 D1 自动同步。

## 2. 范围与非目标

本次迁移必须保留：

- 用户名与密码注册、登录、会话刷新和退出。
- 玩家资料读取与编辑。
- 带版本冲突处理的云存档。
- Boss 功勋申领、进度校验、幂等发放和离线重试。
- 全服排行榜、个人排名和签名游标分页。
- 本地离线游戏能力。
- GitHub 自动部署、Cloudflare HTTPS、自定义域名和可回滚发布。

首版不包含：

- 邮箱、手机号、密码找回或管理员自助重置。
- PostgreSQL 正式数据导入。
- 头像文件上传；资料仍只接受 HTTPS 头像 URL。
- 完整的服务端战斗模拟或绝对防作弊保证。
- D1 全球只读副本。
- Workers Paid、Durable Objects 或第三方托管认证服务。

注册界面必须明确提示：账号没有密码找回能力，玩家应妥善保管密码，并且不要复用重要网站的密码。

## 3. 总体架构

采用“单 Worker + Hono + D1 原生 SQL”架构：

```text
Browser
  |
  | https://sheepgame.top
  v
Cloudflare Worker
  |-- /api/* ------> Hono routes ------> D1
  |-- static files -> Workers Static Assets (dist/)

Cloudflare Redirect Rule
  `-- www host ----> 301 sheepgame.top
```

- Vite 继续生成 `dist/`，由 Workers Static Assets 托管。
- Wrangler 将 `/api/*` 配置为 Worker-first；其他请求优先交给静态资源，不产生不必要的 Worker 执行。
- Hono 替换 Fastify，负责路由、输入校验、认证和错误处理。
- Worker 通过名为 `DB` 的 D1 binding 访问数据库，不存在公网数据库连接字符串。
- 客户端继续通过同域相对路径 `/api` 请求，现有网络层与 Cookie 模型基本保持不变。
- 同域生产部署不启用 CORS。所有改变状态的请求必须通过 Origin 校验。
- `www.sheepgame.top` 由 Cloudflare Single Redirect Rule 返回 `301`，目标为相同路径和查询参数下的 `https://sheepgame.top`。重定向发生在 Worker 之前，避免静态资源请求消耗 Workers Free 请求额度。
- Cloudflare 管理 DNS 代理、TLS 证书和 HTTPS，不再运行传统反向代理。

建议新增目录：

```text
worker/
  index.js
  app.js
  middleware/
  modules/
    auth/
    profile/
    save/
    merit/
    leaderboard/
  db/
    queries/
    migrations/
```

每个业务模块仅依赖明确传入的 bindings、配置和查询函数，避免在模块中直接读取全局环境。原 `server/` 在迁移验证完成前保留，用于对照行为和测试；确认 Worker 生产稳定后，再以独立变更决定是否归档，不在本次迁移中直接删除。

## 4. Cloudflare bindings 与配置

Worker 至少使用以下 bindings：

- `DB`：生产或预览环境对应的 D1 数据库。
- `ASSETS`：Vite 的 `dist/` 静态资源。
- 注册限流 binding。
- 登录 IP 限流 binding。
- 登录用户名限流 binding。
- 功勋提交限流 binding。

以下值使用 Worker Secrets，绝不提交到 Git：

- `JWT_ACCESS_SECRET`
- `REFRESH_TOKEN_PEPPER`
- `CURSOR_SIGNING_SECRET`
- `TURNSTILE_SECRET_KEY`
- 受保护部署烟雾测试所需的 secret

以下非敏感值使用 Wrangler vars：

- `APP_ORIGIN=https://sheepgame.top`
- `PASSWORD_KDF_VERSION`
- `PASSWORD_KDF_ITERATIONS`
- `TURNSTILE_SITE_KEY`（也可在前端构建变量中公开）

预览环境与生产环境必须使用不同的 D1 数据库、Secrets 和 Turnstile 配置，防止测试数据进入生产库。

## 5. 账号认证设计

### 5.1 凭据规范

- 用户名执行 Unicode NFKC 规范化、去除首尾空白并转换为小写。
- 用户名长度为 3–24 个 Unicode 字符，并由 D1 唯一索引保证不可重复。
- 密码长度为 10–128 个 Unicode 字符。
- D1 绝不保存明文密码，只保存算法版本、随机盐、迭代次数和派生结果。

密码哈希使用 Workers 原生 Web Crypto 的 PBKDF2-SHA-256。每个账号使用独立的密码学随机盐，派生结果采用恒定时间比较。不存在的用户名也执行同参数的虚拟校验，降低用户名探测风险。

Workers Free 的单次 HTTP 请求 CPU 限制为 10ms，因此迭代次数通过真实预览 Worker 基准确定，而不是直接沿用服务器端 Argon2 参数：

1. 对多档 PBKDF2 参数执行冷、热请求基准。
2. 以登录请求 p95 Worker CPU 不超过 8ms 为目标，预留 Hono、JWT 和输入校验开销。
3. 选择满足目标的最高迭代次数并固化到生产配置。
4. 每条用户记录保存实际 KDF 版本和迭代次数，便于未来登录时升级。
5. 若最低候选参数仍持续触发 10ms 限制，则不能继续降低安全强度上线；届时必须重新选择通行密钥或 Workers Paid。该失败条件优先于“性能优先”的偏好。

### 5.2 Turnstile 与限流

注册和登录在执行密码派生前完成以下检查：

1. 校验请求体和 Origin。
2. 检查 Cloudflare Rate Limiting binding。
3. 服务端验证 Turnstile token，并传递 Cloudflare 提供的客户端 IP。
4. 只有通过后才执行 PBKDF2 和 D1 写入。

注册按 IP 限流；登录同时按 IP 和规范化用户名限流。功勋提交另有用户级限流。Rate Limiting binding 是近似、按 Cloudflare 位置收敛的保护层，不承担准确计费或数据库一致性职责；最终正确性仍由 D1 唯一约束和条件写入保证。

### 5.3 会话

- access token 使用 HMAC-SHA-256 JWT，有效期 15 分钟，只保存在前端内存。
- refresh token 使用 `crypto.getRandomValues()` 生成 256 位随机值。
- 浏览器仅通过 `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` Cookie 保存 refresh token。
- D1 只保存 refresh token 的带 pepper HMAC-SHA-256 摘要。
- refresh token 有效期 30 天，并在每次刷新时旋转。
- access token 至少包含用户 ID、用户名、签发时间和过期时间；Worker 每次认证还要确认账号状态仍为 `ACTIVE`，避免禁用账号继续使用未过期 token。
- 退出登录会撤销当前 refresh token 并清除 Cookie。

旋转流程通过 D1 原子批处理完成。Worker 先为候选新 token 生成 ID；第一条 SQL 仅在旧 token 未撤销、未过期且账号有效时将其撤销，并把 `rotated_to_id` 设置为该候选 ID；第二条 SQL 使用 `INSERT ... SELECT`，仅在旧记录的 `rotated_to_id` 等于本次候选 ID 时创建新 token。并发复用同一个 refresh token 时只有一次条件更新能命中，因此最多一个请求成功。失败或重放时清除浏览器 Cookie 并返回 `401`。

## 6. D1 数据模型

D1 使用 SQLite 语义：日期保存为 Unix 毫秒整数，JSON 保存为文本，枚举使用 `TEXT` 与 `CHECK`，ID 使用 `crypto.randomUUID()`。所有外键均启用并使用适当的级联删除规则。

核心表：

### `users`

- `id`，主键。
- `username`，唯一规范化用户名。
- `password_hash`、`password_salt`、`password_kdf`、`password_iterations`。
- `status`，仅允许 `ACTIVE` 或 `DISABLED`。
- `merit_total`。
- `merit_reached_at`。
- `created_at`、`updated_at`。

### `profiles`

- `user_id`，主键和外键。
- `nickname`、`avatar_url`、`bio`、`updated_at`。

### `game_saves`

- `user_id`，主键和外键。
- `schema_version`。
- `version`，乐观锁版本。
- `data_json`。
- `updated_at`。

### `merit_claims`

- claim ID、用户 ID、难度、无尽层数、Boss 波数和功勋。
- `awarded_at`，初始为空；只有成功记入用户总数的 claim 才填充。
- run ID、seed、开始/结束时间和摘要 JSON。
- 创建时间。
- `(user_id, difficulty, endless_floor, boss_wave)` 唯一约束。

### `merit_run_checkpoints`

- checkpoint ID、用户 ID、run ID、难度、无尽层数和 seed。
- 开始时间、最后 Boss 波数、最后完成时间和更新时间。
- `(user_id, run_id)` 唯一约束。

### `refresh_tokens`

- token ID、用户 ID、唯一 token 摘要。
- 过期时间、撤销时间和创建时间。
- `rotated_to_id`，仅在成功轮换时记录本次生成的新 token ID，用于并发条件写入。

保留排行榜、claim 查询、checkpoint 清理和 refresh token 查询所需组合索引。数据库模式以版本化 SQL migrations 管理，通过 Wrangler 记录和应用，不使用 Prisma Migrate。

## 7. 云存档一致性

云存档继续使用当前客户端已经支持的乐观并发模型：

- 客户端读取 `{ version, data }`。
- 首次创建必须携带 `version: 0`。
- 后续写入必须携带上次读取到的版本。
- D1 使用单条条件 upsert 或等价的条件更新完成“比较版本并递增”，不采用先读后写。
- 写入未命中表示版本冲突；Worker 再读取最新存档，返回 `409` 和 `current`。
- 多个并发首次创建由主键唯一约束裁决，失败方返回当前存档。
- 客户端不得上传 `merit` 等服务器保护字段。
- 存档 JSON 序列化后的 UTF-8 大小不得超过 256KiB。
- `data.version` 必须是大于等于 1 的有效存档 schema 版本。

现有客户端的冲突提示、本地版本元数据、离线重试和“使用本地/云端存档”流程继续保留。

## 8. 功勋验证与原子发放

Worker 保留现有规则校验：难度、无尽层数、Boss 波数、解锁顺序、run 连续性、seed、战斗时长、击杀数合理范围、领主生命值和未来时间容差。

写入过程使用 D1 条件 SQL、唯一约束和 `batch()`：

1. Worker 生成本次唯一 claim ID，并完成纯输入校验。
2. 条件 `INSERT ... SELECT` 仅在账号有效、前置 claim 已存在且 checkpoint 合法时插入本次 claim；`INSERT OR IGNORE` 处理重复业务键。
3. claim 唯一约束保证相同用户、难度、无尽层数和 Boss 波次只能成功一次。
4. checkpoint 创建或推进的 SQL 以本次业务 claim 已存在为条件。
5. 用户功勋增加的 SQL 只匹配该业务唯一键对应且 `awarded_at IS NULL` 的 claim，并在同一语句中递增用户总数。
6. 随后的 SQL 只把该 claim 的 `awarded_at` 从 `NULL` 更新为当前时间；由于整个 batch 原子且顺序执行，重复请求看见的 claim 已有 `awarded_at`，不会再次计入。
7. 所有相关语句在一个 `DB.batch()` 中顺序、原子执行；任一语句失败则整批回滚。
8. 重复提交读取既有 claim，返回 `awarded: false`，不会再次增加总数。
9. 对约束竞争或暂时性 D1 错误，只执行有界、幂等重试。

实现计划必须先用本地 D1 集成测试证明以下竞态：同一 claim 并发两次、相邻波次乱序、重复 refresh、首次 checkpoint 并发和请求超时后重试。未通过这些测试不能替换现有 PostgreSQL 实现。

48 小时前的无关 checkpoint 采用低频机会清理或单独的计划任务，清理具有上限，避免每次普通 API 请求都扫描大量记录。

首版功勋系统仍属于规则验证，而非可信服务端战斗模拟；文档和产品表述不得承诺完全防作弊。

## 9. 排行榜

排行榜排序保持为：

1. `merit_total` 降序。
2. `merit_reached_at` 升序。
3. `id` 升序。

只显示 `ACTIVE` 且功勋大于零的账号。列表使用 keyset pagination，不使用 `OFFSET`。游标包含最后一行的三个排序字段和累计排名，并由独立的 `CURSOR_SIGNING_SECRET` 进行 HMAC-SHA-256 签名；解析时执行恒定时间签名比较和字段校验。

`GET /api/leaderboard` 公开访问；`GET /api/leaderboard/me` 需要登录，并以相同排序规则计算个人名次。

首版不开启 D1 全球只读副本，全部读取走主库，以避免玩家刚领取功勋后看见旧排行榜。流量增长后再独立评估 D1 Sessions API 和读取副本。

## 10. API 兼容与错误模型

保留现有路径：

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/profile
PUT  /api/profile
GET  /api/save
PUT  /api/save
POST /api/merit/claims
GET  /api/leaderboard
GET  /api/leaderboard/me
GET  /api/health
```

注册和登录请求新增 `turnstileToken`；其他主要请求和响应结构保持兼容。稳定错误结构为：

```json
{
  "error": "User-readable message",
  "code": "STABLE_MACHINE_CODE"
}
```

状态码约定：

- `400`：输入、存档或战斗数据无效。
- `401`：认证或 refresh token 无效。
- `403`：账号禁用、Origin 不合法或 Turnstile 拒绝。
- `404`：资源不存在。
- `409`：用户名或存档版本冲突。
- `413`：请求或存档过大。
- `429`：请求过于频繁。
- `500`：未预期内部错误。
- `503`：D1 或 Turnstile 暂时不可用。

Hono 中央错误处理中间件不得把 SQL、Secrets 或调用栈返回给客户端。结构化日志只记录请求 ID、路由、状态码、错误类别和耗时，不记录密码、令牌、完整存档、战斗摘要或 Turnstile token。

未匹配的 `/api/*` 返回 JSON `404`；其他路径交给 Static Assets。`/api/health` 只确认 Worker 正常，不公开查询 D1。D1 烟雾检查使用受 secret 保护的发布验证路径或部署脚本直接执行，不产生公开数据库探测面。

## 11. 客户端调整

现有 `/api` 相对请求、access token 内存存储、refresh Cookie、云存档队列和功勋队列保留。客户端只需进行必要适配：

- 注册/登录界面加载 Turnstile，并将短期 token 一并提交。
- 明确展示“无法找回密码”和“不要复用重要密码”的提示。
- 为 Turnstile 加载失败、`429`、`503` 和 Worker 离线提供可理解提示。
- 保持注册和登录不做隐式自动重试。
- 云存档和功勋仅按现有幂等规则重试。
- 不把 Turnstile secret、JWT secret 或其他服务端配置写入前端 bundle。

## 12. 测试策略

### 单元测试

- 用户名规范化、密码参数校验和恒定时间比较包装。
- JWT 签发与验证、过期和账号禁用。
- Origin、Turnstile 和限流中间件。
- 存档字段过滤、大小限制和版本响应。
- 功勋规则、排行榜游标和错误映射。

### 本地 D1 集成测试

- migrations 可从空库完整应用。
- 注册唯一约束及用户/资料原子创建。
- refresh token 并发旋转最多成功一次。
- 存档首次创建、版本递增、并发冲突和超时重试。
- 功勋重复、乱序、并发、checkpoint 修复和总数一致性。
- 排行榜排序、分页、禁用账号过滤和个人名次。
- 外键级联和 JSON 往返。

### 端到端与发布验证

- 运行现有前端测试和 Vite 生产构建。
- 使用 `wrangler dev` 验证静态资源、API 与持久化本地 D1。
- 在非生产 D1 的 Cloudflare 预览环境验证 Turnstile、Cookie、HTTPS 和 PBKDF2 CPU。
- PBKDF2 以 p95 CPU 不超过 8ms 为上线门槛，并观察是否出现 Error 1102。
- 在生产域名验证注册、登录、刷新、退出、两设备存档冲突、重复功勋和排行榜。
- 检查 Worker 日志不存在敏感信息。

## 13. GitHub 自动部署

正式部署分支为 `main`。功能迁移在 `codex/` 前缀的独立分支完成，经测试和评审后合并。

自动化分两级：

- Pull Request/功能分支：安装依赖、运行前后端测试、创建空的本地 D1、应用 migrations、运行 D1 集成测试并执行 Vite 构建。预览 Worker只能绑定预览 D1。
- `main`：重复全部验证，记录 production D1 Time Travel bookmark，应用未执行 migrations，部署 Worker，然后运行生产烟雾测试。

若 Cloudflare Git 集成无法可靠表达“migration 成功后才部署”的顺序，则使用 GitHub Actions 作为唯一生产发布器，通过 Cloudflare API token 调用 Wrangler；不能同时开启两个会竞争部署的生产流水线。无论使用哪种实现，用户体验仍是合并到 GitHub `main` 后自动部署。

生产 migration 失败时停止发布。烟雾测试失败时立即把 Worker 回滚到上一部署，并根据 schema 兼容性决定是否恢复 D1 bookmark。所有 migration 默认向后兼容；删除表、删除字段或不可逆重写必须放在后续独立发布中。

## 14. 域名与 HTTPS 上线

上线前先把域名接入 Cloudflare：

1. 在 Cloudflare 添加 `sheepgame.top` zone。
2. 复制 Cloudflare 分配的两条 nameserver。
3. 在阿里云域名控制台把原 nameserver 替换为这两条。
4. 等待 Cloudflare 将 zone 标记为 Active。
5. 将 `sheepgame.top` 添加为 Worker Custom Domain。
6. 为 `www.sheepgame.top` 建立受 Cloudflare 代理的 DNS 记录并配置 Single Redirect Rule，保留路径和查询参数跳转到主域。
7. 由 Cloudflare 签发两个 hostname 的证书。
8. 验证主域 HTTPS 与 `www` 的 301 跳转。

Custom Domain hostname 上不能保留冲突的旧 A、AAAA 或 CNAME 记录。切换前应记录旧 DNS 值，待新 Worker 验证完成后再清理冲突记录。

## 15. 备份、回滚与监控

- D1 Time Travel 自动启用；每次生产 migration 前记录可恢复 bookmark。
- Worker 代码故障通过 Cloudflare Deployments 回滚上一版本。
- 数据误写可使用 Time Travel 恢复到 migration 前状态。
- 生产 migration 保持旧 Worker 可运行，避免代码回滚后 schema 不兼容。
- 监控 Workers 请求量、CPU、Error 1102、Error 1027、异常率和 D1 rows read/write。
- Workers Free 当前每日最多 100,000 个 Worker 请求；接近额度时应先减少非必要 API 请求和公开健康探测，再评估升级。
- 定期清理已撤销/过期 refresh tokens 和过期 checkpoints，单次删除设置上限。

## 16. 上线验收标准

以下条件全部满足才可切换正式域名：

- 所有前端、Worker 和 D1 集成测试通过。
- Vite 生产构建和 Worker bundle 构建成功。
- migrations 能从空库完整应用，并在预览 D1 验证。
- `sheepgame.top` HTTPS 正常，`www` 以 301 保留路径与查询参数跳转。
- 注册和登录通过 Turnstile，密码只以带盐 PBKDF2 派生结果保存。
- PBKDF2 预览基准满足 p95 CPU 不超过 8ms，且没有持续 Error 1102。
- refresh token 旋转、重放拒绝和退出有效。
- 两个客户端并发写存档时能正确返回和处理 `409`。
- 同一功勋并发或重复提交只增加一次，非法进度无法领取。
- 排行榜排序、游标分页、个人排名和禁用账号过滤正确。
- 日志和前端 bundle 不包含 Secrets、密码、令牌或完整存档。
- 自动发布在 migration 或烟雾测试失败时能停止或回滚。

## 17. 官方能力依据

设计基于迁移时的 Cloudflare 官方文档：

- Workers Static Assets routing：`https://developers.cloudflare.com/workers/static-assets/routing/`
- Workers Custom Domains：`https://developers.cloudflare.com/workers/configuration/routing/custom-domains/`
- Workers Free limits：`https://developers.cloudflare.com/workers/platform/limits/`
- Workers Rate Limiting binding：`https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/`
- Workers Web Crypto：`https://developers.cloudflare.com/workers/runtime-apis/web-crypto/`
- D1 Database API 与原子 batch：`https://developers.cloudflare.com/d1/worker-api/d1-database/`
- D1 migrations：`https://developers.cloudflare.com/d1/reference/migrations/`
- D1 Time Travel：`https://developers.cloudflare.com/d1/reference/time-travel/`

Cloudflare 产品限制可能变化；实际实施和部署文档应锁定 Wrangler 版本，并在上线当天再次核对 Free 额度、CPU 限制与命令参数。
