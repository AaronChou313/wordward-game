import { describe, expect, it } from 'vitest';
import { createCharPool } from './charPool.js';
import { RefreshBar } from './refreshBar.js';

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
