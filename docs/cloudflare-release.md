# Wordward：Cloudflare Workers + D1 部署手册

本文是本项目的中文上线步骤。除非特别注明，命令均在项目根目录执行：

```bash
cd /Users/aaron/Projects/wordward-game
```

## 一、最终架构

- Cloudflare Worker：`wordward-game`
- Cloudflare D1：`wordward-production`
- 预览 Worker：`wordward-game-preview`
- 预览 D1：`wordward-preview`
- 静态文件：Vite 生成的 `dist/`
- API：Worker 的 `/api/*`
- 正式域名：`https://sheepgame.top`
- `www.sheepgame.top`：Cloudflare Redirect Rule 301 跳转到主域名

预览环境和正式环境必须使用不同的 D1、Turnstile 密钥和 Worker secrets，不能混用。

## 二、准备 Cloudflare 账号和域名

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，添加 `sheepgame.top`，选择 Free 套餐。
2. 记录 Cloudflare 显示的两条 Nameserver。
3. 登录阿里云：**域名列表 → sheepgame.top → DNS 修改/域名设置 → 修改 DNS 服务器**，替换成 Cloudflare 的两条 Nameserver。
4. 等待 Cloudflare 显示域名为 **Active**。检查：

```bash
dig +short NS sheepgame.top
```

## 三、准备代码并推送 GitHub

```bash
npm ci
npm run verify:worker
git diff --check
git branch --show-current
git remote -v
```

长期分支为 `preview` 和 `main`。功能分支先合并到 `preview`，由 Cloudflare 自动部署预览环境；验证通过后再将 `preview` 合并到 `main`，自动部署正式环境：

```bash
git switch preview
git merge <功能分支>
git push origin preview

# preview.sheepgame.top 验证通过后
git switch main
git merge preview
git push origin main
```

## 四、安装 Wrangler 并登录

```bash
npx wrangler login
npx wrangler whoami
```

## 五、创建两个 D1 数据库

```bash
npx wrangler d1 create wordward-preview
npx wrangler d1 create wordward-production
```

把返回的 `database_id` 分别填入 `wrangler.jsonc` 的 `env.preview` 和 `env.production`。不要修改数据库名称。填写后运行：

```bash
npx wrangler deploy --dry-run --env preview
npx wrangler deploy --dry-run --env production
```

两次输出都应显示正确的 D1 数据库名称，且不应再出现配置警告。

## 六、配置 Rate Limiting

本项目需要注册、登录 IP、登录用户名、功勋四个限流绑定。这里不需要在控制台创建 namespace，也没有单独的“创建 namespace”按钮。

`namespace_id` 只是你在当前 Cloudflare 账号内自定义的正整数标识，必须保持唯一。项目配置已经使用以下编号：

- 顶层默认配置：`1001`–`1004`
- 预览环境：`2001`–`2004`
- 正式环境：`3001`–`3004`

如果这些编号没有被你账号中的其他 Worker 使用，保持不变即可。若部署时 Wrangler 报 namespace 已被占用，就把冲突编号改成其他未使用的正整数，然后重新执行 dry-run。不要把编号写成 `placeholder-2001` 这样的非数字字符串。

默认限制：

- 注册：10 次/60 秒
- 登录 IP：20 次/60 秒
- 登录用户名：10 次/60 秒
- 功勋：30 次/60 秒

## 七、配置 Turnstile

在 **Turnstile → Add site** 创建预览和正式站点。正式站点域名填 `sheepgame.top`、`www.sheepgame.top`，预览站点填 `preview.sheepgame.top`。

把 Site Key 写入 `wrangler.jsonc` 的 `TURNSTILE_SITE_KEY`；Secret Key 不要写入 Git，按下一节设置为 Worker Secret。

## 八、设置 Worker secrets

公开变量由 `wrangler.jsonc` 管理：`APP_ORIGIN`、`PASSWORD_KDF_VERSION`、`PASSWORD_KDF_ITERATIONS`、`TURNSTILE_SITE_KEY`。

预览环境：

```bash
npx wrangler secret put JWT_ACCESS_SECRET --env preview
npx wrangler secret put REFRESH_TOKEN_PEPPER --env preview
npx wrangler secret put CURSOR_SIGNING_SECRET --env preview
npx wrangler secret put TURNSTILE_SECRET_KEY --env preview
```

正式环境：

```bash
npx wrangler secret put JWT_ACCESS_SECRET --env production
npx wrangler secret put REFRESH_TOKEN_PEPPER --env production
npx wrangler secret put CURSOR_SIGNING_SECRET --env production
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
```

每个 secret 使用独立的随机长字符串，预览和正式环境不要复用。

## 九、执行 D1 migration

```bash
npm run d1:migrate:local
npm run d1:migrate:preview
```

正式迁移前，在 Cloudflare D1 页面创建 Time Travel 备份点，然后执行：

```bash
npm run d1:migrate:production
```

## 十、预览部署

先检查绑定：

```bash
npx wrangler deploy --dry-run --env preview
```

确认输出包含 `wordward-preview`、四个 Rate Limit binding 和 Static Assets 后部署：

```bash
npm run deploy:preview
BASE_URL=https://preview.sheepgame.top npm run release:check
```

## 十一、绑定正式域名

1. **Workers & Pages → wordward-game → Settings → Domains & Routes**，添加 Custom Domain：`sheepgame.top`。
2. 确保 DNS 中 `www` 记录开启橙色云代理。
3. **Rules → Redirect Rules → Create rule**：
   - 条件：主机名等于 `www.sheepgame.top`
   - 动作：301 到 `https://sheepgame.top${uri}`
   - 保留查询字符串
4. 等待 SSL/TLS 证书 Active。

验证：

```bash
curl -I https://sheepgame.top/
curl -I https://www.sheepgame.top/
```

## 十二、正式部署

确认 D1 ID、Rate Limit ID、Turnstile Site Key 和 secrets 均已填写：

```bash
npm run verify:worker
npm run deploy:production
BASE_URL=https://sheepgame.top npm run release:check
```

测试注册、登录、刷新页面、退出登录、资料修改、云存档、功勋和排行榜。

## 十三、配置 GitHub 自动部署

为两个 Worker 分别连接同一个 GitHub 仓库：

| Worker | 监听分支 | 构建命令 | 部署命令 |
| --- | --- | --- | --- |
| `wordward-game-preview` | `preview` | `npm run verify:worker` | `npm run deploy:preview` |
| `wordward-game` | `main` | `npm run verify:worker` | `npm run deploy:production` |

仓库均为 `git@github.com:AaronChou313/wordward-game.git`，根目录均为仓库根目录。

不要把 secrets 配置成 GitHub Variables；它们必须保存在 Cloudflare Worker Secrets 中。

## 十四、回滚和故障处理

```bash
npx wrangler deployments list --env production
npx wrangler rollback --env production <版本 ID>
```

只在数据库结构兼容时回滚代码。数据损坏时才使用 D1 Time Travel 恢复；恢复后重新执行发布检查并轮换可能泄露的 secrets。

## 十五、上线后检查

- Cloudflare Analytics 错误率正常。
- 没有 Error 1102、1027、D1 或 Turnstile 错误。
- 全站通过 HTTPS。
- `www.sheepgame.top` 301 到 `sheepgame.top`。
- `dist/` 和构建日志没有 secret。
- 调整 PBKDF2 前先在预览环境基准测试，选择 p95 Worker CPU 不超过 8ms 的最高档位。
