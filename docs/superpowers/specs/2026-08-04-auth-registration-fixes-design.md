# 注册流程修复设计

## 目标

修复登录与注册模式切换后隐藏密码仍被保留的问题，并修复 Cloudflare 部署中浏览器无法取得 Turnstile Site Key 的问题。对于浏览器未发送 `Origin` 或 `Referer` 的情况，仅在请求明确为同站请求时兼容，继续拒绝跨站或来源不明的写请求。

## 设计

- `canvasTextInput` 提供清空并失焦隐藏输入框的操作。登录/注册模式切换、账号场景退出以及成功提交时调用该操作，画布状态和原生输入状态保持一致。
- Worker 提供 `GET /api/config`，只返回可公开的 `turnstileSiteKey`。前端在认证提交前读取并缓存该配置，不再假设 Worker 变量会自动注入静态 `index.html`。
- `requireSameOrigin` 优先验证 `Origin`，其次验证 `Referer`。两者都缺失时，只有请求 URL 的 origin 等于 `APP_ORIGIN`，并且 `Sec-Fetch-Site` 为 `same-origin` 时才允许；其他情况继续返回 403。
- 来源拒绝响应增加 `ORIGIN_MISMATCH`，账号页将其显示为中文操作提示。Turnstile 失败继续使用独立的 `TURNSTILE_FAILED`。

## 测试

- 切换模式后隐藏密码输入框失焦、内容清空，再次输入不会追加旧密码。
- `GET /api/config` 只公开 Site Key；前端能够读取并使用它。
- 正确 Origin、正确 Referer、同 origin URL 加 `Sec-Fetch-Site: same-origin` 被允许；跨站、缺少可信请求元数据及目标域名不一致被拒绝。
- 账号页为 `ORIGIN_MISMATCH` 和 `TURNSTILE_FAILED` 显示明确中文提示。

## 发布边界

不修改 D1 schema，不运行 migration，不放宽到 `workers.dev` 或任意来源。本次只提交并推送当前功能分支，由用户决定何时合并到 `preview`。
