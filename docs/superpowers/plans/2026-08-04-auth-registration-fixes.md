# 注册流程修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复模式切换后的密码残留、Cloudflare Turnstile 公共配置缺失和部分同站浏览器请求被来源校验拒绝的问题。

**Architecture:** 隐藏输入框由 UI 模块负责彻底清理；Worker 通过只读配置端点公开 Site Key；来源校验仅为具备可信 `Sec-Fetch-Site: same-origin` 证据且目标 origin 正确的无 Origin 请求提供兼容路径。前端按稳定错误码提供中文提示。

**Tech Stack:** Vite、原生 ES modules、Vitest、Hono、Cloudflare Workers、Turnstile。

## Global Constraints

- 保持认证和来源校验 fail-closed，不允许任意来源或 `workers.dev`。
- 不修改 D1 schema，不执行 migration。
- 所有行为改动先写失败测试并观察预期失败。

---

### Task 1: 清理隐藏密码输入状态

**Files:**
- Modify: `src/ui/canvasTextInput.js`
- Modify: `src/ui/canvasTextInput.test.js`
- Modify: `src/meta/accountScene.js`
- Modify: `src/meta/accountScene.test.js`

**Interfaces:**
- Produces: `resetCanvasTextInput(): void`，清空、移除事件处理器、失焦并发布 inactive 状态。

- [ ] 写测试，模拟隐藏密码输入为旧值，执行重置后断言内容为空且失焦。
- [ ] 运行针对性测试，确认测试因缺少重置行为失败。
- [ ] 实现 `resetCanvasTextInput`，并在账号模式切换、场景退出和成功提交时使用。
- [ ] 运行 UI 和账号场景测试，确认通过。

### Task 2: 公开并读取 Turnstile Site Key

**Files:**
- Modify: `worker/app.js`
- Modify: `worker/app.test.js`
- Modify: `src/net/turnstile.js`
- Modify: `src/net/turnstile.test.js`

**Interfaces:**
- Produces: `GET /api/config -> { turnstileSiteKey: string }`。
- Produces: `getTurnstileToken(action)` 在首次调用时读取并缓存 `/api/config`。

- [ ] 写 Worker 配置端点和前端配置加载的失败测试。
- [ ] 运行针对性测试，确认端点 404 且前端未读取配置。
- [ ] 实现只读配置端点与前端缓存加载。
- [ ] 运行配置和 Turnstile 测试，确认通过。

### Task 3: 安全兼容无 Origin 的同站请求

**Files:**
- Modify: `worker/middleware/origin.js`
- Modify: `worker/security/security.test.js`
- Modify: `src/meta/accountScene.js`
- Modify: `src/meta/accountScene.test.js`

**Interfaces:**
- Produces: 来源校验失败响应 `{ error: 'Forbidden', code: 'ORIGIN_MISMATCH' }`。

- [ ] 写同站 Sec-Fetch 允许、跨站/无证据拒绝及中文错误映射的失败测试。
- [ ] 运行针对性测试，确认缺少新分支和错误映射而失败。
- [ ] 实现最小来源判定和稳定错误码，不改变已有 Origin/Referer 优先级。
- [ ] 实现账号场景中文提示并运行针对性测试。

### Task 4: 完整验证与交付

**Files:**
- Verify: all changed files

- [ ] 运行 `npm run verify:worker`。
- [ ] 运行 `npx wrangler deploy --dry-run --env production`。
- [ ] 运行 `git diff --check`。
- [ ] 在浏览器验证模式切换不保留密码，并检查 Preview 发布前仍需合并部署。
- [ ] 提交并推送 `codex/login-inventory-merge-ui`，不合并 preview/main。
