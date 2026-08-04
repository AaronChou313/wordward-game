# Wordward 正式环境部署手册

> Cloudflare Workers is the release target for the D1 migration. The legacy Docker/PostgreSQL instructions below remain as a fallback reference only. Follow [docs/cloudflare-release.md](cloudflare-release.md) for `main`, preview/production separation, secrets, domain cutover, and rollback.

本文档适用于本项目当前的正式环境，按顺序复制命令即可完成第一次部署。

固定信息：

- 操作系统：Ubuntu 22.04 LTS
- GitHub 仓库：`git@github.com:AaronChou313/wordward-game.git`
- 生产分支：`feature/gameplay-overhaul`
- 主域名：`sheepgame.top`
- 辅助域名：`www.sheepgame.top`，自动跳转到主域名
- 服务器公网 IP：`47.79.233.169`
- 服务器用户：`root`
- 项目目录：`/opt/wordward`
- 内部应用端口：`127.0.0.1:8080`

部署后的运行结构如下：

```text
浏览器
  -> HTTPS 443
  -> Caddy（自动申请和续期 HTTPS 证书）
  -> 127.0.0.1:8080
  -> Docker Web/Nginx
       -> 静态游戏页面
       -> /api 转发到 Docker API
  -> Docker PostgreSQL
```

Docker Compose 会管理三个容器：

- `db`：PostgreSQL 16 数据库。
- `api`：Node.js API、用户账号、云存档和排行榜。
- `web`：游戏网页以及到 API 的内部转发。

Caddy 只负责公开的 80/443 端口和 HTTPS。数据库、API、Docker Web 端口都不直接暴露到公网。

## 1. 第一次部署前的检查清单

开始前确认你已经拥有：

- 新服务器的 root 登录权限。
- 服务器现有的 GitHub SSH 密钥能够读取本仓库。
- 阿里云域名和服务器安全组的管理权限。
- 本地项目目录 `/Users/aaron/Projects/wordward-game`。

以下步骤分为“本地电脑执行”“阿里云控制台操作”和“服务器执行”。不要在错误的机器上执行命令。

## 2. 在本地完成发布测试和 Git 提交

本节全部在你的 Mac 本地执行。

### 2.1 进入项目目录

```bash
cd /Users/aaron/Projects/wordward-game
```

### 2.2 确认当前分支

```bash
git branch --show-current
```

预期输出：

```text
feature/gameplay-overhaul
```

如果不是该分支，先停止部署并切换到正确分支：

```bash
git switch feature/gameplay-overhaul
```

### 2.3 安装锁定版本的依赖

```bash
npm ci
npm --prefix server ci
```

两条命令都必须成功结束。

### 2.4 运行完整检查

依次执行：

```bash
npm test
npm --prefix server test
npm run build
npm --prefix server run prisma:validate
git diff --check
```

所有命令都必须以退出码 0 结束。当前没有单独的 ESLint 命令。

### 2.5 查看即将发布的改动

```bash
git status --short
git diff --stat
```

确认没有 `.env`、密码、证书、数据库备份等敏感文件。`.env` 已被 `.gitignore` 忽略，仍然不要使用 `git add -f` 强行提交它。

### 2.6 提交当前发布版本

当前工作区的安全发布改动必须先进入 GitHub，服务器才能拉取到它们。

```bash
git add .
git status --short
```

再次检查暂存列表，然后提交：

```bash
git commit -m 'Harden production release'
```

如果 Git 提示没有可提交内容，说明改动已经提交，可以继续。

### 2.7 推送生产分支

```bash
git push origin feature/gameplay-overhaul
```

验证本地已经不再领先远端：

```bash
git status --short --branch
```

输出中不应再出现 `ahead`。记下本次发布提交：

```bash
git rev-parse --short HEAD
```

## 3. 配置阿里云 DNS 和安全组

本节在阿里云网页控制台操作。

### 3.1 检查 DNS

在域名 `sheepgame.top` 的 DNS 解析中确认存在：

| 记录类型 | 主机记录 | 记录值 |
| --- | --- | --- |
| A | `@` | 新服务器公网 IP |
| A | `www` | 新服务器公网 IP |

不要给这两个域名保留指向旧服务器的其他 A 记录。如果存在 AAAA 记录，但服务器没有正确配置 IPv6，请删除 AAAA 记录，否则部分用户可能访问失败。

在本地验证：

```bash
dig +short A sheepgame.top
dig +short A www.sheepgame.top
```

两条命令都应输出新服务器公网 IP。DNS 传播可能需要几分钟到数小时。

### 3.2 配置服务器安全组

在新服务器的安全组“入方向”允许：

| 协议 | 端口 | 来源 | 用途 |
| --- | --- | --- | --- |
| TCP | 22 | 建议只允许你的公网 IP；临时也可用 `0.0.0.0/0` | SSH |
| TCP | 80 | `0.0.0.0/0` | HTTPS 证书申请和 HTTP 跳转 |
| TCP | 443 | `0.0.0.0/0` | 正式 HTTPS 访问 |

如果启用了 IPv6，再为 80/443 添加 `::/0`。

不要开放以下端口：

- 5432：数据库端口。
- 3000：API 容器端口。
- 8080：内部 Web 端口。

## 4. 登录服务器并安装基础工具

本节开始全部在新服务器执行。

从本地登录服务器：

```bash
ssh root@47.79.233.169
```

登录成功后，命令提示符通常类似：

```text
root@iZxxxx:~#
```

### 4.1 更新系统软件索引

```bash
apt-get update
apt-get upgrade -y
```

如果升级过程中提示选择配置文件，一般保留当前本地版本即可。若提示需要重启：

```bash
reboot
```

SSH 会断开。等待约一分钟后重新登录，再继续后面的步骤。

### 4.2 安装常用工具

```bash
apt-get install -y ca-certificates curl gnupg git openssl ufw
```

### 4.3 为 2 GB 服务器增加 2 GB Swap

先检查现有 Swap：

```bash
swapon --show
```

如果已经存在至少 2 GB Swap，可以跳到 4.4。

如果没有输出，执行：

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

`free -h` 应显示约 2 GB 的 Swap。Swap 是内存不足时的保险，不代替正常内存。

### 4.4 配置服务器本机防火墙

先允许 SSH，避免把自己锁在服务器外：

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

预期能看到 22、80、443 被允许。不要允许 3000、5432 或 8080。

## 5. 安装 Docker 和 Docker Compose

以下命令使用 Docker 官方 Ubuntu 软件源。

### 5.1 添加 Docker 官方签名和软件源

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
source /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
```

### 5.2 安装 Docker

```bash
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

### 5.3 验证 Docker

```bash
docker --version
docker compose version
systemctl is-active docker
```

预期最后一条输出：

```text
active
```

## 6. 验证服务器访问 GitHub

服务器已经配置为可以通过 `git@github.com:...` 访问仓库。本节只验证现有配置，不覆盖任何 SSH 密钥或 `/root/.ssh/config`。

### 6.1 测试 GitHub 认证

```bash
ssh -T git@github.com
```

第一次测试可能输出类似：

```text
Hi AaronChou313/wordward-game! You've successfully authenticated, but GitHub does not provide shell access.
```

GitHub 的这条命令通常以非零状态结束，但看到 `successfully authenticated` 就表示成功。

如果看到 `Permission denied (publickey)`，先不要继续部署。执行以下命令检查现有配置，但不要把私钥内容发给任何人：

```bash
ls -la /root/.ssh
sed -n '1,160p' /root/.ssh/config 2>/dev/null || true
ssh -vT git@github.com
```

只可以分享以 `.pub` 结尾的公钥，绝不能分享没有 `.pub` 后缀的私钥。

### 6.2 验证仓库读取权限

```bash
git ls-remote git@github.com:AaronChou313/wordward-game.git HEAD
```

预期输出是一串提交哈希，后面跟着 `HEAD`。只有这条命令成功后才继续克隆。

## 7. 克隆生产代码

### 7.1 创建项目目录

如果 `/opt/wordward` 不存在，执行：

```bash
git clone --branch feature/gameplay-overhaul --single-branch \
  git@github.com:AaronChou313/wordward-game.git /opt/wordward
```

进入项目目录：

```bash
cd /opt/wordward
```

### 7.2 验证分支和提交

```bash
git branch --show-current
git log -1 --oneline
git status --short
```

预期：

- 分支为 `feature/gameplay-overhaul`。
- 最新提交与本地刚推送的提交一致。
- `git status --short` 没有输出。

如果 `/opt/wordward` 已经存在且是旧的测试部署，不要直接删除数据库卷。先执行：

```bash
cd /opt/wordward
git status --short
```

如果有输出，先确认这些服务器本地改动是否需要保留。生产服务器正常情况下不应直接修改代码。

## 8. 创建生产环境变量

`.env` 保存数据库密码和登录令牌密钥，只存在服务器，不提交 GitHub。

### 8.1 生成生产密钥

确认位于项目目录：

```bash
cd /opt/wordward
```

执行以下整段命令：

```bash
wordward_db_password="$(openssl rand -hex 24)"
wordward_jwt_secret="$(openssl rand -hex 48)"
wordward_refresh_pepper="$(openssl rand -hex 48)"

umask 077

cat > .env <<EOF
POSTGRES_DB=wordward
POSTGRES_USER=wordward
POSTGRES_PASSWORD=${wordward_db_password}
DATABASE_URL=postgresql://wordward:${wordward_db_password}@db:5432/wordward
JWT_ACCESS_SECRET=${wordward_jwt_secret}
REFRESH_TOKEN_PEPPER=${wordward_refresh_pepper}
APP_ORIGIN=https://sheepgame.top
HTTP_BIND=127.0.0.1
HTTP_PORT=8080
EOF

chmod 600 .env
unset wordward_db_password wordward_jwt_secret wordward_refresh_pepper
```

密码使用十六进制字符，因此不需要额外进行 URL 编码。

### 8.2 验证环境变量文件

不要执行 `cat .env`，避免将密码显示或复制到聊天记录。

验证权限和变量名：

```bash
ls -l .env
sed -E 's/=.*/=<已隐藏>/' .env
```

权限应类似：

```text
-rw------- 1 root root ... .env
```

验证 Compose 配置：

```bash
docker compose --env-file .env config --quiet
```

没有输出且返回命令提示符即表示配置有效。

## 9. 第一次构建和启动应用

这台服务器只有 2 GB 内存，因此必须顺序构建，不要使用并行构建。

### 9.1 顺序构建 Web 和 API

```bash
cd /opt/wordward
docker compose build web
docker compose build api
```

第一次构建需要下载镜像和 npm 依赖，可能持续几分钟。不要在构建过程中重复执行命令。

如果 SSH 因长时间无操作断开，重新登录后检查：

```bash
cd /opt/wordward
docker compose images
```

缺少哪个镜像，就重新执行对应的 `docker compose build`。

### 9.2 启动三个服务

```bash
docker compose up -d
```

### 9.3 查看启动状态

```bash
docker compose ps
```

数据库首先启动，API 等数据库健康后运行迁移，Web 最后启动。第一次启动可能需要 30 至 90 秒。

API 容器每次启动都会先自动执行 `npm run prisma:migrate:deploy`，成功应用 `server/prisma/migrations/` 中尚未执行的正式 migration，然后才启动 API。不要在生产数据库上运行 `prisma db push`。

等待一分钟后再次执行：

```bash
docker compose ps
```

三个服务最终都应显示 `healthy`。

如果某个服务不是 healthy，查看日志：

```bash
docker compose logs --tail=200 db api web
```

### 9.4 在服务器内部验证应用

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
```

预期输出：

```json
{"status":"ok"}
```

再检查网页：

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/ | head
```

应看到以 `<!doctype html>` 开头的 HTML。

此时应用只监听服务器本地的 8080，公网仍不能访问；下一步由 Caddy 提供 HTTPS。

## 10. 安装 Caddy

Caddy 是服务器上的 HTTPS 入口。它会自动向 Let's Encrypt 或 ZeroSSL 申请证书，并自动续期。

### 10.1 安装 Caddy 官方软件源

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
```

```bash
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy
```

### 10.2 写入 Caddy 配置

以下配置实现：

- `https://sheepgame.top` 提供游戏。
- `http://sheepgame.top` 自动跳转到 HTTPS。
- `www.sheepgame.top` 自动跳转到 `https://sheepgame.top`。
- 添加 HSTS 响应头。

执行：

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
www.sheepgame.top {
    redir https://sheepgame.top{uri} permanent
}

sheepgame.top {
    encode zstd gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }

    reverse_proxy 127.0.0.1:8080
}
EOF
```

### 10.3 验证配置并启动 Caddy

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy
systemctl status caddy --no-pager
```

预期状态中包含：

```text
Active: active (running)
```

Caddy 申请证书通常需要数秒到一分钟。查看实时日志：

```bash
journalctl -u caddy -f
```

看到证书申请成功后，按 `Ctrl+C` 退出日志查看。这只会退出日志，不会停止 Caddy。

如果证书申请失败，先检查：

- `sheepgame.top` 和 `www.sheepgame.top` 是否都指向新服务器。
- 阿里云安全组是否允许公网访问 80/443。
- `ufw status` 是否允许 80/443。
- 是否还有 Nginx、Apache 等其他程序占用 80/443。

检查端口占用：

```bash
ss -lntp | grep -E ':(80|443)\s'
```

正常情况下应由 Caddy 监听这些端口。

## 11. 正式上线验证

### 11.1 在服务器验证 HTTPS

```bash
curl --fail --silent --show-error https://sheepgame.top/api/health
```

预期输出：

```json
{"status":"ok"}
```

检查主站响应：

```bash
curl -I https://sheepgame.top/
```

预期包含 `HTTP/2 200` 或 `HTTP/1.1 200`。

检查 www 跳转：

```bash
curl -I https://www.sheepgame.top/test-path
```

预期包含：

```text
Location: https://sheepgame.top/test-path
```

### 11.2 在本地浏览器验证

打开：

```text
https://sheepgame.top
```

确认浏览器地址栏显示 HTTPS 锁标识，然后至少完成以下检查：

1. 首页正常显示，Canvas 没有空白。
2. 可以进入和退出战斗。
3. 注册一个测试账号并登录。
4. 修改资料后刷新页面，资料仍然存在。
5. 产生云存档后刷新页面，进度可以恢复。
6. 排行榜能加载。
7. 打开浏览器开发者工具，Console 没有红色错误。
8. 访问 `https://www.sheepgame.top` 会跳转到 `https://sheepgame.top`。

### 11.3 检查服务器最终状态

```bash
cd /opt/wordward
docker compose ps
docker compose logs --since=10m api web db
systemctl is-active docker
systemctl is-active caddy
```

Docker 和 Caddy 都应输出 `active`，三个容器应为 healthy，日志中不应有持续报错或重启循环。

## 12. 配置数据库每日自动备份

生产数据位于 Docker 数据卷中。不要只依赖数据卷，至少每日导出一次数据库。

### 12.1 创建备份目录

```bash
cd /opt/wordward
chmod 700 deploy/backup.sh
install -d -m 700 /srv/wordward-backups
```

### 12.2 手动测试一次备份

```bash
cd /opt/wordward
./deploy/backup.sh
```

检查文件：

```bash
ls -lh /srv/wordward-backups
```

脚本只会在 `pg_dump` 成功、文件非空且 `pg_restore --list` 能读取时，把临时文件原子改名为最终 `.dump`。命令会输出最终备份路径；对应文件应该存在且大小不是 0。

### 12.3 添加每日定时任务

```bash
cat > /etc/cron.d/wordward-backup <<'EOF'
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

30 3 * * * root cd /opt/wordward && BACKUP_PREFIX=wordward RETENTION_DAYS=14 ./deploy/backup.sh
EOF
```

```bash
chmod 644 /etc/cron.d/wordward-backup
systemctl restart cron
systemctl is-active cron
```

这会每天 03:30 备份，并删除超过 14 天的本机备份。还应定期把备份复制到另一台服务器或对象存储；同一台服务器上的备份无法防止整机损坏。

### 12.4 数据库恢复演练

恢复命令会修改数据库。第一次演练必须使用单独的临时数据库，绝不能覆盖正式数据库 `wordward`。

先选择一个已经存在的备份文件：

```bash
ls -lh /srv/wordward-backups
```

把下面命令中的 `备份文件名.dump` 替换成实际文件名。先执行创建、恢复和查询三条命令；只有三条都成功后，才单独执行删除临时数据库的命令。

```bash
cd /opt/wordward
docker compose exec -T db sh -c \
  'createdb -U "$POSTGRES_USER" wordward_restore_test'

docker compose exec -T db sh -c \
  'pg_restore -U "$POSTGRES_USER" -d wordward_restore_test --clean --if-exists' \
  < /srv/wordward-backups/备份文件名.dump

docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d wordward_restore_test -c "SELECT count(*) FROM users;"'
```

前三条命令成功后清理临时数据库：

```bash
cd /opt/wordward
docker compose exec -T db sh -c \
  'dropdb -U "$POSTGRES_USER" wordward_restore_test'
```

第三条命令应成功返回用户数量。最后一条命令只删除临时恢复数据库。记录演练日期、使用的备份文件、用户数量和恢复耗时。

如果任一步失败，先保留临时数据库和日志进行排查，不要对正式数据库尝试相同操作。

## 13. 以后发布新版本

每次更新都按本节执行，不要直接在生产服务器修改代码。

### 13.1 本地测试、提交和推送

在本地：

```bash
cd /Users/aaron/Projects/wordward-game
git switch feature/gameplay-overhaul
git pull --ff-only origin feature/gameplay-overhaul
npm ci
npm --prefix server ci
npm test
npm --prefix server test
npm run build
npm --prefix server run prisma:validate
git diff --check
```

检查并提交：

```bash
git status --short
git add .
git status --short
git commit -m '描述本次更新'
git push origin feature/gameplay-overhaul
```

### 13.2 服务器备份数据库

登录服务器：

```bash
ssh root@47.79.233.169
```

执行：

```bash
cd /opt/wordward
BACKUP_PREFIX=predeploy RETENTION_DAYS=30 ./deploy/backup.sh
```

脚本输出最终备份路径。确认该文件非空且已通过归档目录校验：

```bash
latest_backup=$(find /srv/wordward-backups -type f -name 'predeploy-*.dump' -print | sort | tail -1)
test -n "$latest_backup"
test -s "$latest_backup"
docker compose exec -T db sh -c 'pg_restore --list' < "$latest_backup" > /dev/null
ls -lh "$latest_backup"
```

### 13.3 拉取新代码

先记录旧提交，便于回滚：

```bash
git rev-parse HEAD > /root/wordward-previous-commit
git status --short
```

`git status --short` 必须没有输出。如果有输出，不要强行 reset，先查明服务器为何出现本地改动。

拉取：

```bash
git pull --ff-only origin feature/gameplay-overhaul
git log -1 --oneline
```

### 13.4 顺序重新构建并启动

```bash
docker compose --env-file .env config --quiet
docker compose build web
docker compose build api
docker compose up -d
```

Compose 会保留数据库数据卷，并自动运行已提交的 Prisma migration。

验证：

```bash
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
curl --fail --silent --show-error https://sheepgame.top/api/health
docker compose logs --since=10m api web db
```

确认浏览器中的主要功能正常后，本次更新完成。

### 13.5 清理无用镜像

确认新版本稳定后，可以清理未使用的构建缓存和悬空镜像：

```bash
docker image prune -f
docker builder prune -f --filter 'until=168h'
```

不要执行 `docker system prune --volumes`，它可能删除重要数据卷。

## 14. 应用代码回滚

本节只回滚应用代码。数据库 migration 应保持向前兼容；不要自行执行破坏性反向 SQL。

### 14.1 查看部署前提交

```bash
cat /root/wordward-previous-commit
```

### 14.2 临时切换到旧提交

```bash
cd /opt/wordward
previous_commit="$(cat /root/wordward-previous-commit)"
git switch --detach "$previous_commit"
```

### 14.3 重建应用容器

```bash
docker compose build web
docker compose build api
docker compose up -d --no-deps api web
docker compose ps
curl --fail --silent --show-error https://sheepgame.top/api/health
```

### 14.4 故障处理结束后恢复分支

```bash
git switch feature/gameplay-overhaul
git pull --ff-only origin feature/gameplay-overhaul
```

如果失败版本包含不兼容数据库变更，需要停止写入并从部署前备份恢复数据库。数据库恢复会覆盖数据，必须在确认备份、时间点和影响范围后单独执行，不能把它当作普通回滚步骤。

## 15. 常用运维命令

所有 Docker 命令都从项目目录执行：

```bash
cd /opt/wordward
```

查看状态：

```bash
docker compose ps
```

查看最近日志：

```bash
docker compose logs --tail=200 api web db
```

持续查看日志，按 `Ctrl+C` 退出：

```bash
docker compose logs -f api web db
```

重启所有应用服务：

```bash
docker compose restart
```

只重启 API：

```bash
docker compose restart api
```

检查磁盘：

```bash
df -h
docker system df
du -sh /srv/wordward-backups
```

查看 Caddy 状态和日志：

```bash
systemctl status caddy --no-pager
journalctl -u caddy --since='30 minutes ago' --no-pager
```

查看 Docker 服务：

```bash
systemctl status docker --no-pager
journalctl -u docker --since='30 minutes ago' --no-pager
```

## 16. 常见问题排查

### 16.1 `git pull` 提示 Permission denied

测试：

```bash
ssh -T git@github.com
```

检查：

```bash
ls -la /root/.ssh
sed -n '1,160p' /root/.ssh/config 2>/dev/null || true
ssh -vT git@github.com
```

确认 SSH 调试输出中使用了预期的密钥，并且 GitHub 返回 `successfully authenticated`。不要把私钥内容复制到日志或聊天中。

### 16.2 Docker 构建过程中服务器卡顿或 SSH 断开

检查内存和 Swap：

```bash
free -h
swapon --show
```

始终分开执行：

```bash
docker compose build web
docker compose build api
```

不要使用 `docker compose build` 同时构建全部服务。

### 16.3 API 容器反复重启

```bash
cd /opt/wordward
docker compose ps
docker compose logs --tail=200 api db
```

常见原因：

- `.env` 缺少变量。
- 数据库密码和 `DATABASE_URL` 中的密码不一致。
- 数据库未健康。
- Prisma migration 失败。

不要在生产数据库上运行 `prisma db push`。

### 16.4 Caddy 无法申请证书

```bash
journalctl -u caddy --since='30 minutes ago' --no-pager
dig +short A sheepgame.top
dig +short A www.sheepgame.top
ufw status
ss -lntp | grep -E ':(80|443)\s'
```

两个域名必须解析到当前服务器，80/443 必须能从公网访问，而且不能被其他程序占用。

如果服务器在中国大陆，域名通常还需要完成 ICP 备案，云厂商可能在未备案时阻断网站访问。证书申请成功不等于一定满足当地的公开服务合规要求。

### 16.5 网站能打开但账号登录异常

确认只能通过：

```text
https://sheepgame.top
```

访问。生产环境的刷新 Cookie 使用 Secure 属性，明文 HTTP 下不能正常工作。

检查健康状态和日志：

```bash
curl --fail https://sheepgame.top/api/health
cd /opt/wordward
docker compose logs --tail=200 api web
```

确认 `.env` 中的 `APP_ORIGIN` 是精确的 `https://sheepgame.top`，不能带路径、尾部斜杠或 `www`。

### 16.6 浏览器显示旧版本

先确认服务器提交：

```bash
cd /opt/wordward
git log -1 --oneline
docker compose images
```

确保重新执行过：

```bash
docker compose build web
docker compose up -d web
```

然后浏览器强制刷新。构建后的哈希资源会长期缓存，但新版 HTML 会引用新的资源文件名。

## 17. 禁止执行的危险命令

除非明确理解后果，否则不要执行：

```bash
docker compose down -v
docker system prune --volumes
docker volume rm wordward_wordward_db
git reset --hard
prisma db push
```

其中 `-v`、`--volumes` 和删除 `wordward_wordward_db` 会导致数据库数据丢失。生产服务器有未提交改动时，`git reset --hard` 会直接覆盖它们。

## 18. 已知安全边界

服务端会校验关卡进度、敌人数、用时、连续 Boss 证据和奖励幂等性，从而减少普通客户端篡改。它无法证明每一帧都由未修改的客户端真实运行；完全权威的反作弊需要服务端回放或服务端战斗模拟。

运维中应关注异常高频的战绩请求、认证失败和排行榜突增，不要接受客户端提交的累计功勋总数。
