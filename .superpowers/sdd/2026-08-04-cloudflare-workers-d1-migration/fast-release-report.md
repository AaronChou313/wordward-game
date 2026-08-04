# Fast release bundle report

Implemented Tasks 9–12 in the fast path.

- Client login/register now request a fresh browser Turnstile token when the public site key is configured, reset the widget after use, and preserve same-origin/offline/session behavior. Missing Turnstile, 429, and 503 states have user-facing messages; no-password-reset copy is shown.
- Added local Wrangler/D1 workflow (`worker:dev`, `worker:smoke`, migration setup), deterministic smoke checks, and explicit preview/production Worker bindings.
- Added `.assetsignore`, release checker, Cloudflare Workers Builds/D1/secrets/domain/rollback runbook, and a manual preview PBKDF2 benchmark gate. No benchmark endpoint was shipped.

Verification completed:

```text
npm test                         175 passed
npm run worker:test               42 passed
npm run d1:migrate:local          0001_initial.sql applied
npm run build                     passed
npm run worker:smoke              passed on local Wrangler
npm run verify:worker             passed
npx wrangler deploy --dry-run --env preview  passed
node --check scripts/*.mjs        passed
```

Release concerns: replace Wrangler D1/rate-limit placeholder IDs and set environment-specific secrets/site keys before deploy; run the documented preview PBKDF2 CPU gate before changing production iterations. The live-domain release checker was not run because deployment credentials/domain state are external.
