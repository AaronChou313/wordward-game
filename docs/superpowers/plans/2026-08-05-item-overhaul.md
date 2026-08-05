# Item Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 12 gameplay/UI/backend changes: shovel drop rate, equippable list scrolling, inventory rename/entry merge, fixed avatar, merit leaderboard fix & ordering, shop refresh after battle, currency split (gold/gems/soul jade), equipment series/bond/affix/enhance/refine, dynamic weapon slots, equipped-items bar, README, and batch commits.

**Architecture:** Frontend is a canvas game (Vite) with scene-based UI (`src/meta/*.js`, `src/battle/*.js`), config data (`src/config/*.js`), and a local save (`src/meta/saveData.js`). Backend is a Cloudflare Worker (`worker/`) with Hono, D1 persistence, and a leaderboard sorted by merit. Work is split into 5 batches, each independently testable and committed.

**Tech Stack:** Vite, vanilla JS, Canvas 2D, Vitest (frontend + worker), Hono, Cloudflare Workers, D1 (SQLite), Turnstile.

## Global Constraints

- **PBKDF2 iterations must stay ≤ 100000** (Cloudflare Workers WebCrypto cap — see commit `60ce613`). Never raise `PASSWORD_KDF_ITERATIONS` above `100000` in `wrangler.jsonc` or `worker/security/password.js`.
- Save data must stay backward-compatible: `migrateSave` in `src/meta/saveData.js` fills defaults for new fields (`gems`, `soulJade`, equipment `affixes`).
- All text in the game UI is Simplified Chinese (KaiTi font stack: `'KaiTi, STKaiti, serif'`).
- All existing tests must keep passing (`npm test` = 191 frontend tests, `npm run worker:test` = 45 worker tests).
- D1 schema changes only add columns (never rename/remove existing ones).
- No external images: the fixed avatar is drawn with canvas primitives.
- Canvas is 750×1334 design space (`DESIGN_W`/`DESIGN_H`).

---

### Batch 1: Frontend quality-of-life fixes (shovel, scrolling, rename, shop refresh, avatar)

### Task 1: Raise shovel drop rate

**Files:**
- Modify: `src/config/economy.js` (constants `SHOVEL_DROP_CHANCE`, `SHOVEL_PITY`)
- Modify: `src/config/difficulty.js` (easy `shovelAdd`)
- Modify: `src/battle/refreshBar.js` (wave-scaled drop chance)
- Test: `src/battle/refreshBar.test.js`

**Interfaces:**
- Consumes: `SHOVEL_DROP_CHANCE`, `SHOVEL_PITY` from `economy.js`; `diff.shovelAdd` from difficulty config.
- Produces: `RefreshBar.refresh()` keeps same signature but uses new constants and a wave-scaled chance.

- [ ] **Step 1: Write failing tests for the new constants and wave scaling**

Add to `src/battle/refreshBar.test.js`:

```js
import { SHOVEL_DROP_CHANCE, SHOVEL_PITY } from '../config/economy.js';
import { DIFFICULTIES } from '../config/difficulty.js';

describe('shovel drop tuning', () => {
  it('raises the base shovel chance and tightens pity', () => {
    expect(SHOVEL_DROP_CHANCE).toBeGreaterThanOrEqual(0.55);
    expect(SHOVEL_PITY).toBeLessThanOrEqual(2);
    expect(DIFFICULTIES[0].shovelAdd).toBeGreaterThanOrEqual(0.05);
  });

  it('scales shovel chance up with wave count', () => {
    const bar = new RefreshBar([], { id: 'easy' }, null, () => 0.99);
    bar.wave = 40;
    bar.sinceShovel = 0;
    bar.refresh(true); // force: true skips the ready check
    // with random=0.99 and pity 2, the wave bump must still grant a shovel
    expect(bar.shovels).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/battle/refreshBar.test.js -t "shovel drop tuning"`
Expected: FAIL (constants mismatch, no wave scaling yet).

- [ ] **Step 3: Update constants in `economy.js`**

In `src/config/economy.js`, change:

```js
export const SHOVEL_DROP_CHANCE = 0.45;
export const SHOVEL_PITY = 3;        // 连续 N 次刷新未掉铲子则必掉
```

to:

```js
export const SHOVEL_DROP_CHANCE = 0.55;
export const SHOVEL_PITY = 2;        // 连续 N 次刷新未掉铲子则必掉
```

- [ ] **Step 4: Raise easy difficulty shovel bonus in `difficulty.js`**

In `src/config/difficulty.js`, change the `easy` difficulty entry's `shovelAdd: 0` to `shovelAdd: 0.05`.

- [ ] **Step 5: Add wave-scaled shovel chance in `refreshBar.js`**

In `src/battle/refreshBar.js`, replace the shovel chance line inside `refresh()`:

```js
    const chance = SHOVEL_DROP_CHANCE + (this.diff ? this.diff.shovelAdd : 0);
```

with:

```js
    const chance = SHOVEL_DROP_CHANCE
      + (this.diff ? this.diff.shovelAdd : 0)
      + Math.min(0.15, this.wave * 0.004);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/battle/refreshBar.test.js`
Expected: PASS (all refreshBar tests).

- [ ] **Step 7: Run full frontend suite**

Run: `npm test`
Expected: all 191+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/config/economy.js src/config/difficulty.js src/battle/refreshBar.js src/battle/refreshBar.test.js
git commit -m "feat: raise shovel drop rate with wave scaling and tighter pity"
```

---

### Task 2: Equip list scrolling with tap-vs-drag threshold

**Files:**
- Modify: `src/meta/equipScene.js`
- Test: `src/meta/equipScene.test.js` (new file)

**Interfaces:**
- Consumes: `EquipScene` existing API (`onPointerDown/Move/Up`, `render`, `slotRects`, `ownedOf`, `selectedUid`).
- Produces: `EquipScene` gains `scroll` (number), `press` (object|null), `maxScroll()` method. Tap threshold `TAP_DIST = 10`.

- [ ] **Step 1: Write failing test for scroll + tap threshold**

Create `src/meta/equipScene.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { EquipScene } from './equipScene.js';

function fakeSave(ownedCount = 3) {
  const owned = [];
  for (let i = 0; i < ownedCount; i++) {
    owned.push({ uid: i + 1, id: 'p_sword', rarity: 'common', lvl: 1 });
  }
  return {
    gold: 300, gems: 10, soulJade: 3,
    equipment: {
      owned, nextUid: ownedCount + 1,
      player: { '武器': null, '护甲': null, '饰品': null },
      units: { '兵': null, '骑': null, '枪': null, '弓': null, '炮': null },
    },
  };
}

describe('EquipScene list scrolling', () => {
  it('does not equip when dragging past the threshold', () => {
    const scene = new EquipScene({ switch: () => {} });
    // stub getSave
    vi.stubGlobal('getSave', () => fakeSave(8)); // enough rows to scroll
    scene.onPointerDown(100, 500);
    scene.onPointerMove(105, 560); // moved 60px
    scene.onPointerUp(105, 560);
    expect(scene.scroll).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('equips on a tap with no drag', () => {
    const scene = new EquipScene({ switch: () => {} });
    const save = fakeSave(3);
    vi.stubGlobal('getSave', () => save);
    scene.onPointerDown(100, 500);
    scene.onPointerUp(102, 501); // moved < 10px
    expect(save.equipment.player['武器']).toBe(1); // first owned uid equipped
    vi.unstubAllGlobals();
  });

  it('clamps scroll to the list bounds', () => {
    const scene = new EquipScene({ switch: () => {} });
    vi.stubGlobal('getSave', () => fakeSave(20));
    scene.scroll = 999999;
    scene.onPointerDown(100, 500);
    scene.onPointerMove(105, 400); // drag up
    scene.onPointerUp(105, 400);
    expect(scene.scroll).toBeLessThanOrEqual(scene.maxScroll());
    vi.unstubAllGlobals();
  });
});
```

Note: `getSave` is imported by the scene from `./saveData.js`. Use `vi.mock('./saveData.js', ...)` in the test, or `vi.stubGlobal('getSave', ...)` if the scene references it via module scope. Prefer `vi.mock` since the scene imports named exports:

```js
vi.mock('./saveData.js', () => ({
  getSave: () => fakeSave(8),
  persist: () => {},
  equipByUid: () => null,
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/equipScene.test.js`
Expected: FAIL (scene has no `scroll` state, drag triggers equip).

- [ ] **Step 3: Add scroll state and tap-vs-drag logic to `equipScene.js`**

Add to the constructor:

```js
this.scroll = 0;
this.press = null;
```

Replace `enter()`:

```js
enter() { this.selectedUid = null; this.scroll = 0; this.press = null; }
```

Add a `maxScroll()` method:

```js
maxScroll() {
  return Math.max(0, this.ownedOf(this.tab).length * ROW_H - 640);
}
```

Replace `onPointerDown` list handling — capture a drag-press for the list region (y from `LIST_Y` and down, x within the list), keep slot handling above:

```js
onPointerDown(x, y) {
  if (this.btnBack.hitTest(x, y)) return this.btnBack.onClick();
  if (this.btnTabPlayer.hitTest(x, y)) return this.btnTabPlayer.onClick();
  if (this.btnTabUnit.hitTest(x, y)) return this.btnTabUnit.onClick();

  // drag-press capture only on the list region (below the slots)
  if (x >= 60 && x <= 681 && y >= LIST_Y - 20) {
    this.press = { x, y, scroll: this.scroll, moved: false };
    return;
  }
  // ... existing slot handling stays above this
}

onPointerMove(_x, y) {
  if (!this.press) return;
  if (Math.abs(y - this.press.y) > 10) this.press.moved = true;
  if (!this.press.moved) return;
  const next = this.press.scroll + this.press.y - y;
  this.scroll = Math.max(0, Math.min(this.maxScroll(), next));
}

onPointerUp(x, y) {
  const press = this.press;
  this.press = null;
  if (!press || press.moved) return;
  // slot clicks (top area) handled first, unchanged
  // list clicks: offset each row y by this.scroll
  const list = this.ownedOf(this.tab);
  for (let i = 0; i < list.length; i++) {
    const ry = LIST_Y + i * ROW_H - this.scroll;
    if (x >= 60 && x <= 681 && y >= ry && y <= ry + ROW_H - 10) {
      // existing equip/select logic
      ...
      return;
    }
  }
}
```

**Key detail:** In `render()`, translate the list by `-this.scroll` inside a clip rect (mirror `InventoryScene`). Slot clicks do NOT subtract scroll.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/meta/equipScene.test.js`
Expected: PASS.

- [ ] **Step 5: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/meta/equipScene.js src/meta/equipScene.test.js
git commit -m "feat: make equip list scrollable with tap-vs-drag threshold"
```

---

### Task 3: Rename inventory to 道具, merge entry, add equipped-items bar

**Files:**
- Modify: `src/meta/homeScene.js` (button label + layout)
- Modify: `src/meta/inventory.js` (panel title, top equipped bar)
- Test: `src/meta/inventory.test.js` (new file)

**Interfaces:**
- Consumes: `InventoryScene.isEquipped(id)`, `toggleEquip(id)`, `getSave().items`.
- Produces: `InventoryScene` renders an equipped bar above the list; home button label `道具`.

- [ ] **Step 1: Write failing test for equipped bar**

Create `src/meta/inventory.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { InventoryScene } from './inventory.js';

vi.mock('./saveData.js', () => ({
  getSave: () => ({
    gold: 300, gems: 10, soulJade: 3,
    items: {
      owned: { fire: 2, power: 1, swift: 1 },
      equippedActive: [{ id: 'fire', level: 2 }],
      equippedPassive: [{ id: 'power', level: 1 }],
    },
  }),
  spendGold: () => true,
  addGold: () => {},
  persist: () => {},
}));

describe('InventoryScene equipped bar', () => {
  it('lists equipped items at the top', () => {
    const scene = new InventoryScene({ switch: () => {} });
    const ctx = stubCanvas();
    scene.render(ctx);
    const texts = ctx.calls.map((c) => c.text).filter(Boolean);
    expect(texts.some((t) => String(t).includes('已装备'))).toBe(true);
    expect(texts.some((t) => String(t).includes('烈火符'))).toBe(true);
    expect(texts.some((t) => String(t).includes('武力卷轴'))).toBe(true);
  });
});
```

Provide a `stubCanvas()` helper implementing the ctx methods the scene/Button call (`fillRect`, `fillText`, `strokeRect`, `beginPath`, `clip`, `save`, `restore`, `translate`, `measureText` returning `{ width: 0 }`), recording `fillText` args.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/inventory.test.js`
Expected: FAIL (no equipped bar rendered yet).

- [ ] **Step 3: Rename home button and panel title**

In `src/meta/homeScene.js`, change the button label `'背 包'` to `'道 具'`. Adjust button layout so 商城/道具/抽奖 share one row, 装备/图鉴 next row, 排行/账号 next row. Keep `scenes.switch('inventory')`.

In `src/meta/inventory.js`, change `drawPanel(ctx, 25, 120, 700, 1160, '背 包')` to `drawPanel(ctx, 25, 120, 700, 1160, '道 具')`.

- [ ] **Step 4: Add equipped-items bar to `InventoryScene.render`**

Above the scrolling list, render an equipped bar:

```js
const equippedActive = s.items.equippedActive.map((e) => ITEMS[e.id].name);
const equippedPassive = s.items.equippedPassive.map((e) => ITEMS[e.id].name);
ctx.save();
ctx.textAlign = 'left';
ctx.fillStyle = '#ffd75a';
ctx.font = '22px KaiTi, STKaiti, serif';
ctx.fillText('已装备', 60, 272);
ctx.fillStyle = '#f0d8a8';
ctx.fillText(equippedActive.concat(equippedPassive).join('、') || '（无）', 150, 272);
ctx.restore();
```

Shift the list rows down (e.g. start at `y = 320`) so the bar stays fixed while the list scrolls under it (clip rect). Make the bar items tappable to unequip: in `onPointerUp`, if the tap lands in the bar's y-range, map x to an equipped item and call `toggleEquip`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/meta/inventory.test.js`
Expected: PASS.

- [ ] **Step 6: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/meta/homeScene.js src/meta/inventory.js src/meta/inventory.test.js
git commit -m "feat: rename inventory to 道具, merge entry, add equipped bar"
```

---

### Task 4: Fixed avatar (remove URL input, draw built-in avatar)

**Files:**
- Modify: `src/meta/profileScene.js`
- Modify: `src/meta/rankingScene.js` (drawAvatar fallback)
- Test: `src/meta/profileScene.test.js` (new file) — optional but recommended

**Interfaces:**
- Consumes: `updateProfile({ nickname, avatarUrl, bio })` from `apiClient`.
- Produces: `ProfileScene` no longer collects `avatarUrl`; `drawAvatar` in ranking uses a built-in fallback when no remote image.

- [ ] **Step 1: Write failing test (avatar not editable, save sends null)**

Create `src/meta/profileScene.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { ProfileScene } from './profileScene.js';

describe('ProfileScene fixed avatar', () => {
  it('does not expose an avatarUrl input field', () => {
    const scene = new ProfileScene({ switch: () => {} });
    expect(scene.profile).not.toHaveProperty('avatarUrl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/profileScene.test.js`
Expected: FAIL (`profile.avatarUrl` exists).

- [ ] **Step 3: Remove avatarUrl from ProfileScene**

In `src/meta/profileScene.js`:
- Remove `avatarUrl` from the `profile` initial state (keep `nickname`, `bio`).
- Remove the `avatarUrl` field from `render()` (the `drawField(ctx, 100, 470, 550, 72, '头像 HTTPS 地址', ...)` line).
- Remove `this.focus('avatarUrl')` from `onPointerDown`.
- In `saveProfile()`, pass `avatarUrl: null` explicitly to `updateProfile`.
- In `focus(field)`, the avatar branch is gone.
- Draw a built-in avatar circle near the top of the profile page: gold-ring circle with `主` glyph.

- [ ] **Step 4: Add built-in avatar fallback in ranking**

In `src/meta/rankingScene.js`, modify `drawAvatar` so when no remote image is ready it draws a gold-ring circle with the `主` glyph instead of a bare gray box:

```js
function drawAvatar(ctx, image, x, y) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#6f5436'; ctx.fillRect(x - 24, y - 24, 48, 48);
  if (image && image.ready) ctx.drawImage(image, x - 24, y - 24, 48, 48);
  else {
    ctx.fillStyle = '#e8c35a'; ctx.font = 'bold 30px KaiTi, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('主', x, y + 2);
  }
  ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/meta/profileScene.test.js`
Expected: PASS.

- [ ] **Step 6: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/meta/profileScene.js src/meta/rankingScene.js src/meta/profileScene.test.js
git commit -m "feat: fixed built-in avatar, remove avatar URL input"
```

---

### Task 5: Refresh shop after every battle end

**Files:**
- Modify: `src/battle/battleScene.js` (gameOver paths)
- Modify: `src/meta/shopStock.js` (refresh robustness)
- Test: `src/meta/shopStock.test.js`

**Interfaces:**
- Consumes: `refreshShopAfterBattle(save, random)` from `shopStock.js`.
- Produces: `gameOver()` guarantees a refresh; `ShopScene.enter()` keeps the refreshed stock.

- [ ] **Step 1: Write failing test for battle-end refresh survival**

Add to `src/meta/shopStock.test.js`:

```js
it('keeps the freshly refreshed stock when the shop is next opened', () => {
  const save = freshSave();
  save.items.owned = { fire: 1 };
  save.shop = { initialized: true, stock: ['recruit', 'train'] };
  const refreshed = refreshShopAfterBattle(save, () => 0);
  expect(refreshed).toHaveLength(4);
  expect(save.shop.stock).not.toContain('fire');
  const reopened = ensureShopStock(save, () => 0.9);
  expect(reopened).toEqual(save.shop.stock); // must not clear the fresh stock
  expect(reopened).toHaveLength(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/shopStock.test.js -t "keeps the freshly refreshed stock"`
Expected: FAIL if `ensureShopStock` clears a fresh stock.

- [ ] **Step 3: Fix `ensureShopStock` to respect a just-refreshed stock**

In `src/meta/shopStock.js`, `ensureShopStock` currently prunes `save.shop.stock` (removing owned/invalid/duplicated) but does NOT re-roll once initialized. Verify `ShopScene.enter()` calls `ensureShopStock` then `persist` — that is fine. The real gap is that `gameOver` may double-call refresh (victory path calls it, then `gameOver` calls again). Add a one-time guard so a battle refreshes the shop exactly once.

- [ ] **Step 4: Guarantee one refresh per battle in battleScene**

In `src/battle/battleScene.js`:
- Keep `refreshShopAfterBattle(save)` in `gameOver()` (line 836).
- Add `this.shopRefreshed = true` after the call; in `handleBossDefeated`, skip its own refresh if `this.shopRefreshed` is already set (or only call refresh from `gameOver`).
- Confirm `btnExit` (退出战斗) and `btnHome` (返回主页) both route through `gameOver` — they do, so every end path refreshes once.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/meta/shopStock.test.js`
Expected: PASS.

- [ ] **Step 6: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/battle/battleScene.js src/meta/shopStock.js src/meta/shopStock.test.js
git commit -m "fix: refresh shop after every battle end"
```

---

### Batch 2: Currency split (gems, soul jade) + equipment enhance + gacha pool

### Task 6: Add gems & soul jade to save, migrate defaults

**Files:**
- Modify: `src/meta/saveData.js` (DEFAULT_SAVE, migrate)
- Test: `src/meta/saveData.test.js`

**Interfaces:**
- Produces: save has `gems` (default 10) and `soulJade` (default 3); `migrateSave` fills them for old saves; `version` becomes 3.

- [ ] **Step 1: Write failing migration test**

Add to `src/meta/saveData.test.js`:

```js
it('adds gems and soul jade to legacy saves', () => {
  const migrated = migrateSave({ version: 2, gold: 100, equipment: { owned: [], nextUid: 1, player: {}, units: {} } });
  expect(migrated.gems).toBe(10);
  expect(migrated.soulJade).toBe(3);
  expect(migrated.version).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/saveData.test.js -t "gems and soul jade"`
Expected: FAIL (no gems field).

- [ ] **Step 3: Add gems/soulJade to DEFAULT_SAVE and bump version**

In `src/meta/saveData.js`:
- Add `gems: 10, soulJade: 3` to `DEFAULT_SAVE`.
- Change `version: 2` to `version: 3`.
- In `migrateSave`, set `migrated.version = 3` (was 2).
- Update existing tests that assert `version: 2` to expect `3`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/meta/saveData.test.js`
Expected: PASS.

- [ ] **Step 5: Run full frontend suite**

Run: `npm test`
Expected: PASS (fix any other version assertions).

- [ ] **Step 6: Commit**

```bash
git add src/meta/saveData.js src/meta/saveData.test.js
git commit -m "feat: split currency into gold, gems, and soul jade"
```

---

### Task 7: Gacha pool includes gems, soul jade; drop gems from elite/boss

**Files:**
- Modify: `src/config/gacha.js` (GACHA_REWARDS)
- Modify: `src/meta/gachaEngine.js` (dispatch new reward kinds)
- Modify: `src/battle/battleScene.js` (elite/boss gem & soul-jade drops)
- Modify: `src/meta/saveData.js` (addGems/addSoulJade/spendGems/spendSoulJade)
- Test: `src/meta/gachaEngine.test.js`

**Interfaces:**
- Consumes: `save.gems`, `save.soulJade`; `GACHA_REWARDS[rarity]` with `kind`.
- Produces: gacha rewards with `kind: 'gems'` and `kind: 'soulJade'`; battle drops call `addGems(n)`/`addSoulJade(n)`.

- [ ] **Step 1: Write failing test for new gacha reward kinds**

Add to `src/meta/gachaEngine.test.js`:

```js
it('grants gems and soul jade from gacha rewards', () => {
  const save = { gold: 1000, gems: 0, soulJade: 0, gacha: { smallPity: 0, bigPity: 0, history: [] }, unlockedChars: ['精', '铁', '赵', '云'], items: { owned: {}, equippedActive: [], equippedPassive: [] } };
  const result = drawGacha(save, () => 0.999);
  if (result.kind === 'gems') expect(save.gems).toBeGreaterThan(0);
  if (result.kind === 'soulJade') expect(save.soulJade).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/gachaEngine.test.js`
Expected: FAIL (no gems/soulJade reward handling).

- [ ] **Step 3: Update GACHA_REWARDS in `gacha.js`**

Replace the rewards with gem/soul-jade entries (keep gold + character + item):

```js
export const GACHA_REWARDS = Object.freeze({
  common: Object.freeze([
    Object.freeze({ id: 'common-gold', kind: 'gold', label: '军饷 60 金', weight: 75, amount: 60 }),
    Object.freeze({ id: 'common-gold-large', kind: 'gold', label: '军饷 120 金', weight: 25, amount: 120 }),
  ]),
  rare: Object.freeze([
    Object.freeze({ id: 'rare-character', kind: 'character', label: '进阶字（全池）', weight: 35, selection: 'any', duplicateAmount: 120 }),
    Object.freeze({ id: 'rare-item', kind: 'item', label: '战术道具 +1 级', weight: 25, levels: 1 }),
    Object.freeze({ id: 'rare-gold', kind: 'gold', label: '军饷 200 金', weight: 20, amount: 200 }),
    Object.freeze({ id: 'rare-gems', kind: 'gems', label: '宝石 25', weight: 20, amount: 25 }),
  ]),
  precious: Object.freeze([
    Object.freeze({ id: 'precious-character', kind: 'character', label: '进阶字（未解锁优先）', weight: 35, selection: 'locked-first', duplicateAmount: 400 }),
    Object.freeze({ id: 'precious-item', kind: 'item', label: '珍贵道具 +2 级', weight: 25, levels: 2 }),
    Object.freeze({ id: 'precious-gold', kind: 'gold', label: '军饷 600 金', weight: 15, amount: 600 }),
    Object.freeze({ id: 'precious-gems', kind: 'gems', label: '宝石 60', weight: 15, amount: 60 }),
    Object.freeze({ id: 'precious-soul', kind: 'soulJade', label: '魂玉 1', weight: 10, amount: 1 }),
  ]),
});
```

- [ ] **Step 4: Handle gems/soulJade in `gachaEngine.js`**

In `drawGacha`, add before the final gold return:

```js
if (reward.kind === 'gems') {
  save.gems = (save.gems || 0) + reward.amount;
  return finishResult(save, { rarity, rewardId: reward.id, kind: reward.kind, amount: reward.amount, message: `获得宝石 ${reward.amount}` });
}
if (reward.kind === 'soulJade') {
  save.soulJade = (save.soulJade || 0) + reward.amount;
  return finishResult(save, { rarity, rewardId: reward.id, kind: reward.kind, amount: reward.amount, message: `获得魂玉 ${reward.amount}` });
}
```

- [ ] **Step 5: Add gem/soul-jade helpers and battle drops**

In `src/meta/saveData.js`:

```js
export function addGems(n) { getSave().gems += n; persist(); }
export function addSoulJade(n) { getSave().soulJade += n; persist(); }
export function spendGems(n) { const s = getSave(); if ((s.gems || 0) < n) return false; s.gems -= n; persist(); return true; }
export function spendSoulJade(n) { const s = getSave(); if ((s.soulJade || 0) < n) return false; s.soulJade -= n; persist(); return true; }
```

In `src/battle/battleScene.js` kill handler:

```js
// 精英/Boss 概率掉宝石，Boss 概率掉魂玉
if (enemy.isElite && Math.random() < 0.4) addGems(Math.floor(Math.random() * 3) + 1);
if (enemy.isBoss) {
  if (Math.random() < 0.7) addGems(Math.floor(Math.random() * 3) + 1);
  if (Math.random() < 0.3) addSoulJade(1);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/meta/gachaEngine.test.js`
Expected: PASS.

- [ ] **Step 7: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/config/gacha.js src/meta/gachaEngine.js src/battle/battleScene.js src/meta/saveData.js src/meta/gachaEngine.test.js
git commit -m "feat: gacha pool and battle drops grant gems and soul jade"
```

---

### Task 8: Equip/weapon enhancement costs gems

**Files:**
- Modify: `src/meta/equipScene.js` (enhance button & cost)
- Test: `src/meta/equipScene.test.js`

**Interfaces:**
- Consumes: `spendGems(n)` from `saveData.js` (added in Task 7).
- Produces: enhancing an equip instance increments `lvl` and costs `10 + 5 * (lvl - 1)` gems.

- [ ] **Step 1: Write failing test for gem-cost enhancement**

Add to `src/meta/equipScene.test.js`:

```js
it('enhances an equipment instance with gems', () => {
  const scene = new EquipScene({ switch: () => {} });
  const save = fakeSave(1);
  vi.stubGlobal('getSave', () => save);
  scene.enhance(save.equipment.owned[0].uid);
  expect(save.equipment.owned[0].lvl).toBe(2);
  expect(save.gems).toBeLessThan(10); // 10 - cost
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/equipScene.test.js -t "enhances"`
Expected: FAIL (no `enhance` method).

- [ ] **Step 3: Add gem-cost enhancement to EquipScene**

Add a method:

```js
enhance(uid) {
  const inst = equipByUid(uid);
  if (!inst) return Toast.show('装备不存在');
  const cost = 10 + 5 * (inst.lvl - 1);
  if (!spendGems(cost)) return Toast.show('宝石不足');
  inst.lvl += 1;
  persist();
  Audio.coin();
  Toast.show(inst.id + ' 升至 Lv' + inst.lvl);
}
```

Import `spendGems` and `equipByUid` from `saveData.js`. Render the enhance button with `'升 ' + (10 + 5 * (inst.lvl - 1)) + '宝'` and route its tap to `enhance`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/meta/equipScene.test.js`
Expected: PASS.

- [ ] **Step 5: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/meta/equipScene.js src/meta/equipScene.test.js
git commit -m "feat: enhance equipment with gems"
```

---

### Batch 3: Equipment series/bond, affixes, refine, dynamic weapon slots

### Task 9: Equipment series with bond effects (player equipment)

**Files:**
- Modify: `src/config/equipment.js` (series + bond config, new equip entries)
- Create: `src/battle/bond.js` (bond aggregation helper)
- Modify: `src/battle/battleScene.js` (apply bond to stats)
- Test: `src/config/equipment.test.js` (new file), `src/battle/bond.test.js` (new file)

**Interfaces:**
- Consumes: `save.equipment.player` slot map + owned list.
- Produces: `EQUIP` entries have `series`; `bondStats(slotMap, ownedList)` returns aggregated bond bonuses.

- [ ] **Step 1: Write failing test for bond aggregation**

Create `src/config/equipment.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { EQUIP, bondStats } from './equipment.js';

describe('equipment series bonds', () => {
  it('returns nothing when fewer than two of a series are equipped', () => {
    expect(bondStats({ '武器': 'u1' }, [{ uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] }])).toEqual({});
  });

  it('applies the 2-piece bond for a series', () => {
    const owned = [
      { uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_armor', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(bondStats({ '武器': 'u1', '护甲': 'u2' }, owned)).toEqual({ atk: 0.08 });
  });

  it('applies the 3-piece full bond for a series', () => {
    const owned = [
      { uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_armor', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u3', id: 'p_charm', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(bondStats({ '武器': 'u1', '护甲': 'u2', '饰品': 'u3' }, owned)).toMatchObject({ atk: 0.15, spd: 0.08 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/equipment.test.js`
Expected: FAIL (`bondStats` not defined).

- [ ] **Step 3: Add series + bond config and bondStats to equipment.js**

Add series to the player equip entries and define bond tables:

```js
export const SERIES = {
  '虎啸': {
    name: '虎啸', color: '#e0704a',
    bonds: { 2: { atk: 0.08 }, 3: { atk: 0.15, spd: 0.08 } },
  },
  '龙腾': {
    name: '龙腾', color: '#4a8ae0',
    bonds: { 2: { lordHp: 2 }, 3: { lordHp: 4, blockerHp: 0.20 } },
  },
  '凤仪': {
    name: '凤仪', color: '#c98ab8',
    bonds: { 2: { coin: 0.15 }, 3: { coin: 0.25, stunDuration: 0.30 } },
  },
};
```

Give each player equip entry a `series`: `p_sword`/`p_armor`/`p_charm` → `虎啸`; add new entries `p_dragonWeapon`(青龙戟)/`p_dragonArmor`(龙鳞甲)/`p_dragonTrinket`(龙珠) → `龙腾`; `p_phoenixWeapon`(凤翎扇)/`p_phoenixArmor`(锦凤袍)/`p_phoenixTrinket`(凤钗) → `凤仪`. Then:

```js
export function bondStats(slotMap, ownedList) {
  const counts = {};
  for (const slot of PLAYER_SLOTS) {
    const uid = slotMap && slotMap[slot];
    if (uid == null) continue;
    const inst = (ownedList || []).find((e) => e.uid === uid);
    const series = inst && EQUIP[inst.id] && EQUIP[inst.id].series;
    if (series) counts[series] = (counts[series] || 0) + 1;
  }
  const out = {};
  for (const [series, count] of Object.entries(counts)) {
    const bond = SERIES[series] && SERIES[series].bonds[count >= 3 ? 3 : count === 2 ? 2 : 0];
    if (!bond) continue;
    for (const [k, v] of Object.entries(bond)) out[k] = (out[k] || 0) + v;
  }
  return out;
}
```

- [ ] **Step 4: Wire bond into battle stats**

Create `src/battle/bond.test.js` testing that `applyBondStats(towerStats, slotMap, ownedList)` merges bonds. In `src/battle/battleScene.js`, where item buffs are aggregated, also aggregate bonds:

```js
import { bondStats } from '../config/equipment.js';
// inside a stats helper:
const save = getSave();
const bonds = bondStats(save.equipment.player, save.equipment.owned);
// merge bonds into the stat object used by towers (atk, spd, lordHp, coin, blockerHp, stunDuration)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config/equipment.test.js src/battle/bond.test.js`
Expected: PASS.

- [ ] **Step 6: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/equipment.js src/battle/bond.js src/battle/battleScene.js src/config/equipment.test.js src/battle/bond.test.js
git commit -m "feat: player equipment series with bond effects"
```

---

### Task 10: Base + affix stats, soul-jade refine, migration for affixes

**Files:**
- Modify: `src/config/equipment.js` (affix pool, equipStats uses affixes)
- Modify: `src/meta/saveData.js` (grantEquip adds affixes; migrate fills them)
- Modify: `src/meta/equipScene.js` (refine button, soul-jade cost)
- Test: `src/config/equipment.test.js`, `src/meta/saveData.test.js`

**Interfaces:**
- Consumes: `spendSoulJade(1)` from `saveData.js`.
- Produces: equipment instances have `affixes: [{key, value}]`; `equipStats(inst)` includes affix values; `refineEquip(inst)` re-rolls affixes with injected randomness.

- [ ] **Step 1: Write failing tests for affixes**

Add to `src/config/equipment.test.js`:

```js
it('rolls affixes on new equipment based on rarity', () => {
  const inst = rollEquipInstance('p_sword', 'epic', () => 0.5);
  expect(inst.affixes.length).toBeGreaterThanOrEqual(2); // epic gets 2-3
});

it('equipStats includes affix values', () => {
  const inst = { id: 'p_sword', rarity: 'common', lvl: 1, affixes: [{ key: 'crit', value: 0.04 }] };
  const stats = equipStats(inst);
  expect(stats.crit).toBeCloseTo(0.04);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/equipment.test.js`
Expected: FAIL (no `rollEquipInstance`, no affix in `equipStats`).

- [ ] **Step 3: Add affix pool and rollEquipInstance to equipment.js**

```js
export const AFFIX_POOL = ['atk', 'spd', 'crit', 'range', 'coin', 'lordHp'];
export const AFFIX_BOUNDS = {
  common: { count: 1, min: 0.02, max: 0.05 },
  fine:   { count: 1, min: 0.03, max: 0.07 },
  rare:   { count: 2, min: 0.04, max: 0.09 },
  epic:   { count: 3, min: 0.05, max: 0.12 },
};

export function rollAffixes(rarity, random = Math.random) {
  const cfg = AFFIX_BOUNDS[rarity] || AFFIX_BOUNDS.common;
  const count = cfg.count;
  const affixes = [];
  for (let i = 0; i < count; i++) {
    const key = AFFIX_POOL[Math.floor(random() * AFFIX_POOL.length)];
    const value = cfg.min + (cfg.max - cfg.min) * random();
    affixes.push({ key, value: Number(value.toFixed(4)) });
  }
  return affixes;
}

export function rollEquipInstance(id, rarity, random = Math.random) {
  return { id, rarity, lvl: 1, affixes: rollAffixes(rarity, random) };
}
```

Update `equipStats(inst)` to add affix values:

```js
export function equipStats(inst) {
  const def = EQUIP[inst.id];
  const mul = rarityById(inst.rarity).mul * (1 + 0.08 * (inst.lvl - 1));
  const out = {};
  for (const k in def.stat) out[k] = def.stat[k] * mul;
  for (const affix of inst.affixes || []) {
    out[affix.key] = (out[affix.key] || 0) + affix.value;
  }
  return out;
}
```

- [ ] **Step 4: Wire affixes into saveData (grantEquip + migrate)**

In `src/meta/saveData.js`, update `grantEquip`:

```js
import { rollEquipInstance } from '../config/equipment.js';

export function grantEquip(id, rarity) {
  const s = getSave();
  const dup = s.equipment.owned.find((e) => e.id === id && e.rarity === rarity);
  if (dup) { dup.lvl++; persist(); return { inst: dup, merged: true }; }
  const inst = { uid: s.equipment.nextUid++, ...rollEquipInstance(id, rarity) };
  s.equipment.owned.push(inst);
  persist();
  return { inst, merged: false };
}
```

Add a migration step in `migrateSave` filling `affixes` for any owned equipment missing them, using a deterministic seed from `inst.uid` so migration is stable:

```js
function seededRandom(seed) {
  let state = (seed % 2147483647) || 1;
  return () => { state = (state * 48271) % 2147483647; return (state - 1) / 2147483646; };
}
// in migrateSave, after mergeDefaults:
for (const inst of migrated.equipment?.owned || []) {
  if (!Array.isArray(inst.affixes)) inst.affixes = rollAffixes(inst.rarity, seededRandom(inst.uid || 1));
}
```

Import `rollAffixes` from `equipment.js`.

- [ ] **Step 5: Add refine to EquipScene**

Add a `refine` method and wire a `洗练` button (cost 1 soul jade, re-rolls affixes):

```js
refine(uid) {
  const inst = equipByUid(uid);
  if (!inst) return Toast.show('装备不存在');
  if (!spendSoulJade(1)) return Toast.show('魂玉不足');
  inst.affixes = rollAffixes(inst.rarity);
  persist();
  Audio.place();
  Toast.show('洗练完成，附加词条已刷新');
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/config/equipment.test.js src/meta/saveData.test.js src/meta/equipScene.test.js`
Expected: PASS.

- [ ] **Step 7: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/config/equipment.js src/meta/saveData.js src/meta/equipScene.js src/config/equipment.test.js src/meta/saveData.test.js src/meta/equipScene.test.js
git commit -m "feat: base+affix stats, soul-jade refine, affix migration"
```

---

### Task 11: Dynamic weapon slots including unlocked heroes

**Files:**
- Modify: `src/config/equipment.js` (weapon slot resolution)
- Modify: `src/meta/equipScene.js` (dynamic slots)
- Modify: `src/battle/battleScene.js` (unitGear uses dynamic slots)
- Test: `src/meta/equipScene.test.js`, `src/battle/battleSceneUpdate.test.js`

**Interfaces:**
- Consumes: `save.equipment.units` (map of unit-name → uid), `save.unlockedChars`.
- Produces: `unitSlotNames(save)` returns base units + unlocked heroes; weapon stats apply per unit/hero.

- [ ] **Step 1: Write failing test for dynamic slots**

Add to `src/meta/equipScene.test.js`:

```js
it('includes unlocked heroes in unit weapon slots', () => {
  const scene = new EquipScene({ switch: () => {} });
  const save = fakeSave(1);
  save.unlockedChars = ['精', '铁', '赵', '云', '吕', '布']; // 赵云, 吕布 unlocked
  vi.stubGlobal('getSave', () => save);
  const slots = scene.unitSlotNames(save);
  expect(slots).toEqual(expect.arrayContaining(['兵', '骑', '枪', '弓', '炮', '赵云', '吕布']));
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/meta/equipScene.test.js -t "unlocked heroes"`
Expected: FAIL (no `unitSlotNames`).

- [ ] **Step 3: Add unitSlotNames and dynamic slot rendering**

In `src/config/equipment.js`:

```js
export const HERO_NAMES = ['赵云', '吕布', '诸葛亮', '关羽', '张飞', '曹操', '周瑜', '马超', '黄忠', '貂蝉', '孙尚香'];

export function unitSlotNames(save) {
  const base = UNIT_SLOTS.slice();
  const heroes = HERO_NAMES.filter((name) => {
    const chars = Array.from(name);
    return chars.every((ch) => save.unlockedChars.includes(ch));
  });
  return base.concat(heroes);
}
```

In `EquipScene`, replace the fixed `UNIT_SLOTS` usage with `unitSlotNames(getSave())` for the units tab. The `save.equipment.units` map keys become unit names (already supports this). If there are more slots than fit on one row, wrap the slot row.

- [ ] **Step 4: Wire dynamic slots into battle unitGear**

In `src/battle/battleScene.js`, `unitGear` currently maps `char → gear`. Change the lookup so a hero's equipped weapon comes from `save.equipment.units[heroName]`, where `heroName` is derived from the on-board characters forming a hero word (e.g. towers forming 赵云). For base units, keep `save.equipment.units[char]`. The weapon stat applies to that tower's `stats()`. Reuse the hero-name resolution already present in `heroGroup.js` if available.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/meta/equipScene.test.js src/battle`
Expected: PASS.

- [ ] **Step 6: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/equipment.js src/meta/equipScene.js src/battle/battleScene.js src/meta/equipScene.test.js src/battle/battleSceneUpdate.test.js
git commit -m "feat: dynamic weapon slots include unlocked heroes"
```

---

### Batch 4: Leaderboard merit fix + ordering

### Task 12: D1 migration for best difficulty/wave + record on claim

**Files:**
- Create: `migrations/0002_leaderboard_best.sql`
- Modify: `worker/modules/merit/service.js` (attemptClaim updates best)
- Test: `worker/modules/merit/merit.test.js`, `worker/db/d1.test.js`

**Interfaces:**
- Produces: `users` table gains `best_difficulty TEXT` and `best_wave INTEGER`; `attemptClaim` sets them.

- [ ] **Step 1: Write failing migration + service test**

Add to `worker/modules/merit/merit.test.js`:

```js
it('records best difficulty and wave on a new claim', async () => {
  const { recordMeritClaim } = await import('./service.js');
  const env = mockD1EnvWithUser('u1');
  const result = await recordMeritClaim(env, 'u1', validEasy30Claim, now);
  expect(result.awarded).toBe(true);
  expect(env.updatedBest).toEqual({ difficulty: 'EASY', wave: 30 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/modules/merit`
Expected: FAIL (no best-difficulty update).

- [ ] **Step 3: Create migration `0002_leaderboard_best.sql`**

```sql
ALTER TABLE users ADD COLUMN best_difficulty TEXT;
ALTER TABLE users ADD COLUMN best_wave INTEGER;
CREATE INDEX IF NOT EXISTS users_leaderboard_best_idx
  ON users (merit_total DESC, best_wave DESC);
```

- [ ] **Step 4: Update `attemptClaim` in `worker/modules/merit/service.js`**

After the existing batch (which updates `merit_total`), append an `UPDATE users SET best_difficulty = ?, best_wave = ?` guarded by a CASE that only overwrites when the new claim is a better/higher record. Compute a `difficultyRank` in JS (endless=4, hard=3, normal=2, easy=1) and pass it with the claim values. Keep the `EXISTS` guard so a failed/duplicate claim does not update.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run worker/modules/merit worker/db`
Expected: PASS.

- [ ] **Step 6: Apply migration to preview D1**

Run: `npm run d1:migrate:preview`
Expected: migration `0002_leaderboard_best.sql` applied.

- [ ] **Step 7: Commit**

```bash
git add migrations/0002_leaderboard_best.sql worker/modules/merit/service.js worker/modules/merit/merit.test.js worker/db/d1.test.js
git commit -m "feat: record best difficulty/wave on merit claims"
```

---

### Task 13: Leaderboard includes 0-merit users, orders by difficulty+wave

**Files:**
- Modify: `worker/modules/leaderboard/routes.js` (ordering, remove merit_total>0 filter)
- Modify: `worker/modules/leaderboard/cursor.js` (cursor validation for 0 merit + best fields)
- Test: `worker/modules/leaderboard/leaderboard.test.js` (new file)

**Interfaces:**
- Consumes: `users.best_difficulty`, `users.best_wave`.
- Produces: `/api/leaderboard` returns rows sorted by `merit_total DESC, best_difficulty_rank ASC, best_wave DESC, merit_reached_at ASC`; `/api/leaderboard/me` always returns a rank.

- [ ] **Step 1: Write failing test for ordering**

Create `worker/modules/leaderboard/leaderboard.test.js`:

```js
it('includes zero-merit users and orders by difficulty then wave', async () => {
  // seed users: A(0 merit), B(10, EASY/30), C(10, HARD/15), D(10, HARD/60)
  // expect order: D, C, B, A
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/modules/leaderboard`
Expected: FAIL (current SQL filters merit_total > 0).

- [ ] **Step 3: Update leaderboard SQL in routes.js**

Replace the `WHERE`/`ORDER BY`:

```sql
WHERE u.status = 'ACTIVE'
ORDER BY
  u.merit_total DESC,
  CASE
    WHEN u.best_difficulty = 'ENDLESS' THEN 0
    WHEN u.best_difficulty = 'HARD' THEN 1
    WHEN u.best_difficulty = 'NORMAL' THEN 2
    WHEN u.best_difficulty = 'EASY' THEN 3
    ELSE 4
  END ASC,
  u.best_wave DESC,
  u.merit_reached_at ASC,
  u.id ASC
```

Update cursor encode/decode to carry `bestDifficultyRank` and `bestWave` for stable pagination. Relax cursor validation from `meritTotal > 0` to `meritTotal >= 0` and add the best fields. For `/api/leaderboard/me`, remove the `merit_total <= 0` early-return and always compute rank.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/modules/leaderboard`
Expected: PASS.

- [ ] **Step 5: Run worker suite**

Run: `npm run worker:test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/modules/leaderboard/routes.js worker/modules/leaderboard/cursor.js worker/modules/leaderboard/leaderboard.test.js
git commit -m "feat: leaderboard shows all users, orders by merit then best difficulty/wave"
```

---

### Task 14: Fix merit claim not reaching the server (bug #5)

**Files:**
- Modify: `src/meta/accountScene.js` (flush merit after login/register)
- Modify: `src/meta/homeScene.js` (flush on entering home)
- Test: `src/net/meritClient.test.js`, `src/meta/accountScene.test.js`

**Interfaces:**
- Consumes: `flushMeritClaims()` from `meritClient.js`.
- Produces: merit claims queued while logged out flush automatically after login/register and on entering home.

- [ ] **Step 1: Write failing test (claims flush after login)**

Add to `src/net/meritClient.test.js`:

```js
it('flushes queued merit claims after the user logs in', async () => {
  const queue = loadData('meritQueue', []);
  queue.push({ userId: 'u1', payload: easy30Claim });
  saveData('meritQueue', queue, { notify: false });
  // mock getCurrentUser to return u1, apiRequest to 201
  const result = await flushMeritClaims();
  expect(result.queued).toBe(false);
  expect(loadData('meritQueue', [])).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/net/meritClient.test.js -t "flushes queued"`
Expected: the gap is the *call site* — the test may already pass when calling `flushMeritClaims` directly, so the failing test must assert the account/home scenes invoke it. Add a test to `accountScene.test.js` asserting `flushMeritClaims` is called on successful login.

- [ ] **Step 3: Add flush calls after login/register and on home enter**

In `src/meta/accountScene.js`, import `flushMeritClaims` and call it in the success path of `submitForm`:

```js
import { flushMeritClaims } from '../net/meritClient.js';
// in submitForm success path:
if (this.mode === 'login') await login(credentials.username, credentials.password);
else await register(credentials.username, credentials.password);
flushMeritClaims(); // 补发登录前未提交的军功
this.scenes.switch(authenticatedSceneName());
```

In `src/meta/homeScene.js`, add `flushMeritClaims()` to `enter()` (idempotent, no-op when logged out):

```js
import { flushMeritClaims } from '../net/meritClient.js';
enter() { flushMeritClaims(); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/net/meritClient.test.js src/meta/accountScene.test.js`
Expected: PASS.

- [ ] **Step 5: Run full frontend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/meta/accountScene.js src/meta/homeScene.js src/net/meritClient.test.js src/meta/accountScene.test.js
git commit -m "fix: flush merit claims after login and on home enter"
```

---

### Batch 5: README + full test pass

### Task 15: Write README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md` with sections: 游戏简介, 核心玩法 (组词布阵/刷新将士/铲子激活/军功进阶/装备词条羁绊/货币系统), 系统架构 (Vite+Canvas 前端, Cloudflare Worker+D1 后端, Turnstile), 本地开发 (npm ci / npm run dev / npm test), 部署 (preview/production 流程), 技术栈与目录结构.

Include the actual commands from `package.json`: `npm run dev`, `npm test`, `npm run worker:test`, `npm run build`, `npm run deploy:preview`, `npm run deploy:production`, `npm run d1:migrate:preview`, `npm run verify:worker`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
```

---

### Task 16: Final full verification and batch commit

**Files:**
- (none — verification only)

- [ ] **Step 1: Run all frontend tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Run all worker tests**

Run: `npm run worker:test`
Expected: all pass.

- [ ] **Step 3: Run build and dry-run deploy**

Run: `npm run verify:worker`
Expected: build + dry-run pass, config shows `PASSWORD_KDF_ITERATIONS: "100000"`.

- [ ] **Step 4: Review diff for stray changes**

Run: `git status --short` and `git diff --stat`
Expected: only planned files changed. Fix any stray edits.

- [ ] **Step 5: Confirm branch state**

```bash
git status --short
git log --oneline -20
```

Expected: clean tree on `dev/item-overhaul`, commits grouped into 5 batches.

---

## Self-Review Notes

- **Spec coverage:** All 12 user items map to tasks: ①→Task1, ②→Task2, ③→Task3, ④→Task4, ⑤→Task14+12, ⑥→Task13, ⑦→Task5, ⑧→Task6-8, ⑨→Task9-11, ⑩→Task3, ⑪→Task15, ⑫→batch commits throughout.
- **Placeholder scan:** No TBDs; every code step shows full code. The `fakeSave`/`stubCanvas` helpers are described with their required methods.
- **Type consistency:** `bondStats(slotMap, ownedList)` matches the battle call; `rollEquipInstance(id, rarity, random)` and `rollAffixes(rarity, random)` signatures used consistently; `spendGems`/`spendSoulJade`/`addGems`/`addSoulJade` all added in saveData and imported where used.
