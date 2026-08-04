# Project Handoff

## Current State

This repository is a Three Kingdoms-themed Chinese character tower-defense game. It runs entirely in the browser with Vite, plain ES modules, and Canvas 2D. The current handoff branch is `feature/gameplay-overhaul`, based on `master`, and the remote is `git@github.com:AaronChou313/wordward-game.git`.

The battle-core milestone, all six progression tasks, and all seven online tasks are implemented and independently reviewed. The online milestone includes the API/database scaffold, secure sessions, profiles, resilient cloud saves, server-validated merit claims, the global leaderboard, the production container/operations stack, and the final security release gate. The code is ready for the documented production deployment; the public server rollout and browser smoke test remain operational steps.

## Technology and Commands

- Runtime: browser, Canvas 2D, ES modules
- Tooling: Node.js 22, Vite 8.2.0, Vitest 4.1.10
- Install: `npm ci` and `npm --prefix server ci`
- Develop: `npm run dev`
- Client test: `npm test`
- API test: `npm --prefix server test`
- Production build: `npm run build`
- Preview build: `npm run preview`

Latest verified result before this handoff: 18 client files / 175 tests passed; 9 API files / 69 tests passed, with the opt-in PostgreSQL file skipped in the ordinary API run. The skipped PostgreSQL 16 Serializable concurrency scenario was then run separately against a temporary migrated database and passed 1/1. Vite production build passed with 57 transformed modules; Prisma schema validation, checksum-verified Docker Compose v5.3.1 config validation, both production dependency audits, deployment-script syntax checks, and `git diff --check` passed.

## Repository Layout

- `src/main.js`: canvas initialization, scene registration, input, assets, and main loop.
- `src/core/`: input, rendering loop, audio, storage, assets, and scene manager.
- `src/battle/`: battle scene and domain logic for towers, enemies, spawning, progression, pools, blocking, words, merging, effects, and tests.
- `src/config/`: difficulty, waves, enemies, units, words, items, equipment, economy, codex, and map data.
- `src/meta/`: home, shop, inventory, gacha, equipment, codex, and versioned save data.
- `src/ui/`: reusable canvas buttons, panels, and toast messages.
- `docs/superpowers/specs/`: approved designs.
- `docs/superpowers/plans/`: executable implementation plans.
- `dist/` and `node_modules/`: generated/ignored; do not commit.

## Completed: Battle Core

The following work is present on this branch:

1. Save schema V2 and recursive V1 migration, preserving existing progress and unknown fields.
2. Difficulty completion through defeating the wave-30 Boss and receiving merit; combat continues to wave 31 and ends only on defeat or voluntary exit.
3. Merit rewards are idempotent. Easy/normal/hard/endless multipliers are 1/2/4/8. Endless claims are floor-qualified.
4. Endless floor progression: the highest unlocked floor advances once after its wave-30 Boss; lower-floor replay and wave 60 do not unlock additional floors.
5. Legacy `endless:<wave>` claim keys migrate generically to `endless:1:<wave>`, preventing duplicate rewards after upgrading.
6. Finite per-battle advanced-character pool: prefixes have 3 copies, two-character hero characters 2, three-character-only characters 1, capped at 28. Base unit characters remain unlimited.
7. The battle “军营” modal displays remaining/initial advanced-character counts and pauses background interaction.
8. Elite enemies appear at waves 10 and 20; Bosses appear every 30 waves. Named archetypes have telegraphed near/ranged stun skills, cooldowns, and stun immunity.
9. Base “兵” units can occupy road cells, block enemies locally by path position and capacity, take damage, release enemies on death, and refill HP after tier/level growth.
10. The shovel is rendered as draggable “铲”; only a valid drop on an inactive non-road slot consumes it.
11. Defeat immediately stops the update frame, preventing post-settlement kills, score changes, or Boss claims.
12. Deterministic integration/balance tests cover special waves, Boss HP ratios, stun duty cycle, merit/unlocks, pools, blocking, shovel interaction, and save compatibility.

Important battle modules added during this milestone include:

- `src/battle/progression.js`
- `src/battle/charPool.js`
- `src/battle/spawnPlan.js`
- `src/battle/blocking.js`
- `src/config/enemies.js`

## Completed Milestone 1: Progression and Collection

Implement [the progression plan](docs/superpowers/plans/2026-08-03-progression-systems.md) next, task by task and test-first. Required scope:

1. Completed: data-driven gacha with published base/next-draw reward rates, persistent 10-pull rare guarantee, and 50-pull precious guarantee.
2. Completed: stronger active/passive item identities and additional tactical items.
3. Completed: additional advanced characters/word combinations with unique strategic roles.
4. Completed: clickable codex detail panels for units, words, items, elites, and Bosses.
5. Completed: shop inventory containing up to four unique unowned items, refreshed only after battle settlement; upgrades remain in inventory.
6. Completed: full progression regression pass.

## Completed: Progression Task 1

The commit subject is `feat: add transparent dual-pity gacha`. The implementation adds:

- Rarity-first, injectable draws driven by `src/config/gacha.js`, with normal rates 72% common, 23% rare, and 5% precious.
- Effective next-draw probabilities shared by the engine and UI, including 0/95/5 on the tenth-draw guarantee and 0/0/100 on the fiftieth-draw guarantee.
- Persistent pity counters and up to ten recent results in save V2 without losing older save fields.
- Useful rewards only: gold, advanced characters, and items. Duplicate characters convert to gold; duplicate items upgrade.
- Distinct precious value: locked characters are preferred while any remain, and precious items grant two levels instead of one.
- A draggable gacha panel showing base rates, next-draw rates, every reward category, pity distance, and recent results.

Independent review found no Critical or Important issues after fixes. Non-blocking regression candidates remain for the all-characters-unlocked precious fallback, first-time precious item Lv2, full 10/50 sequential draws, and a real localStorage reload path; cover them during Task 6 even if later task work does not touch gacha.

The approved behavior is in [the progression design](docs/superpowers/specs/2026-08-03-progression-systems-design.md). Save V2 already contains `gacha.smallPity`, `gacha.bigPity`, and `shop.stock` placeholders for this milestone.

## Completed: Progression Task 2

The commit subject is `feat: differentiate active and passive items`. The implementation adds:

- Five data-driven active items with cast modes, level-aware cooldowns, effect descriptors, and handler-map dispatch: `fire`, `recruit`, `train`, `reinforce`, and `warDrum`.
- Six passive items aggregated once at battle entry: `power`, `swift`, `goldpot`, `fortification`, `bossBane`, and `resolute`.
- New tactical hooks for filling empty refresh-bar slots, global slow, blocker HP/capacity, Boss-only damage, and stun-duration reduction.
- Independent named slow sources for war drum, tower aura, and charm so short effects no longer overwrite longer or stronger effects.
- Battle-entry normalization for legacy active-item strings and rejection of unknown, passive, unowned, or invalid entries.
- Distinct active/passive inventory colors, headings, slot counts, usage hints, and draggable vertical scrolling.

Automated verification covers schema identity, all active dispatch paths and cooldown behavior, passive aggregation and combat hooks, independent slow timing, save normalization, inventory presentation, and refresh-bar filling. Manual Canvas QA activated all five active items, confirmed the active/passive card treatment, and found no browser console errors. Independent review reported no Critical or Important issues; a non-blocking hardening candidate remains to deduplicate and cap active entries in deliberately corrupted saves.

## Completed: Progression Task 3

The commit subject is `feat: expand advanced character strategies`. The implementation adds:

- Four finite-pool prefix characters with complete effects and codex metadata: `虎` doubles each tower's first hit per enemy, `盾` strengthens blocker health/capacity, `火` applies attributed damage over time, and `军` makes an adjacent base unit strengthen its four-neighbor base allies.
- A structured prefix schema with labels, descriptions, colors, pool classification, codex hints, and numeric effects; all five original prefixes use the same schema without changing their behavior.
- Burn processing in the enemy update phase, including unified kill rewards and Boss settlement through the existing idempotent `handleKill()` path.
- Blocker-stat synchronization that preserves current health ratio when a shield word connects or disconnects.
- Overflow-pool rotation with injectable randomness, preserving complete 3/2/1 character allocations and the 28-copy cap while preventing migrated saves from permanently starving newly appended characters.
- Consistency tests proving every advanced character participates in a prefix or hero combination and every hero references defined characters.

Canvas QA formed all four new combinations. `盾兵` visibly raised capacity from 1 to 2, and a `军` formation raised an adjacent archer's displayed attack from 14 to 17 after rounding; no browser warnings or errors were reported. Independent review reported no Critical or Important issues after the overflow-pool fix. Non-blocking Task 6 candidates are an explicit shield-disconnect regression and an integration assertion that a lethal burn settles kill rewards and Boss merit exactly once.

## Completed: Progression Task 4

The commit subject is `feat: add detailed codex attributes`. The implementation adds:

- Six scrollable codex categories covering every configured base unit, prefix, hero, item, elite, and Boss.
- A pure `detailFor(category, key)` projection with attack timing, attack types, skills, word recipes, complete prefix effects, level-one item behavior, and enemy multipliers/skill timing.
- Clickable cell hitboxes that remain aligned while scrolling, plus a separate draggable detail modal with wrapped long values and retained list position after closing.
- Locked-entry presentation that exposes only the title and acquisition hint; rows and descriptions remain hidden until unlocked.
- Persistent `codex.elite` and `codex.boss` encounter-key arrays. Special-enemy descriptors carry the selected archetype key, and the battle records the identity when that enemy actually spawns, so random alternatives never unlock each other.
- Conservative migration for older saves: missing enemy encounter arrays become empty instead of inferring identities from an ambiguous highest-wave record.

Canvas QA verified six-category scrolling, a complete unlocked `虎` panel, a locked `震地校尉` hint-only panel, close-and-return scroll retention, and a clean browser console. Independent review reported no Critical or Important issues after encounter identity persistence was added. A non-blocking coverage candidate remains to drive `BattleScene.update()` directly while asserting the first special spawn persists exactly once; the current pure identity and random-selection integration paths are covered.

## Completed: Progression Task 5

The commit subject is `feat: add rotating four-item shop`. The implementation adds:

- Injectable Fisher–Yates selection of up to four unique unowned items, with correct behavior when fewer than four remain.
- Persisted `shop.initialized` state that distinguishes a never-generated first stock from an initialized stock that the player has bought empty.
- Stable inventory across repeated shop visits; purchases remove one item without immediate replacement, and externally acquired stock entries are filtered without backfilling.
- A four-card active/passive shop UI with level-one descriptions and purchase-only controls. Item upgrades, equipment, and sales remain exclusively in the inventory.
- Removal of the shop's random advanced-character purchase path.
- Stock refresh inside the idempotent `gameOver()` settlement path, covering both defeat and voluntary exit while excluding already owned items.

Canvas QA verified stable repeated visits, a 4-to-3 purchase without replacement, a new four-item stock after voluntary battle exit, exclusion of the purchased item, and a clean browser console. Independent review reported no Critical or Important issues. Task 6 should add explicit regressions for repeated `gameOver()`, migration of initialized empty/non-empty stocks, and the acquire-then-filter/sell-without-backfill lifecycle.

## Completed: Progression Task 6

The focused commit subject is `test: cover progression systems`. The regression pass adds:

- Exact sequential draw assertions for the tenth rare-or-better and fiftieth precious guarantees, including JSON serialization plus save migration immediately before both guaranteed draws.
- Prize boundary coverage for first-time precious items at Lv2, all-characters-unlocked precious conversion, and rare/precious gold outcomes.
- Defensive active-slot normalization that deduplicates corrupted saves and caps battle loadout entries at the configured three-slot limit.
- Shield-prefix connect/disconnect assertions that preserve blocker health ratio and restore baseline capacity.
- Direct battle-update coverage for recording only the actual spawned elite identity, plus a lethal Boss burn integration proving kill, merit, and unlock settlement run exactly once.
- Shop regressions for repeated `gameOver()` settlement, initialized empty/non-empty migration, and externally acquired stock filtering without backfill after sale.

The final production-preview smoke test performed a real draw, reloaded the page, reopened gacha, and confirmed the displayed pity distances remained 9 and 49 with the recent result intact. The browser console was clean. Automated verification passed 14 test files / 145 tests, the Vite build transformed 49 modules, and `git diff --check` passed.

Independent review reported no Critical or Important issues. Remaining low-risk hardening candidates are a full `BattleScene.update()` lethal-burn wiring test and defensive deduplication/capping of deliberately corrupted passive-item arrays; normal inventory UI does not produce such passive arrays.

## Remaining Milestone 2: Accounts and Ranking

After progression is stable, implement [the online-system plan](docs/superpowers/plans/2026-08-03-online-account-ranking.md). The accepted architecture is:

- Vite client remains the game frontend.
- Node.js 22 + Fastify API under `server/`.
- PostgreSQL 16 managed through Prisma.
- Username/password accounts; Argon2id password hashing.
- Short-lived access tokens and rotating HttpOnly refresh cookies.
- Editable nickname, HTTPS avatar URL, and biography.
- Versioned cloud-save synchronization with explicit conflict handling and offline fallback.
- Server-validated, idempotent Boss merit claims; never trust a client-submitted total.
- Paginated global leaderboard ordered by merit, then earliest attainment time.
- Docker Compose deployment with Nginx HTTPS proxy, database backup/restore documentation, input validation, and rate limits.

See [the online design](docs/superpowers/specs/2026-08-03-online-account-ranking-design.md) before changing security or data-model decisions.

## Completed: Online Task 1

The focused commit subject is `feat: scaffold account api and database`. The implementation adds:

- An isolated `server/` package constrained to Node.js 22, with Fastify 5, Prisma 7, Argon2, JWT, cookie, rate-limit, dotenv, and Vitest dependencies locked independently from the Vite client.
- Fail-fast environment validation for the PostgreSQL URL and independent 32-character access-token/refresh-token secrets without echoing secret values in errors.
- A `buildApp(options)` Fastify factory with a 1 MiB body limit, common security plugins, and an exact `GET /api/health` response of `{ status: 'ok' }`.
- Prisma 7 configuration and PostgreSQL models for `User`, `Profile`, `GameSave`, `MeritClaim`, and `RefreshToken`, including one-to-one profile/save ownership, unique normalized username storage, a floor-qualified merit idempotency constraint, and leaderboard ordering fields/index.
- A tracked `.env.example` containing placeholders only; no live `.env` or credentials are tracked.

Independent review found and resolved a design conflict before commit: the plan's three-field merit key could not distinguish wave 30 on different endless floors, and a globally unique `runId` would reject later Bosses in the same run. `MeritClaim` therefore stores `endlessFloor` (default 1), uses `(userId, difficulty, endlessFloor, bossWave)` as its unique idempotency key, retains a three-field lookup index, and only indexes `(userId, runId)` without making it unique.

Verification passed the API suite (2 files / 6 tests) under an explicit Node 22.23.2 runtime, Prisma validation without requiring a live environment file, the combined root suite (16 files / 151 tests), the client production build, and production-dependency audit with zero findings. The workstation's default Node 24 emits the expected engine warning, while the supported Node 22 run is green. Online Task 2 builds on this scaffold.

## Completed: Online Task 2

The focused commit subject is `feat: add secure username authentication`. The implementation adds:

- `POST /api/auth/register`, `/login`, `/refresh`, and `/logout`, plus a reusable JWT authentication decorator that exposes `request.user.id`.
- NFKC + trim + lowercase username normalization, 3–24 character usernames, 10–128 character passwords, normalized duplicate rejection, and immutable stored usernames.
- Argon2id password hashing, a dummy Argon2id verification path for unknown users, and identical login errors for unknown usernames and incorrect passwords.
- Fifteen-minute access JWTs and 30-day opaque refresh tokens stored only as HMAC-SHA256 hashes. Raw refresh values exist only in `HttpOnly`, `Secure`, `SameSite=Lax` cookies scoped to `/api/auth`.
- Transactional registration, atomic conditional refresh-token revocation, single-use rotation, old-token replay rejection, logout revocation, and cookie clearing on invalid/revoked refresh.
- Per-route login limiting at five attempts per minute and registration limiting at ten attempts per minute, in addition to the global API limit.
- Prisma 7's required PostgreSQL driver adapter (`@prisma/adapter-pg` + `pg`) and ownership-aware disconnect handling for the app-created client.

Independent security review reported no Critical or Important issues. Follow-up coverage candidates are a concurrent `Promise.all` refresh race, successful password-login and disabled-account cases. Deployment Task 6 must configure a narrowly trusted Nginx proxy before relying on client-IP limits and add SIGTERM/SIGINT graceful shutdown.

Verification passed the API suite (3 files / 13 tests) under Node 22.23.2, the combined root suite (17 files / 158 tests), Prisma client generation/validation, the Vite build, production-dependency audit with zero findings, and `git diff --check`. Next implement Online Task 3 profile API and Canvas account/profile screens.

## Completed: Online Task 3

The focused commit subject is `feat: add account and profile flows`. The implementation adds:

- Authenticated `GET /api/profile` and `PUT /api/profile` routes that derive ownership exclusively from the verified access token and validate nickname, biography, and HTTPS-only avatar URLs.
- A browser API client that keeps access tokens in memory, sends refresh cookies with credentials, retries one 401 after refresh, coalesces concurrent refresh attempts into a single token rotation, and reports non-JSON outages as a stable `API unavailable` error.
- Canvas login and registration screens with NFKC-aware username validation, password masking, mobile/IME-compatible hidden text input, session restoration, and clear unavailable-server feedback.
- A Canvas profile screen for viewing and editing nickname, biography, and avatar URL, with authenticated logout and lifecycle guards preventing late restore/profile responses from navigating after the scene has exited.
- A home-screen account entry and scene registration without changing the completed battle core.

Manual browser QA entered a username and password through the hidden keyboard bridge, verified masked Canvas rendering, exercised the unavailable-API message against a static preview, and found a clean browser console. Independent review initially found one Important concurrent-refresh race; a red test reproduced two refresh rotations and the shared in-flight refresh fix reduced that to one. Re-review reported no Critical or Important issues. A non-blocking hardening candidate remains for suppressing a late successful login/register navigation if the user returns home while the request is in flight.

Verification passed the API suite (4 files / 17 tests) under Node 22.23.2, the combined root suite (19 files / 166 tests), Prisma validation, the Vite build (53 modules), and `git diff --check`. Next implement Online Task 4 versioned cloud-save synchronization and explicit conflict handling.

## Completed: Online Task 4

The focused commit subject is `feat: add resilient cloud save sync`. The implementation adds:

- Authenticated `GET /api/save` and `PUT /api/save` routes with owner-scoped reads, version-zero first writes, atomic optimistic version increments, stale-write `409` responses containing the current cloud save, and first-write unique-constraint race handling.
- A 256 KiB JSON save limit, positive schema-version validation, and explicit rejection of the top-level client `merit` object. The client strips that protected field before upload; leaderboard merit remains outside cloud-save trust boundaries.
- A local-first storage subscription: every gameplay save is written locally before a cloud action is queued. Sync exposes `offline`, `syncing`, `synced`, and `conflict`, persists dirty/version metadata, retries failed reads and writes, and reacts to browser network recovery.
- Explicit first-login conflict choices on the profile scene. `uploadLocalSave()` keeps local progression, while `useCloudSave()` replaces it only after the player chooses; neither path silently overwrites the other save.
- Canonical key-sorted save comparison for PostgreSQL JSONB, serialized GET/PUT drains, latest-snapshot coalescing, and session-generation guards so delayed requests or refreshes cannot cross account boundaries.

The independent review deliberately interleaved concurrent saves, delayed GETs, delayed PUTs, timer-triggered uploads, API recovery, account switching, and refresh rotation. Each discovered race was reproduced by a failing test before its fix. Final review reported no Critical, Important, or Minor issues and Ready: Yes.

Verification passed the API suite (5 files / 24 tests) under Node 22.23.2, the combined root suite (21 files / 190 tests), Prisma validation, the Vite build (54 modules), and `git diff --check`. Automated client scenarios simulate both API outage recovery and explicit conflicts. Next implement Online Task 5 server-validated merit claims and the global leaderboard; never derive ranking totals from cloud-save JSON.

## Completed: Online Task 5

The focused commit subject is `feat: add validated merit leaderboard`. The implementation adds:

- Authenticated, rate-limited `POST /api/merit/claims` that derives merit exclusively from difficulty and Boss wave. Client-supplied totals are schema-forbidden, while `(userId, difficulty, endlessFloor, bossWave)` remains the permanent reward idempotency key.
- Conservative server validation for unlock order, supported Boss waves, actual configured spawn-count bounds, elapsed time, completion time, remaining Lord health, and sequential Boss evidence within one run.
- A separate `MeritRunCheckpoint` model keyed by `(userId, runId)`. Permanent reward claims remain immutable while replay runs can establish their own wave-30 checkpoint and legitimately continue to wave 60; checkpoints bind difficulty, floor, seed, start time, latest completion time, and highest Boss wave.
- Serializable claim transactions, unique-race recovery, and a second-transaction checkpoint repair path. Fault-injection tests simulate rollback when different runs race for the first reward and prove the losing run can still continue without double-awarding merit.
- A user-scoped local claim queue that retries outages, does not cross accounts, preserves authentication failures, allows prerequisite claims to bypass temporarily progression-locked entries, and never lowers mature local merit from a smaller verified server total.
- Anonymous cursor-based leaderboard pagination ordered by merit descending, attainment time ascending, and stable user ID. Cursors use a domain-separated HMAC rather than JWT, so they cannot authenticate protected endpoints; `/me` reports the authenticated user's global rank.
- A Canvas ranking scene with pagination, avatar/nickname/merit rows, own-row highlighting, and loading/error/empty states. Boss deaths are submitted even when the equivalent local reward was already claimed, enabling server backfill for migrated/offline progress.

Manual Canvas QA verified the home ranking entry, loading/error layout, and a clean browser console. Independent review found and resolved cursor/token confusion, weak battle bounds, queue ordering, local backfill, legal cross-run continuation, and concurrent checkpoint rollback. Final review reported no Critical or Important issues and Ready: Yes.

Verification passed 25 test files / 225 tests, the Vite build transformed 56 modules, Prisma schema validation passed, and `git diff --check` passed. The later Online Task 7 release gate completed the real PostgreSQL concurrency scenario, unified `P2034` retry handling, stale checkpoint retention, and disabled-account ranking behavior.

## Completed: Online Task 6

The focused commit subject is `chore: add production deployment stack`. The implementation adds:

- Node.js 22 multi-stage frontend and API images. The final Nginx and API processes run as UID 101 and UID 1000 respectively; the API base installs CA certificates and OpenSSL so Prisma generation and runtime resolve the correct crypto library.
- A PostgreSQL 16 / API / Web Compose stack with a persistent database volume, health-gated startup, automatic `prisma migrate deploy`, loopback-only default publishing, read-only application filesystems, temporary writable mounts, restart policies, and capped local Docker logs.
- A generated baseline PostgreSQL migration covering all production tables, indexes, foreign keys, enums, and the per-run merit checkpoint model.
- An unprivileged Nginx SPA server with `/api` proxying, a one-MiB body limit, long-lived hashed assets, CSP/frame/MIME/referrer/permissions headers, and forwarding that preserves an outer TLS terminator's exact `https` protocol.
- Production Fastify proxy trust restricted to loopback, RFC1918, and ULA addresses. Forwarded protocol/IP behavior has a runtime regression so rate limiting observes the real client rather than the Web container.
- Complete deployment documentation for DNS/TLS, environment secrets, migrations, sequential low-memory builds, daily `pg_dump`, disposable restore drills, log rotation, and application/database rollback.
- A reusable `deploy/smoke.sh` that creates a temporary account and verifies health, registration, first cloud-save write, an idempotent server-validated Boss claim, and leaderboard publication without ever submitting an aggregate merit total.

Local verification used a checksum-verified standalone Docker Compose v5.1.4 binary because Docker Desktop is not installed. Compose interpolation/config validation passed with the placeholder `.env.example` and no live secrets.

The authorized `aaron-cloud` host was inspected before changes: it was an otherwise idle Ubuntu 22.04 server with about 890 MiB RAM, no swap, and no Docker. The official Docker repository was installed (Docker 29.7.1, Compose 5.3.1), a persistent 2 GiB `/swapfile` was added after backing up `/etc/fstab` to `/etc/fstab.wordward-predeploy`, and an isolated checkout was staged at `/root/wordward-smoke`. Parallel image construction overloaded the single small host, so it was stopped and the documented sequential Web/API build completed successfully. PostgreSQL, API, and Web then reached healthy status on loopback port 18080, non-root UIDs were confirmed, and the full smoke script passed.

The original loopback-only smoke host was superseded because its 1 GiB memory was insufficient for reliable deployment work. The final deployment target is the Ubuntu 22.04 server documented in `docs/deployment.md`, using `sheepgame.top` behind Caddy HTTPS. Do not expose the Secure-cookie account flow over plain HTTP.

Verification passed 26 test files / 232 tests, the Vite build transformed 56 modules, Prisma validation passed, official Compose config validation passed, both images built, all three services were healthy, the five-step application smoke passed, and `git diff --check` passed.

## Completed: Online Task 7

The security release gate adds production-only HTTPS origin validation and credentialed CORS, filters disabled accounts from public ranking and authenticated rank calculations, retries transient PostgreSQL Serializable conflicts, removes stale run checkpoints, prunes API image development dependencies, and keeps migration tooling available at runtime.

The release workflow now includes a detailed Ubuntu 22.04 deployment guide for `sheepgame.top`, Caddy-managed HTTPS, loopback-only Compose publishing, safe GitHub SSH pulls, sequential low-memory image builds, validated atomic database backups through `deploy/backup.sh`, disposable restore drills, update and rollback procedures, and explicit dangerous-command warnings.

Final release verification passed 18 client files / 175 tests and 9 API files / 69 tests. The opt-in PostgreSQL 16 Serializable concurrency test passed 1/1 against a temporary database after the production migration was applied. Vite transformed 57 modules, Prisma validation passed, Compose v5.3.1 config validation passed, both production dependency audits reported zero vulnerabilities, and shell/Git checks passed.

## Verification and Manual QA

Automated coverage is strong, and Task 2 received focused Canvas QA, but a full visual browser play-through has not been completed. Before release, manually verify:

- Fresh and migrated saves.
- Waves 10, 20, 30, and 60, including skill telegraphs and Boss pressure.
- Wave-30 merit banner, next-difficulty unlock, and uninterrupted wave-31 continuation.
- Endless floor-1 completion and floor-2 availability.
- Military-camp counts while refreshing, placing, merging, and forming heroes.
- Multiple road blockers, overflow enemies, blocker death, HP bars, and drag/swap behavior.
- Shovel drag using mouse and touch.
- Canvas layout at supported viewport sizes and both 1×/2× game speed.

Balance constants are centralized in `src/config/`. Prefer tuning those values after recorded play-throughs rather than embedding numbers in scene logic.

## New Device Resume Procedure

```bash
git clone git@github.com:AaronChou313/wordward-game.git
cd wordward-game
git fetch origin
git switch feature/gameplay-overhaul
npm install
npm test
npm run build
npm run dev
```

Then read `AGENTS.md`, this file, the approved specs, and the next implementation plan. Keep work on `feature/gameplay-overhaul` unless intentionally opening a new milestone branch. Run focused tests during each task, followed by `npm test` and `npm run build` before every push.

## Git and Handoff Notes

- Baseline branch: `master`
- Development branch: `feature/gameplay-overhaul`
- Battle-core integration fixes culminate at `2524fc2`; legacy endless migration fixes follow it.
- Progression Task 1 is commit `2b2227e` (`feat: add transparent dual-pity gacha`).
- Progression Task 2 is commit `e1daa09` (`feat: differentiate active and passive items`).
- Progression Task 3 is commit `802eece` (`feat: expand advanced character strategies`).
- Progression Task 4 is commit `0a8cd8c` (`feat: add detailed codex attributes`).
- Progression Task 5 is commit `1808201` (`feat: add rotating four-item shop`).
- Progression Task 6 is commit `c4d523c` (`test: cover progression systems`).
- Online Task 1 is commit `42fc7c9` (`feat: scaffold account api and database`).
- Online Task 2 is commit `4963f5f` (`feat: add secure username authentication`).
- Online Task 3 is commit `3486142` (`feat: add account and profile flows`).
- Online Task 4 is commit `c57123c` (`feat: add resilient cloud save sync`).
- Online Task 5 is commit `02ab0a8` (`feat: add validated merit leaderboard`).
- Online Task 6 uses the focused commit subject `chore: add production deployment stack`; use `git log` for its immutable hash after checkout.
- After all online tasks and release verification are complete, the user has authorized pushing this branch, connecting with `ssh aaron-cloud`, pulling from GitHub, and deploying on the configured server. Inspect the existing remote services and deployment state before changing them; preserve unrelated workloads and document the exact production commands, backup, and rollback path here.
- The `.superpowers/` execution ledger and agent reports are intentionally ignored and will not be available after cloning. The tracked specs, plans, tests, commits, and this handoff are the durable record.
- No pull request was created during this handoff. Confirm the branch on GitHub after push before switching devices.
