# Cloudflare Workers D1 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fastify/PostgreSQL production API with a single Hono Cloudflare Worker backed by D1 while preserving accounts, profiles, cloud saves, merit claims, leaderboard behavior, and offline client flows.

**Architecture:** Vite builds the existing canvas game into `dist/`; Workers Static Assets serves it while Hono handles `/api/*` in the same Worker. The API uses D1 prepared SQL and atomic `batch()` calls, Web Crypto PBKDF2 for low-cost password hashing, signed HMAC JWT/cursors, HttpOnly refresh cookies, Turnstile, and Cloudflare Rate Limiting bindings. The existing `server/` remains as a reference until the Worker passes parity and concurrency tests.

**Tech Stack:** Cloudflare Workers, Hono, D1/SQLite, Wrangler, Web Crypto, Cloudflare Turnstile, Workers Static Assets, Vite, Vitest, GitHub Workers Builds.

## Global Constraints

- Production hostname is `https://sheepgame.top`; `www.sheepgame.top` uses a Cloudflare Single Redirect Rule to preserve path/query and return `301` before Worker execution.
- Production branch is `main`; preview branches use a separate Worker/D1/Turnstile environment and never write production D1.
- Workers Free limits are treated as hard requirements: 10ms CPU per HTTP request and 100,000 Worker requests per day.
- Passwords use Web Crypto PBKDF2-SHA-256 with a per-user random salt; benchmark candidates in a real preview Worker and choose the highest iteration count with p95 login CPU <= 8ms.
- No password reset, email, phone, third-party hosted authentication, Workers Paid, Durable Objects, or D1 read replicas in this migration.
- Never store plaintext passwords, access tokens, refresh tokens, Turnstile secrets, JWT secrets, complete save payloads, or battle summaries in logs.
- Existing API paths and response shapes remain compatible except registration/login accept an additional `turnstileToken` field.
- Dates in D1 are Unix-millisecond integers; JSON fields are JSON text; IDs use `crypto.randomUUID()`; SQL is parameterized with D1 prepared statements.
- Every task ends with a focused test command and an imperative commit.

---

## Task 1: Worker package and Wrangler environments

**Files:**
- Create: `worker/index.js`
- Create: `worker/app.js`
- Create: `worker/types.js` (JSDoc environment/binding contracts)
- Create: `wrangler.jsonc`
- Create: `.dev.vars.example`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `worker/app.test.js`

**Interfaces:**
- `worker/index.js` exports the default module with `fetch(request, env, ctx)`.
- `worker/app.js` exports `createApp({ env, ctx })` and a Hono app with `/api/health`.
- Bindings are `env.DB`, `env.ASSETS`, `env.REGISTER_LIMIT`, `env.LOGIN_IP_LIMIT`, `env.LOGIN_USER_LIMIT`, and `env.MERIT_LIMIT`.
- Vars are `APP_ORIGIN`, `PASSWORD_KDF_VERSION`, `PASSWORD_KDF_ITERATIONS`, and `TURNSTILE_SITE_KEY`; secrets are read from the same env object.

- [ ] **Step 1: Write the failing Worker smoke test**

Create `worker/app.test.js` with a minimal fake env and assert that `GET /api/health` returns `200` and `{ status: 'ok' }`, while an unknown `/api/path` returns JSON `404` rather than HTML.

```js
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('worker shell', () => {
  it('serves health and JSON API 404s', async () => {
    const app = createApp({ env: { APP_ORIGIN: 'http://localhost:8787' }, ctx: {} });
    const health = await app.request('http://localhost:8787/api/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const missing = await app.request('http://localhost:8787/api/missing');
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe('API route not found');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run `npx vitest run worker/app.test.js`. Expected: FAIL because `worker/app.js` and the Worker routing shell do not exist.

- [ ] **Step 3: Add Wrangler configuration and the minimal Hono shell**

Add `hono` and `wrangler` dependencies to the root package. Configure `wrangler.jsonc` with `main: "worker/index.js"`, `compatibility_date` at or after `2024-09-23`, no Node compatibility flag (the initial Worker uses Web Crypto and Web APIs only), `assets.directory: "./dist"`, `assets.binding: "ASSETS"`, `assets.run_worker_first: ["/api/*"]`, and preview/production D1 bindings. Implement `createApp`, the default fetch export, API 404 middleware, and static asset fallback through `env.ASSETS.fetch(request)`.

- [ ] **Step 4: Run the focused test and build**

Run `npx vitest run worker/app.test.js` and `npm run build`. Expected: the shell test and Vite build pass; the Worker bundle is not yet feature-complete.

- [ ] **Step 5: Commit the shell**

```bash
git add worker wrangler.jsonc .dev.vars.example package.json .gitignore worker/app.test.js
git commit -m "feat: add Cloudflare Worker shell"
```

## Task 2: D1 schema, migration commands, and database helpers

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `worker/db/queries.js`
- Create: `worker/db/rows.js`
- Create: `worker/db/errors.js`
- Create: `worker/db/d1.test.js`
- Modify: `package.json`
- Modify: `wrangler.jsonc`

**Interfaces:**
- `run(db, sql, ...params)` returns one D1 result from a prepared statement.
- `first(db, sql, ...params)` returns one row or `null`.
- `all(db, sql, ...params)` returns an array of rows.
- `batch(db, statements)` executes prepared statements atomically.
- `toUser(row)`, `toProfile(row)`, `toSave(row)`, `toClaim(row)`, and `toCheckpoint(row)` convert SQLite rows to API/domain objects.
- `D1ConflictError` and `D1UnavailableError` provide stable classification for route error handling.

- [ ] **Step 1: Write schema and query helper tests first**

Use a local D1 binding from Wrangler/miniflare in `worker/db/d1.test.js`. Test that migrations create all six tables, unique username/claim/run/token constraints reject duplicates, foreign keys cascade user deletion, JSON text round-trips, and helper methods bind values without string interpolation.

- [ ] **Step 2: Run the D1 test to verify the schema is absent**

Run `npm run d1:test -- worker/db/d1.test.js`. Expected: FAIL because no migration or D1 helpers exist.

- [ ] **Step 3: Implement `0001_initial.sql`**

Create `users`, `profiles`, `game_saves`, `merit_claims`, `merit_run_checkpoints`, and `refresh_tokens` with Unix-millisecond integer timestamps, JSON text columns, `CHECK` constraints for `ACTIVE`/`DISABLED` and difficulty, foreign keys with `ON DELETE CASCADE`, indexes for leaderboard/claims/checkpoints/tokens, `game_saves` primary key on `user_id`, claim uniqueness on `(user_id, difficulty, endless_floor, boss_wave)`, checkpoint uniqueness on `(user_id, run_id)`, token uniqueness on `token_hash`, `refresh_tokens.rotated_to_id`, and `merit_claims.awarded_at`.

- [ ] **Step 4: Implement prepared-statement helpers and row conversion**

Implement only `prepare(sql).bind(...params).run()/first()/all()` wrappers. Convert `data_json` and summary JSON with guarded parsing; convert integer timestamps to `Date` only at the route/domain boundary. Map D1 constraint errors to a stable `constraint` property without exposing SQL text.

- [ ] **Step 5: Add migration scripts and run the test**

Add scripts `d1:migrate:local`, `d1:migrate:preview`, and `d1:migrate:production` using `wrangler d1 migrations apply` with explicit environment flags, plus `d1:test` as `vitest run worker/db`. Run `npm run d1:test`; expected: PASS.

- [ ] **Step 6: Commit the D1 foundation**

```bash
git add migrations worker/db package.json wrangler.jsonc worker/db/d1.test.js
git commit -m "feat: add D1 schema and query helpers"
```

## Task 3: Crypto primitives, JWT, cookies, Turnstile, and request guards

**Files:**
- Create: `worker/security/encoding.js`
- Create: `worker/security/hmac.js`
- Create: `worker/security/password.js`
- Create: `worker/security/jwt.js`
- Create: `worker/security/cookies.js`
- Create: `worker/security/turnstile.js`
- Create: `worker/middleware/origin.js`
- Create: `worker/middleware/limits.js`
- Create: `worker/security/security.test.js`

**Interfaces:**
- `normalizeUsername(value)`, `validateCredentials(username, password)` match current validation.
- `hashPassword(password, { iterations, version })` returns `{ hash, salt, iterations, version }`.
- `verifyPassword(password, record)` returns a boolean using constant-time comparison.
- `signAccessToken({ id, username }, secret, now, ttlSeconds)` and `verifyAccessToken(token, secret, now)` implement HS256 JWT.
- `hashRefreshToken(token, pepper)` and `hashCursor(payload, secret)` return base64url/hex-safe HMAC strings.
- `setRefreshCookie(headers, token)` and `clearRefreshCookie(headers)` produce the exact HttpOnly/Secure/SameSite/Path attributes.
- `verifyTurnstile(token, request, secret, fetchImpl = fetch)` returns `{ ok, reason }` and maps upstream failures to unavailable.
- `requireSameOrigin(request, env)` rejects unsafe non-API origins with `403`.
- `consumeLimit(binding, key)` returns `{ allowed: boolean }` and safely handles an absent binding in local tests.

- [ ] **Step 1: Write crypto and middleware tests**

Cover username normalization, password length limits, salt uniqueness, correct/incorrect password, malformed JWT, expired JWT, tampered JWT, constant-time unequal lengths, cookie attributes, same-origin acceptance/rejection, Turnstile success/failure/upstream failure, and rate-limit allowed/denied behavior.

- [ ] **Step 2: Run tests to verify failure**

Run `npm run worker:test -- worker/security/security.test.js`. Expected: FAIL because the security modules do not exist.

- [ ] **Step 3: Implement Web Crypto primitives**

Use `crypto.subtle.importKey('raw', ...)` and `deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)`; generate 16-byte salts with `crypto.getRandomValues`; compare hashes in a loop without early return. Use base64url helpers that work in Workers without Node `Buffer`.

- [ ] **Step 4: Implement JWT and signed cursors**

Create compact HS256 JWTs with `iat`, `exp`, `id`, and `username`; reject wrong algorithm, missing claims, expired tokens, and malformed base64. Use a separate cursor secret even though both are HMAC-SHA-256.

- [ ] **Step 5: Implement cookies, Turnstile, Origin, and limits**

Build `Set-Cookie` values without third-party cookie libraries. Send Turnstile verification to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with secret, response token, and remote IP. Treat only a successful `{ success: true }` response as allowed. Apply limits before password derivation.

- [ ] **Step 6: Run tests and commit**

Run `npm run worker:test -- worker/security/security.test.js`. Expected: PASS.

```bash
git add worker/security worker/middleware
git commit -m "feat: add Worker security primitives"
```

## Task 4: Authentication and session routes

**Files:**
- Create: `worker/modules/auth/service.js`
- Create: `worker/modules/auth/routes.js`
- Create: `worker/modules/auth/schemas.js`
- Create: `worker/modules/auth/auth.test.js`
- Modify: `worker/app.js`
- Modify: `worker/db/rows.js`

**Interfaces:**
- `registerUser(env, input, request)` returns `{ user, refreshToken }` or a typed auth error.
- `authenticateUser(env, input, request)` returns a public user or a generic invalid-credentials error.
- `createRefreshToken(db, userId, pepper, now)` returns `{ token, id }`.
- `rotateRefreshToken(db, token, pepper, now)` performs the two-statement `rotated_to_id` conditional rotation and returns `{ user, token }`.
- `revokeRefreshToken(db, token, pepper, now)` returns a boolean.
- Routes implement `POST /api/auth/register`, `/login`, `/refresh`, and `/logout` with current response shapes.

- [ ] **Step 1: Write auth route tests**

Test successful registration creates user/profile/refresh token atomically; duplicate usernames return `409`; Turnstile failure returns `403`; invalid login is generic and invokes the dummy KDF; disabled accounts cannot log in or refresh; refresh rotation accepts one concurrent request and rejects the replay; logout revokes and clears cookie; JWT access token contains the expected public user.

- [ ] **Step 2: Run auth tests to verify failure**

Run `npm run worker:test -- worker/modules/auth/auth.test.js`. Expected: FAIL because auth service/routes do not exist.

- [ ] **Step 3: Implement registration and login**

Validate Turnstile and limits before KDF. Insert `users` and `profiles` plus a refresh token in one D1 batch. On duplicate username return `409` without exposing SQL. Use the configured PBKDF2 version/iterations and store them per row. For unknown users run a fixed dummy record with the same KDF parameters.

- [ ] **Step 4: Implement refresh rotation and logout**

Hash the cookie token with `REFRESH_TOKEN_PEPPER`. Generate a new token ID/value before the conditional update. Update old row only when not revoked, unexpired, active, and `rotated_to_id IS NULL`; insert the new row only when `rotated_to_id` equals the candidate ID. Return `401` and clear the cookie for any failure.

- [ ] **Step 5: Add authentication middleware**

Parse `Authorization: Bearer`, verify JWT, query account status when needed, and attach `user` to Hono context. Ensure disabled users cannot call protected routes with an otherwise-valid access token.

- [ ] **Step 6: Run auth tests and commit**

Run `npm run worker:test -- worker/modules/auth/auth.test.js`. Expected: PASS.

```bash
git add worker/modules/auth worker/app.js worker/db/rows.js
git commit -m "feat: migrate authentication to D1"
```

## Task 5: Profile and cloud-save routes

**Files:**
- Create: `worker/modules/profile/routes.js`
- Create: `worker/modules/save/routes.js`
- Create: `worker/modules/profile/profile.test.js`
- Create: `worker/modules/save/save.test.js`
- Modify: `worker/app.js`

**Interfaces:**
- `GET/PUT /api/profile` preserves `{ nickname, avatarUrl, bio }`.
- `GET /api/save` returns `{ version, data }` or `404`.
- `PUT /api/save` accepts `{ version, data }` and returns the updated public save or `409 { error, current }`.
- `normalizeProfile(body)` and `validateSave(body)` are pure functions covered by unit tests.

- [ ] **Step 1: Write profile and save tests**

Cover protected-route authentication, profile trimming and HTTPS avatar validation, profile length limits, missing profiles, first save with version 0, version increments, stale-version `409`, concurrent first save, protected `merit` rejection, schema version validation, and 256KiB UTF-8 size limit.

- [ ] **Step 2: Run focused tests to verify failure**

Run `npx vitest run worker/modules/profile/profile.test.js worker/modules/save/save.test.js`. Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement profile route**

Use prepared `SELECT` and `UPDATE`; normalize nickname/bio with trim and Unicode length checks; accept only `https:` avatar URLs with a hostname; return public fields only.

- [ ] **Step 4: Implement atomic cloud-save upsert**

For version 0, use `INSERT ... ON CONFLICT DO NOTHING`, then read current on conflict. For later writes, use a conditional `UPDATE ... SET version = version + 1 ... WHERE user_id = ? AND version = ?`; inspect `meta.changes` and read current on zero changes. Store JSON via `JSON.stringify` after deleting protected fields and checking UTF-8 bytes.

- [ ] **Step 5: Run tests and commit**

Run `npx vitest run worker/modules/profile/profile.test.js worker/modules/save/save.test.js`. Expected: PASS.

```bash
git add worker/modules/profile worker/modules/save worker/app.js
git commit -m "feat: migrate profiles and cloud saves to D1"
```

## Task 6: Merit claim service and route

**Files:**
- Create: `worker/modules/merit/service.js`
- Create: `worker/modules/merit/routes.js`
- Create: `worker/modules/merit/validation.js`
- Create: `worker/modules/merit/merit.test.js`
- Modify: `worker/app.js`
- Modify: `worker/db/queries.js`

**Interfaces:**
- `meritForClaim(difficulty, bossWave)` preserves existing multipliers and wave rules.
- `normalizeClaim(input, now)` returns normalized integer timestamps and validated JSON summary or a typed `MeritClaimError`.
- `recordMeritClaim(env, userId, input, now)` returns `{ awarded, merit, meritTotal }`.
- `MeritClaimError` carries stable `code` and HTTP status.
- `POST /api/merit/claims` returns `201` for newly awarded claims and `200` for duplicate claims.

- [ ] **Step 1: Port pure merit validation tests**

Copy the existing service test cases for multipliers, minimum wave, plausible kills, time bounds, progression unlocks, endless floors, run mismatch, and malformed summaries into `worker/modules/merit/merit.test.js`; add tests for duplicate/concurrent claims and total consistency.

- [ ] **Step 2: Run merit tests to verify failure**

Run `npx vitest run worker/modules/merit/merit.test.js`. Expected: FAIL because the Worker merit service does not exist.

- [ ] **Step 3: Implement pure validation and progression queries**

Keep battle rules independent of Hono. Use integer timestamps and parse summary JSON only after schema checks. Query prerequisite claim and checkpoint state with prepared statements; never trust client `meritTotal`.

- [ ] **Step 4: Implement atomic D1 claim batch**

Use `INSERT OR IGNORE` on the business unique key, checkpoint statements conditioned on the claim row, an `UPDATE users ... WHERE EXISTS (SELECT 1 FROM merit_claims ... awarded_at IS NULL)` that increments exactly once, and an `UPDATE merit_claims SET awarded_at = ? WHERE ... awarded_at IS NULL`. Return the pre-read existing claim as `awarded: false` when no new business row was inserted. Ensure the batch rollback leaves no partial checkpoint or total update.

- [ ] **Step 5: Add bounded cleanup and retry behavior**

Delete at most a fixed number of expired unrelated checkpoints per claim request, and retry only known transient D1/constraint races with a maximum of three attempts. Do not retry malformed claims or progression locks.

- [ ] **Step 6: Run concurrency tests and commit**

Run `npx vitest run worker/modules/merit/merit.test.js`. Expected: PASS, including two simultaneous submissions resulting in one award and one duplicate response.

```bash
git add worker/modules/merit worker/app.js worker/db/queries.js
git commit -m "feat: migrate merit claims to atomic D1 writes"
```

## Task 7: Leaderboard and signed keyset pagination

**Files:**
- Create: `worker/modules/leaderboard/routes.js`
- Create: `worker/modules/leaderboard/cursor.js`
- Create: `worker/modules/leaderboard/leaderboard.test.js`
- Modify: `worker/app.js`

**Interfaces:**
- `encodeCursor(cursor, secret)` and `decodeCursor(value, secret)` use signed JSON containing `meritTotal`, `meritReachedAt`, `id`, and `rank`.
- `GET /api/leaderboard?limit=&cursor=` returns `{ rows, nextCursor }`.
- `GET /api/leaderboard/me` returns the current public rank row or rank `null`.

- [ ] **Step 1: Write ordering and cursor tests**

Test merit descending, reached-time ascending, ID ascending tie breaking; disabled/zero-merit filtering; first page, next page, invalid signature, malformed cursor, limit bounds; and personal rank against the same ordering.

- [ ] **Step 2: Run tests to verify failure**

Run `npx vitest run worker/modules/leaderboard/leaderboard.test.js`. Expected: FAIL because the Worker leaderboard modules do not exist.

- [ ] **Step 3: Implement signed cursor helpers**

Use the shared HMAC helper and constant-time comparison. Reject extra segments, invalid dates, non-positive rank/merit, invalid IDs, and cursors larger than 512 characters.

- [ ] **Step 4: Implement keyset SQL**

Query only `ACTIVE` users with `merit_total > 0`, order by the three sort columns, fetch `limit + 1`, compute the base rank from the cursor, and join profiles without exposing password fields. Compute `/me` rank with a count of strictly-ahead rows using the same comparator.

- [ ] **Step 5: Run tests and commit**

Run `npx vitest run worker/modules/leaderboard/leaderboard.test.js`. Expected: PASS.

```bash
git add worker/modules/leaderboard worker/app.js
git commit -m "feat: migrate leaderboard to D1 keyset queries"
```

## Task 8: API composition, error handling, and static routing

**Files:**
- Create: `worker/middleware/errors.js`
- Create: `worker/middleware/authenticate.js`
- Create: `worker/app.integration.test.js`
- Modify: `worker/app.js`
- Modify: `worker/index.js`

**Interfaces:**
- `errorHandler(error, c)` maps typed errors to stable JSON `{ error, code }` and hides internals.
- `authenticate(c, next)` attaches `user` to Hono context.
- `createApp({ env, ctx })` registers all route groups and middleware in a fixed order.

- [ ] **Step 1: Write end-to-end API composition tests**

Use a fake D1 implementation or local D1 to run register → login → profile → save → merit → leaderboard → refresh → logout. Assert `/api/*` unknown routes are JSON, non-API asset requests call `ASSETS.fetch`, payload errors never include SQL/stack traces, and unsafe origins are rejected.

- [ ] **Step 2: Run integration tests to verify missing composition**

Run `npx vitest run worker/app.integration.test.js`. Expected: FAIL until all route groups and middleware are registered.

- [ ] **Step 3: Implement middleware order**

Register request ID/logging, body-size guard, same-origin guard for state-changing methods, API route groups, auth middleware only on protected handlers, centralized error handler, JSON API 404, and static asset fallback. Never log request bodies, cookies, authorization headers, Turnstile tokens, save data, or merit summaries.

- [ ] **Step 4: Run all Worker tests**

Run `npx vitest run worker`. Expected: PASS for shell, security, D1, auth, profile, save, merit, leaderboard, and composition suites.

- [ ] **Step 5: Commit API composition**

```bash
git add worker
git commit -m "feat: compose Worker API and error handling"
```

## Task 9: Client Turnstile and error-state compatibility

**Files:**
- Create: `src/net/turnstile.js`
- Modify: `src/net/apiClient.js`
- Modify: `src/meta/accountScene.js`
- Modify: `src/net/apiClient.test.js`
- Modify: `index.html`
- Modify: `src/main.js` (only if Turnstile lifecycle needs app bootstrap)

**Interfaces:**
- `getTurnstileToken(action)` resolves a short-lived token or throws a user-facing unavailable error.
- `register` and `login` include `turnstileToken` in their request body and never silently retry.
- Existing `ApiError`, refresh flow, offline save queue, merit queue, and same-origin API paths remain compatible.

- [ ] **Step 1: Write client tests**

Mock the Turnstile global and assert register/login attach a token, missing widget/token produces a clear error, `429`/`503` preserve retryable state, and access-token refresh behavior is unchanged.

- [ ] **Step 2: Run client tests to verify failure**

Run `npm test -- src/net/apiClient.test.js`. Expected: FAIL because Turnstile integration does not exist.

- [ ] **Step 3: Add Turnstile script/widget lifecycle**

Load the public site key only, render an invisible or managed widget in the account scene, request a fresh token for each register/login submit, reset after use, and show the no-password-reset warning. Do not put the secret key in Vite variables or the bundle.

- [ ] **Step 4: Preserve existing session and offline semantics**

Keep credentials mode, access token in memory, refresh deduplication, save conflict handling, merit queue retries, and generic API errors. Add explicit copy for Turnstile unavailable, rate limited, and temporary service unavailable states.

- [ ] **Step 5: Run client tests and build**

Run `npm test` and `npm run build`. Expected: all existing client tests plus Turnstile tests pass and Vite emits `dist/`.

- [ ] **Step 6: Commit client integration**

```bash
git add src index.html
git commit -m "feat: add Turnstile to account flows"
```

## Task 10: Local Wrangler workflow and D1 integration gate

**Files:**
- Create: `worker/test/local-d1.setup.js`
- Create: `scripts/worker-smoke.mjs`
- Modify: `package.json`
- Modify: `docs/deployment.md`
- Modify: `wrangler.jsonc`

**Interfaces:**
- `npm run d1:migrate:local` creates/applies local migrations.
- `npm run worker:dev` runs Vite build plus `wrangler dev` with local D1.
- `npm run worker:test` runs Worker tests against local D1.
- `scripts/worker-smoke.mjs` accepts `BASE_URL` and a test secret, checks health/static/API 404 and never prints credentials.

- [ ] **Step 1: Write the local workflow smoke test**

Make the smoke script fail when `/api/health` is not JSON `200`, `/api/missing` is not JSON `404`, the root does not return the Vite shell, or a protected endpoint incorrectly returns `200` without a token.

- [ ] **Step 2: Run the script before configuration**

Run `BASE_URL=http://127.0.0.1:8787 node scripts/worker-smoke.mjs`. Expected: FAIL if Wrangler is not running or configuration is incomplete.

- [ ] **Step 3: Add package scripts and local D1 setup**

Use explicit commands for local migrations, Worker tests, Vite build, and `wrangler dev`. Keep local D1 state under Wrangler’s ignored `.wrangler/` directory. Add a documented `cp .dev.vars.example .dev.vars` step with fake local secrets.

- [ ] **Step 4: Run the local workflow**

Run `npm run d1:migrate:local`, `npm run worker:test`, `npm run build`, then start `npm run worker:dev` and execute the smoke script. Expected: all tests pass and static/API routing works at localhost.

- [ ] **Step 5: Commit local workflow**

```bash
git add scripts worker/test package.json wrangler.jsonc docs/deployment.md
git commit -m "chore: add local Worker and D1 workflow"
```

## Task 11: PBKDF2 preview benchmark and Cloudflare limits gate

**Files:**
- Create: `worker/bench/password-worker.js`
- Create: `worker/bench/password-benchmark.mjs`
- Create: `docs/superpowers/benchmarks/2026-08-04-pbkdf2-workers-free.md`
- Modify: `wrangler.jsonc`
- Modify: `.dev.vars.example`

**Interfaces:**
- The benchmark endpoint is preview-only, protected by a secret, and returns only aggregate CPU/timing data.
- `password-benchmark.mjs` tests a fixed list of iteration candidates and writes the chosen value and date to the benchmark document.

- [ ] **Step 1: Add benchmark tests**

Assert the benchmark route is unavailable in production, rejects missing secret, does not return hashes/salts/passwords, and reports p50/p95 duration/CPU aggregates only.

- [ ] **Step 2: Implement preview-only benchmark**

Run PBKDF2 candidates such as 1,000, 2,000, 4,000, 8,000, and 12,000 only after validating a preview secret. Measure multiple warm requests and discard the first cold request. Use Worker invocation CPU metrics rather than browser wall time for the decision.

- [ ] **Step 3: Deploy preview and choose parameters**

Deploy only to preview D1/Worker, run the benchmark, select the highest candidate with p95 CPU <= 8ms and no sustained Error 1102, then set production `PASSWORD_KDF_ITERATIONS` through Worker vars. If no candidate meets the gate, stop and report that Free cannot safely host password login without changing the approved design.

- [ ] **Step 4: Record evidence and commit**

Record date, Wrangler version, compatibility date, candidate values, p50/p95 CPU, request count, and selected value without any secret or user data. Run benchmark tests and commit:

```bash
git add worker/bench docs/superpowers/benchmarks wrangler.jsonc .dev.vars.example
git commit -m "chore: benchmark Worker password hashing"
```

## Task 12: GitHub Workers Builds, secrets, D1 migration release, and domain cutover

**Files:**
- Create: `.assetsignore`
- Create: `docs/cloudflare-release.md`
- Create: `scripts/release-check.mjs`
- Modify: `package.json`
- Modify: `wrangler.jsonc`
- Modify: `docs/deployment.md`

**Interfaces:**
- `npm run verify:worker` runs client tests, Worker tests, D1 migration tests, and Vite/Worker builds.
- `scripts/release-check.mjs` validates production `BASE_URL`, static shell, JSON health, API 404, `www` 301, and protected route behavior without creating test accounts in production.

- [ ] **Step 1: Add deterministic release verification**

Run `npm ci`, `npm run verify:worker`, and `npm run build` from a clean checkout. Ensure `.assetsignore` excludes worker source, `.env*`, test fixtures, and deployment files from public assets while retaining Vite output.

- [ ] **Step 2: Configure preview and production D1 bindings**

Create separate D1 databases, put database IDs in Wrangler environment sections, apply migrations locally and to preview, and verify schema with `wrangler d1 execute ... --remote --command="SELECT name FROM sqlite_master ..."`. Do not apply production migrations until the release checklist is green.

- [ ] **Step 3: Configure Worker Secrets and vars**

Set production secrets with `wrangler secret put` or Dashboard Secrets; set only public/non-sensitive vars in Wrangler. Confirm `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `CURSOR_SIGNING_SECRET`, `TURNSTILE_SECRET_KEY`, and deployment smoke secret are not present in GitHub logs or Vite output.

- [ ] **Step 4: Connect GitHub `main` to Workers Builds**

Connect `git@github.com:AaronChou313/wordward-game.git`, set root directory to repository root, production branch to `main`, build command to `npm run verify:worker`, deploy command to `npx wrangler deploy`, non-production deploy command to `npx wrangler versions upload`, and ensure preview environment uses preview D1. Configure the Wrangler version in `package.json` and enable build caching only after the uncached build passes.

- [ ] **Step 5: Apply production migration and deploy**

Before the first production migration, record the current D1 Time Travel bookmark. Apply migrations with the production environment, deploy the Worker, run the release checker, and inspect Workers logs/metrics for CPU, Error 1102, Error 1027, D1 failures, and secret leakage. Stop immediately on migration or smoke failure.

- [ ] **Step 6: Configure domain and redirect**

Add `sheepgame.top` to Cloudflare, replace Aliyun nameservers with Cloudflare nameservers, wait for Active status, attach `sheepgame.top` as the Worker Custom Domain, create a proxied `www` DNS record, configure a Single Redirect Rule to `https://sheepgame.top${uri}`, preserve query strings, and verify HTTPS certificate issuance. Remove conflicting old records only after the Worker preview is validated.

- [ ] **Step 7: Document rollback and commit release tooling**

Document Worker version rollback, D1 Time Travel restore, schema compatibility requirements, secret rotation, and the exact release order. Use Wrangler rollback to revert code only when the selected version is schema-compatible; restore D1 only for confirmed data corruption. Commit:

```bash
git add .assetsignore docs/cloudflare-release.md scripts/release-check.mjs package.json wrangler.jsonc docs/deployment.md
git commit -m "docs: add Cloudflare release workflow"
```

## Final verification checklist

- [ ] Run `npm ci`.
- [ ] Run `npm test`.
- [ ] Run `npx vitest run worker`.
- [ ] Run `npm run d1:migrate:local`.
- [ ] Run `npm run worker:test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify:worker`.
- [ ] Run local Wrangler smoke test against static assets, health, API 404, protected routes, auth, save conflict, duplicate merit, and leaderboard.
- [ ] Run preview Worker PBKDF2 benchmark and record the <= 8ms p95 gate.
- [ ] Verify preview and production use different D1 databases and Turnstile secrets.
- [ ] Verify GitHub `main` build and preview branch build behavior.
- [ ] Verify `https://sheepgame.top`, `https://www.sheepgame.top`, Cookie attributes, and all API paths.
- [ ] Verify no production logs or public assets contain secrets, passwords, tokens, complete saves, or battle summaries.
- [ ] Verify Worker rollback and D1 restore instructions against a non-production version before launch.
