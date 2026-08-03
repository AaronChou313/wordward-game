# Battle Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 30-wave completion, finite advanced-character pools, military camp UI, elite/Boss enemies, road-blocking infantry, draggable shovels, and merit rewards.

**Architecture:** Extract deterministic rules from `BattleScene` into focused configuration and domain modules. Keep canvas input/rendering in the scene while unit-tested modules own progression, pool accounting, spawning, blocking, and merit idempotency.

**Tech Stack:** Vite 5, ES modules, Canvas 2D, Vitest, localStorage.

## Global Constraints

- Defeating the wave-30 Boss and receiving merit unlocks the next difficulty; battle continues until death.
- Elite enemies spawn on waves 10 and 20; Bosses spawn on waves 30, 60, and every 30 waves thereafter.
- Base characters are unlimited; advanced characters are finite per battle.
- Existing version-1 saves must migrate without losing gold, inventory, equipment, codex, or difficulty progress.

---

### Task 1: Test Harness and Save Migration

**Files:**
- Modify: `package.json`
- Modify: `src/meta/saveData.js`
- Create: `src/meta/saveData.test.js`

**Interfaces:**
- Produces: `migrateSave(raw): SaveV2`, exported from `saveData.js`.

- [ ] Add `vitest` as a dev dependency and scripts `test: "vitest run"`, `test:watch: "vitest"`.
- [ ] Write a failing test that migrates a version-1 fixture and expects `version: 2`, `merit.total: 0`, `merit.claimed: {}`, `gacha.smallPity: 0`, `gacha.bigPity: 0`, and `shop.stock: []` while preserving existing fields.
- [ ] Run `npm test -- src/meta/saveData.test.js`; expect failure because `migrateSave` is absent.
- [ ] Implement migration with nested object defaults rather than shallow replacement, then call it from `getSave()`.
- [ ] Re-run the test and `npm run build`; expect both to pass.
- [ ] Commit with `test: add save migration foundation`.

### Task 2: Completion and Merit Rules

**Files:**
- Create: `src/battle/progression.js`
- Create: `src/battle/progression.test.js`
- Modify: `src/config/difficulty.js`
- Modify: `src/battle/battleScene.js`

**Interfaces:**
- Produces: `isBossWave(wave)`, `isEliteWave(wave)`, `meritForBoss(diffId, wave)`, `claimKey(diffId, wave)`, `nextDifficulty(diffId)`.

- [ ] Test that elite waves are exactly 10 and 20 within each 30-wave cycle, Boss waves are positive multiples of 30, and merit values at waves 30/60 are `1/2`, `2/4`, `4/8`, `8/16` for easy/normal/hard/endless.
- [ ] Test that a wave record alone cannot unlock difficulty; a claimed wave-30 Boss can.
- [ ] Run `npm test -- src/battle/progression.test.js`; expect missing-module failure.
- [ ] Implement pure rules and change `DIFF_UNLOCK` to use `bossWave: 30` plus claim state.
- [ ] On Boss death, write a unique claim key, increment total merit once, mark completion, unlock the next difficulty, and show a non-blocking banner. Remove wave-based unlock from `gameOver()`.
- [ ] Run progression tests and build; manually verify battle continues after the completion banner.
- [ ] Commit with `feat: add boss completion and merit progression`.

### Task 3: Finite Advanced-Character Pool and Camp

**Files:**
- Create: `src/battle/charPool.js`
- Create: `src/battle/charPool.test.js`
- Modify: `src/battle/refreshBar.js`
- Modify: `src/battle/battleScene.js`

**Interfaces:**
- Produces: `createCharPool(unlockedChars)`, class methods `draw(random)`, `remaining(char)`, `remainingTotal()`, `snapshot()`.
- Consumes: `RefreshBar(unlockedChars, diff, charPool, random = Math.random)`.

- [ ] Test quantities: prefixes have 3 copies, two-character heroes 2 per character, three-character heroes 1 per character, and the overall inventory is capped at 28 using stable priority order.
- [ ] Test that drawing decrements once, exhausted characters cannot draw, and base draws remain unlimited.
- [ ] Run the focused tests and confirm failure.
- [ ] Implement the pool and inject it into `RefreshBar`; use available pool weights when the advanced roll succeeds and fall back to a base character when empty.
- [ ] Add a `军营` button and modal listing remaining/initial counts. Count characters as appeared when generated into the bar; never return discarded or combined characters.
- [ ] Test pool logic, run the full suite/build, and manually verify the modal updates after refreshes.
- [ ] Commit with `feat: add finite character pool and camp view`.

### Task 4: Enemy Archetypes and Control Skills

**Files:**
- Create: `src/config/enemies.js`
- Create: `src/battle/spawnPlan.js`
- Create: `src/battle/spawnPlan.test.js`
- Modify: `src/battle/enemy.js`
- Modify: `src/battle/tower.js`
- Modify: `src/battle/battleScene.js`

**Interfaces:**
- Produces: `spawnPlan(wave, waveCfg, random)`, enemy fields `type`, `name`, `skill`, `skillCooldown`, tower field `stunTimer`.

- [ ] Test normal-only waves, elite additions on 10/20, and Boss additions on 30/60. Assert elite HP/speed multipliers `5/0.65` and Boss multipliers `16/0.55`.
- [ ] Define named elites `震地校尉` (near stun) and `神射都尉` (ranged-unit stun), plus Bosses `虎牢吕布` and `魏武曹操`; select deterministically from wave and seeded random input.
- [ ] Implement enemy skill telegraph, cooldown, target selection, 2–3 second tower stun, and a post-stun immunity window. Make `Tower.update()` skip attacks while stunned and render the state.
- [ ] Connect spawn plans without reducing normal enemy count and award merit through Task 2’s Boss death hook.
- [ ] Run focused/full tests and build; manually play waves using a temporary debug start-wave query parameter, then remove the debug path before commit.
- [ ] Commit with `feat: add elite and boss encounters`.

### Task 5: Road-Blocking Infantry

**Files:**
- Create: `src/battle/blocking.js`
- Create: `src/battle/blocking.test.js`
- Modify: `src/config/units.js`
- Modify: `src/battle/grid.js`
- Modify: `src/battle/tower.js`
- Modify: `src/battle/enemy.js`
- Modify: `src/battle/battleScene.js`

**Interfaces:**
- Produces: `blockStats(tier, level): { maxHp, capacity }`, `assignBlockers(infantry, enemies)`.

- [ ] Test that only `兵` can occupy road cells, nearest enemies up to capacity stop, overflow enemies move, and tier/level upgrades increase and refill HP.
- [ ] Implement road deployment validation and infantry HP rendering. Use `maxHp = 140 * 1.7^(tier-1) * (1 + .12*(level-1))`, capacity `min(4, 1 + floor((tier-1)/2))`.
- [ ] Make blocked enemies attack every second using wave-scaled damage; remove dead infantry and resume enemy movement.
- [ ] Update merge/level-up paths to call `refillBlocker()` and preserve normal off-road infantry attacks.
- [ ] Run tests/build and manually verify overflow behavior with at least five enemies.
- [ ] Commit with `feat: make infantry block road enemies`.

### Task 6: Draggable Shovel Character

**Files:**
- Modify: `src/battle/battleScene.js`
- Modify: `src/battle/refreshBar.js`

**Interfaces:**
- Produces: drag source `{ source: 'shovel', char: '铲', ... }`.

- [ ] Add interaction tests where pointer-down on the shovel starts a drag, dropping on an inactive non-road cell consumes one shovel, and invalid drops consume nothing.
- [ ] Remove `shovelMode` and button toggle behavior; render a draggable `铲` tile with count badge in the existing bottom action area.
- [ ] Reuse the existing drag preview and activate the target only on pointer-up.
- [ ] Run full tests/build and manually check mouse and touch behavior.
- [ ] Commit with `feat: change shovel to drag interaction`.

### Task 7: Integrated Balance Verification

**Files:**
- Create: `src/battle/balanceSimulation.test.js`
- Modify: `src/config/waves.js`
- Modify: `src/config/enemies.js`

- [ ] Add deterministic simulations asserting wave 30 Boss effective HP remains between 12 and 20 times one normal enemy and stun uptime stays below 25% for a representative six-tower board.
- [ ] Run `npm test` and tune only centralized config values until all invariants pass.
- [ ] Run `npm run build` and a manual checklist covering fresh save, migrated save, all special waves, merit idempotency, difficulty unlock, continued fighting, pool exhaustion, road blocking, and shovel drag.
- [ ] Commit with `test: verify battle progression balance`.
