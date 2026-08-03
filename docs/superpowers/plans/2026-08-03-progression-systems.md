# Progression Systems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add detailed codex entries, transparent dual-pity gacha, differentiated items and advanced characters, and four-slot post-battle shop stock.

**Architecture:** Move reward tables and random selection into pure, injectable modules. Canvas scenes render configurations and dispatch domain actions; save migration from the battle plan persists pity and stock.

**Tech Stack:** Vite 5, ES modules, Canvas 2D, Vitest, localStorage.

## Global Constraints

- All displayed probabilities must equal the weights used by the draw engine.
- Pull 10 guarantees rare-or-better; pull 50 guarantees precious, with early hits resetting matching counters.
- Shop displays up to four unique unowned items and refreshes only after battle settlement.
- Active items require player activation; passive items never expose activation controls.

---

### Task 1: Data-Driven Gacha and Pity

**Files:**
- Create: `src/config/gacha.js`
- Create: `src/meta/gachaEngine.js`
- Create: `src/meta/gachaEngine.test.js`
- Modify: `src/meta/gacha.js`
- Modify: `src/meta/saveData.js`

**Interfaces:**
- Produces: `drawGacha(save, random): DrawResult`, `GACHA_RATES`, `GACHA_REWARDS`.

- [ ] Define rarity rates `common: 0.72`, `rare: 0.23`, `precious: 0.05`; classify unlocked characters, locked characters, items, gold, and merit-neutral currency rewards in one table.
- [ ] Test normal weighted boundaries, rare guarantee on draw 10, precious guarantee on draw 50, early reset semantics, and counter persistence.
- [ ] Implement rarity-first selection, then weighted reward selection. Convert exhausted/duplicate character rewards to gold or character shards and upgrade duplicate items.
- [ ] Render exact rates, every reward category, counters, and recent result history in a scrollable gacha panel.
- [ ] Run focused/full tests and build; commit `feat: add transparent dual-pity gacha`.

### Task 2: Item Identity and New Content

**Files:**
- Modify: `src/config/items.js`
- Modify: `src/battle/battleScene.js`
- Modify: `src/meta/inventory.js`
- Create: `src/config/items.test.js`

**Interfaces:**
- Produces: active effects `fire`, `recruit`, `train`, `reinforce`, `warDrum`; passive buffs `power`, `swift`, `goldpot`, `fortification`, `bossBane`, `resolute`.

- [ ] Add schema tests requiring every active to define cooldown plus cast mode/effect and every passive to define only `buffs`, with unique IDs and descriptions.
- [ ] Add `援军令` (fill empty bar slots), `止战鼓` (short global slow), `工事图` (blocker HP/capacity), `破阵旗` (Boss damage), and `定军心` (stun-duration reduction).
- [ ] Implement active dispatch through a handler map instead of an expanding conditional chain; aggregate passive buffs once on battle entry.
- [ ] Give active/passive inventory cards distinct borders, headings, slot counters, and interaction hints.
- [ ] Run tests/build and manually activate each active item; commit `feat: differentiate active and passive items`.

### Task 3: New Advanced Characters and Words

**Files:**
- Modify: `src/config/units.js`
- Modify: `src/config/words.js`
- Modify: `src/config/codex.js`
- Create: `src/config/words.test.js`

- [ ] Add prefixes `虎` (first-hit burst), `盾` (blocker defense), `火` (burn), `军` (adjacent aura) and word combinations with complete labels, effects, colors, pool classification, and codex metadata.
- [ ] Test that every advanced character participates in at least one prefix or hero/word combination and every combination references defined characters.
- [ ] Implement effects in the existing word scan and tower stat/attack hooks without changing unrelated heroes.
- [ ] Run tests/build and manually form each word; commit `feat: expand advanced character strategies`.

### Task 4: Codex Detail Panels

**Files:**
- Create: `src/meta/codexDetails.js`
- Create: `src/meta/codexDetails.test.js`
- Modify: `src/meta/codexScene.js`
- Modify: `src/config/codex.js`

**Interfaces:**
- Produces: `detailFor(category, key): { title, rows, description, hint }`.

- [ ] Test complete details for every base unit, prefix, hero, item, elite, and Boss configuration.
- [ ] Track cell hitboxes and open a modal for unlocked entries; show only title and acquisition hint for locked entries.
- [ ] Include attack, interval/attacks-per-second, range, attack type, skill, word recipe, enemy multipliers, and item level-one behavior where applicable.
- [ ] Run consistency/full tests and build; commit `feat: add detailed codex attributes`.

### Task 5: Four-Item Battle-Refreshed Shop

**Files:**
- Create: `src/meta/shopStock.js`
- Create: `src/meta/shopStock.test.js`
- Modify: `src/meta/shop.js`
- Modify: `src/battle/battleScene.js`
- Modify: `src/meta/saveData.js`

**Interfaces:**
- Produces: `rollShopStock(ownedIds, random, count = 4)`, `refreshShopAfterBattle(save, random)`.

- [ ] Test uniqueness, exclusion of owned items, fewer-than-four behavior, stable stock between visits, removal after purchase, and refresh only from `gameOver()`.
- [ ] Implement Fisher–Yates selection with injectable random input and persist IDs in `save.shop.stock`.
- [ ] Render only current stock; move upgrades exclusively to inventory and remove random advanced-character purchase from the shop.
- [ ] Run full tests/build and manually verify two shop visits before and after battle; commit `feat: add rotating four-item shop`.

### Task 6: Progression Regression Pass

- [ ] Run `npm test` and `npm run build` with zero failures.
- [ ] Verify pull counters across reload, guarantees at exact boundaries, all listed prizes, active/passive UI, codex modal scrolling, and shop refresh after both defeat and voluntary exit.
- [ ] Commit `test: cover progression systems`.
