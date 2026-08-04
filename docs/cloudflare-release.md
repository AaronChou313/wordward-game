# Cloudflare Workers release runbook

The production Worker is `wordward-game` on the `main` branch. Preview deployments use `wordward-game-preview` and the separate `wordward-preview` D1 database. Never point a preview environment at production D1 or production Turnstile secrets.

## Build and deploy

```sh
npm ci
npm run verify:worker
npm run d1:migrate:local
npm run d1:migrate:preview
npx wrangler deploy --env preview
BASE_URL=https://preview.sheepgame.top npm run release:check
```

In Workers Builds, connect `git@github.com:AaronChou313/wordward-game.git`, set the production branch to `main`, root directory to the repository root, build command to `npm run verify:worker`, deploy command to `npx wrangler deploy`, and preview deploy command to `npx wrangler versions upload --env preview`. Keep the Wrangler version pinned by `package-lock.json` and do not enable cache until an uncached build passes.

Set only public values in Wrangler (`APP_ORIGIN`, `PASSWORD_KDF_VERSION`, `PASSWORD_KDF_ITERATIONS`, and the Turnstile site key). Set these as Cloudflare secrets, never GitHub variables or Vite variables: `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `CURSOR_SIGNING_SECRET`, `TURNSTILE_SECRET_KEY`, and the optional smoke-test secret. Verify logs and `dist/` contain none of them.

Before production migration, record a D1 Time Travel bookmark, run `npm run d1:migrate:production`, deploy the Worker, and run `BASE_URL=https://sheepgame.top npm run release:check`. Inspect CPU, Error 1102/1027, D1 errors, and secret-leak alerts before announcing the release.

## Domain cutover and rollback

Use Cloudflare nameservers for `sheepgame.top`, attach the apex as the Worker Custom Domain, and add a proxied `www` record. A Single Redirect Rule should return `301` to `https://sheepgame.top${uri}` while preserving the query string. Verify certificate issuance and both hosts before removing old records.

Rollback code with `npx wrangler rollback --env production <version-id>` only when the version is schema-compatible. Do not roll back code across a migration that removed columns. Restore D1 from the recorded Time Travel bookmark only for confirmed data corruption, then rotate affected secrets and rerun the release checks. Password KDF iterations remain configurable; run the manual preview benchmark gate and choose the highest candidate whose p95 Worker CPU is <= 8 ms before changing production.
