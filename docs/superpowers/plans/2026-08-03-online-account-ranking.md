# Online Account and Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password accounts, editable profiles, PostgreSQL cloud saves, validated merit claims, and a global merit leaderboard.

**Architecture:** Add a Fastify API under `server/` with Prisma-managed PostgreSQL. The Vite client keeps offline storage behind a sync adapter, authenticates with short-lived access tokens plus HttpOnly refresh cookies, and submits idempotent Boss claims rather than arbitrary totals.

**Tech Stack:** Node.js 22 LTS, Fastify, Prisma, PostgreSQL 16, Argon2id, Vitest, Docker Compose, Nginx.

## Global Constraints

- Registration uses unique username and password; username is immutable.
- Refresh cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`; secrets come only from environment variables.
- Leaderboard merit is derived from unique server-side claims, never a client-supplied total.
- API failure must not prevent offline play; sync state and conflicts must be visible.

---

### Task 1: Server Workspace and Database Schema

**Files:**
- Create: `server/package.json`
- Create: `server/src/app.js`
- Create: `server/src/config.js`
- Create: `server/prisma/schema.prisma`
- Create: `server/.env.example`
- Create: `server/test/health.test.js`

**Interfaces:**
- Produces: `buildApp(options)`, Prisma models `User`, `Profile`, `GameSave`, `MeritClaim`, `RefreshToken`.

- [ ] Add Fastify, Prisma client, Argon2, JWT, cookie, rate-limit, and Vitest dependencies with Node 22 engine constraint.
- [ ] Define the five approved models, unique username, one-to-one profile/save, composite unique merit key `(userId, difficulty, bossWave)`, and indexed leaderboard fields.
- [ ] Test `GET /api/health` returns `{ status: 'ok' }` without exposing secrets.
- [ ] Implement config validation and app factory; run server tests and Prisma validation.
- [ ] Commit `feat: scaffold account api and database`.

### Task 2: Registration and Session Security

**Files:**
- Create: `server/src/modules/auth/routes.js`
- Create: `server/src/modules/auth/service.js`
- Create: `server/src/modules/auth/schemas.js`
- Create: `server/test/auth.test.js`

**Interfaces:**
- Produces: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`; `request.user.id` authentication decorator.

- [ ] Test username normalization, 3–24 character restriction, 10–128 character password restriction, duplicate rejection, invalid login, refresh rotation, logout revocation, and login rate limiting.
- [ ] Hash passwords with Argon2id, store only refresh-token hashes, issue 15-minute access tokens and 30-day rotating refresh tokens.
- [ ] Return generic login errors and clear cookies on invalid/revoked refresh.
- [ ] Run auth integration tests; commit `feat: add secure username authentication`.

### Task 3: Profile API and Client Screens

**Files:**
- Create: `server/src/modules/profile/routes.js`
- Create: `server/test/profile.test.js`
- Create: `src/net/apiClient.js`
- Create: `src/meta/accountScene.js`
- Create: `src/meta/profileScene.js`
- Modify: `src/main.js`
- Modify: `src/meta/homeScene.js`

- [ ] Test authenticated read/update, ownership isolation, nickname 1–24 characters, bio up to 200, and HTTPS-only avatar URL.
- [ ] Implement profile endpoints and canvas login/register/profile forms with keyboard input, validation messages, logout, and token refresh retry.
- [ ] Keep the access token in memory only and use `credentials: 'include'` for refresh cookies.
- [ ] Run server/client tests and build; commit `feat: add account and profile flows`.

### Task 4: Versioned Cloud Save Sync

**Files:**
- Create: `server/src/modules/save/routes.js`
- Create: `server/test/save.test.js`
- Create: `src/net/saveSync.js`
- Modify: `src/meta/saveData.js`
- Modify: `src/core/storage.js`

**Interfaces:**
- Produces: `GET /api/save`, `PUT /api/save` with `{ version, data }`; client `syncSave()`, `uploadLocalSave()`, `useCloudSave()`.

- [ ] Test first write, read ownership, schema-size limit, optimistic version increment, stale-write `409`, and rejection of protected merit fields inside JSON save.
- [ ] Add a storage adapter that always writes locally, queues cloud sync when logged in, and surfaces `offline`, `syncing`, `synced`, or `conflict` state.
- [ ] On first login with both saves, present explicit local/cloud choice; never silently overwrite.
- [ ] Run tests/build and simulate API outage/conflict; commit `feat: add resilient cloud save sync`.

### Task 5: Merit Claims and Leaderboard

**Files:**
- Create: `server/src/modules/merit/routes.js`
- Create: `server/src/modules/merit/service.js`
- Create: `server/test/merit.test.js`
- Create: `server/src/modules/leaderboard/routes.js`
- Create: `server/test/leaderboard.test.js`
- Create: `src/meta/rankingScene.js`
- Modify: `src/battle/battleScene.js`
- Modify: `src/main.js`
- Modify: `src/meta/homeScene.js`

**Interfaces:**
- Produces: `POST /api/merit/claims`, `GET /api/leaderboard?cursor=&limit=`, `GET /api/leaderboard/me`.

- [ ] Test merit values for every difficulty/Boss wave, duplicate idempotency, impossible wave/unlock rejection, transactional totals, descending merit order, earliest-score tie break, pagination, and current-user rank.
- [ ] Validate claim `{ difficulty, bossWave, runId, seed, startedAt, finishedAt, summary }`; enforce elapsed-time and progression sanity checks, then insert under the composite unique constraint.
- [ ] Submit claims on Boss death when online; queue signed claim payloads locally when offline and retry without duplicating awards.
- [ ] Render rank, nickname, avatar, merit, pagination, own-row highlight, loading/error/empty states.
- [ ] Run tests/build and multi-user integration scenario; commit `feat: add validated merit leaderboard`.

### Task 6: Deployment and Operations

**Files:**
- Create: `server/Dockerfile`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `deploy/nginx.conf`
- Create: `docs/deployment.md`
- Modify: `.gitignore`

- [ ] Add non-root production images, PostgreSQL health check, persistent database volume, API migration command, static frontend service, and Nginx `/api` proxy with HTTPS-ready headers.
- [ ] Document DNS, TLS certificate setup, required environment variables, Prisma migrations, daily `pg_dump`, restore test, log rotation, and rollback procedure without including live secrets.
- [ ] Run `docker compose config`, server tests, client tests, client build, and a container smoke test of registration, save, claim, and leaderboard.
- [ ] Commit `chore: add production deployment stack`.

### Task 7: Security and Release Gate

- [ ] Verify no secret or `.env` file is tracked, cookies have production flags, CORS allows only the deployed origin, request bodies are capped, and auth/claim routes are rate-limited.
- [ ] Run dependency audit, all tests, Prisma validation, production build, and database backup/restore drill.
- [ ] Document known limitation: rule validation reduces casual cheating but authoritative anti-cheat requires server-side replay simulation.
- [ ] Commit `test: complete online release verification`.
