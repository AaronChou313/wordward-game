# Project Handoff

## Current State

This repository is a Three Kingdoms-themed Chinese character tower-defense game. It runs entirely in the browser with Vite, plain ES modules, and Canvas 2D. The current handoff branch is `feature/gameplay-overhaul`, based on `master`, and the remote is `git@github.com:AaronChou313/wordward-game.git`.

The battle-core milestone is implemented and reviewed. The progression/collection milestone and online account/ranking milestone are designed and planned but not yet implemented. Do not assume the original 13-item request is complete until those two plans are finished.

## Technology and Commands

- Runtime: browser, Canvas 2D, ES modules
- Tooling: Node.js, Vite 5.4, Vitest 2.1.9
- Install: `npm install`
- Develop: `npm run dev`
- Test: `npm test`
- Production build: `npm run build`
- Preview build: `npm run preview`

Latest verified result before this handoff: 9 test files, 76 tests passed; Vite production build passed with 45 transformed modules; `git diff --check` was clean.

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

## Remaining Milestone 1: Progression and Collection

Implement [the progression plan](docs/superpowers/plans/2026-08-03-progression-systems.md) next, task by task and test-first. Required scope:

1. Data-driven gacha with published reward categories/rates, persistent 10-pull rare guarantee, and 50-pull precious guarantee.
2. Stronger active/passive item identities and additional tactical items.
3. Additional advanced characters/word combinations with unique strategic roles.
4. Clickable codex detail panels for units, words, items, elites, and Bosses.
5. Shop inventory containing up to four unique unowned items, refreshed only after battle settlement; upgrades remain in inventory.
6. Full progression regression pass.

The approved behavior is in [the progression design](docs/superpowers/specs/2026-08-03-progression-systems-design.md). Save V2 already contains `gacha.smallPity`, `gacha.bigPity`, and `shop.stock` placeholders for this milestone.

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

## Verification and Manual QA

Automated coverage is strong, but a full visual browser play-through has not been completed. Before release, manually verify:

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
- The `.superpowers/` execution ledger and agent reports are intentionally ignored and will not be available after cloning. The tracked specs, plans, tests, commits, and this handoff are the durable record.
- No pull request was created during this handoff. Confirm the branch on GitHub after push before switching devices.
