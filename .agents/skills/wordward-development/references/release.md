# Release reference

| Branch | Worker | D1 | Domain |
| --- | --- | --- | --- |
| `preview` | `wordward-game-preview` | `wordward-preview` | `preview.sheepgame.top` |
| `main` | `wordward-game` | `wordward-production` | `sheepgame.top` |

Required checks before preview merge:

```bash
npm run verify:worker
git diff --check
```

After preview deployment:

```bash
BASE_URL=https://preview.sheepgame.top WWW_URL=https://preview.sheepgame.top npm run release:check
```

Before production merge, additionally run:

```bash
npx wrangler deploy --dry-run --env production
```

After production deployment:

```bash
BASE_URL=https://sheepgame.top npm run release:check
```

Preview and production have distinct D1 databases, Turnstile keys, and Worker secrets. Rate-limit namespaces are account-unique positive integer identifiers: preview uses `2001`–`2004`, production uses `3001`–`3004`.

Cloudflare Git builds track long-lived branches: `preview` automatically deploys the preview Worker and `main` automatically deploys production. Manual `npm run deploy:*` is for recovery or an explicitly requested manual release. Merging or deploying production requires explicit user authorization.
