import { describe, expect, it } from 'vitest';
import { createCharPool } from './charPool.js';
import { RefreshBar } from './refreshBar.js';
import { SHOVEL_DROP_CHANCE, SHOVEL_PITY } from '../config/economy.js';
import { DIFFICULTIES } from '../config/difficulty.js';

describe('RefreshBar advanced-character draws', () => {
  it('falls back to an unlimited weighted base draw when an advanced roll finds an empty pool', () => {
    const pool = createCharPool(['赵']);
    pool.draw(() => 0);
    pool.draw(() => 0);
    const bar = new RefreshBar(['赵'], { advAdd: 1 }, pool, () => 0);

    expect(bar.pullOne()).toEqual({ char: '兵', kind: 'base', tier: 1, level: 1, xp: 0 });
    expect(pool.remainingTotal()).toBe(0);
  });
});

describe('shovel drop tuning', () => {
  it('raises the base shovel chance and tightens pity', () => {
    expect(SHOVEL_DROP_CHANCE).toBeGreaterThanOrEqual(0.55);
    expect(SHOVEL_PITY).toBeLessThanOrEqual(2);
    expect(DIFFICULTIES[0].shovelAdd).toBeGreaterThanOrEqual(0.05);
  });

  it('scales shovel chance up with wave count', () => {
    const bar = new RefreshBar([], DIFFICULTIES[0], null, () => 0.7);
    bar.wave = 40;
    bar.sinceShovel = 0;
    bar.refresh(true); // force: true skips the ready check
    // random 0.70 is below the wave-boosted chance (0.75) but above the no-wave chance (0.60)
    expect(bar.shovels).toBe(1);
  });
});
