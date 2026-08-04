---
name: wordward-development
description: Use when modifying, testing, reviewing, deploying, or releasing the Wordward browser game, Cloudflare Worker API, D1 schema, authentication, cloud saves, merit, leaderboard, or preview/production environments.
---

# Wordward Development

Apply the repository rules in `AGENTS.md` plus the stricter workflow below.

## Before changing code

1. Read `AGENTS.md`, `package.json`, and the files nearest the change.
2. Read [references/architecture.md](references/architecture.md) for code ownership.
3. For deployment, D1, authentication, secrets, or release work, also read [references/release.md](references/release.md) and `docs/cloudflare-release.md`.
4. Keep the change focused. Do not edit generated `dist/` directly.
5. Use test-first development for behavior changes. Confirm each new test fails for the intended missing behavior before implementation.

## Implementation rules

- Use plain ES modules, two-space indentation, semicolons, and single-quoted strings.
- Keep scene lifecycle methods consistent: `enter`, `exit`, `update`, `render`, and pointer handlers.
- Put reusable rules in focused helpers and tunable gameplay values in `src/config/`.
- Preserve save compatibility. Treat local and D1 data changes as migration work.
- Keep access JWTs in memory and refresh tokens in HttpOnly cookies. Never weaken origin, Turnstile, rate-limit, password, or secret fail-closed behavior.
- Add tests beside modules as `*.test.js`. Prefer real behavior over implementation-detail mocks.

## Verification gate

Run targeted tests during development.

Before merging a feature into `preview`, run:

```bash
npm run verify:worker
git diff --check
```

After the preview deployment, run:

```bash
BASE_URL=https://preview.sheepgame.top WWW_URL=https://preview.sheepgame.top npm run release:check
```

Before merging `preview` into `main`, also run:

```bash
npx wrangler deploy --dry-run --env production
```

Manually exercise affected scene transitions, pointer interactions, battle behavior, audio, and persisted saves. For layout changes, verify text fits at the 750×1334 design size. If account/cloud features are touched, test registration, login, refresh, logout, profile, cloud save, merit, and leaderboard on preview.

## Branch and release flow

Use:

```text
feature branch -> preview -> Preview Worker/D1 -> main -> Production Worker/D1
```

- Start feature branches from current `preview`.
- Merge features into `preview`; Cloudflare deploys `wordward-game-preview` using `wordward-preview`.
- Run the preview release check and manual checks. Approval means the user accepts the preview evidence or explicitly asks the agent to promote it.
- Do not merge or deploy production without explicit user authorization. After authorization, merge `preview` into `main`; Cloudflare deploys `wordward-game` using `wordward-production`.
- Run `BASE_URL=https://sheepgame.top npm run release:check` after production deployment.
- Never deploy preview code with production bindings or production code with preview bindings.

## Data and secrets

If no D1 schema changes exist, do not run migrations.

For schema changes:

```bash
npm run d1:migrate:local
npm run d1:test
npm run d1:migrate:preview
# query the preview schema and exercise affected API behavior
# after preview approval, create a production D1 Time Travel bookmark
npm run d1:migrate:production
```

Never edit an already-applied migration. Add a new forward migration. Keep the migration compatible with the currently deployed Worker and the incoming Worker so either code version can run during deployment. If preview migration fails, stop promotion and fix with a new migration. If production migration succeeds but deployment fails, keep the compatible schema, roll back Worker code if needed, and diagnose before any destructive database restore.

For local save-data changes, increment `DEFAULT_SAVE.version`, migrate in `migrateSave`, preserve unknown/current progress, keep migration idempotent, and add tests covering the oldest supported save plus a second migration pass.

Public values belong in `wrangler.jsonc`. Keep `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `CURSOR_SIGNING_SECRET`, and `TURNSTILE_SECRET_KEY` only in environment-specific Cloudflare Worker Secrets. Never expose them in Git, build logs, `dist/`, documentation examples, or client variables.

## Handoff

Report changed behavior, files, test evidence, branch, and whether preview or production deployment remains. Explicitly call out save-data, balance, D1, authentication, or visual changes.
