import { describe, expect, it } from 'vitest';
import { applyBondStats } from './bond.js';

// 虎啸套装成员：p_sword / p_armor / p_charm
const owned = [
  { uid: 'u1', id: 'p_sword', rarity: 'common', lvl: 1, affixes: [] },
  { uid: 'u2', id: 'p_armor', rarity: 'common', lvl: 1, affixes: [] },
  { uid: 'u3', id: 'p_charm', rarity: 'common', lvl: 1, affixes: [] },
];
const fullSlots = { '武器': 'u1', '护甲': 'u2', '饰品': 'u3' };

describe('applyBondStats (battle stat-merge path)', () => {
  it('leaves base stats unchanged when no bond applies', () => {
    expect(applyBondStats({ atk: 0.10 }, { '武器': 'u1' }, owned)).toEqual({ atk: 0.10 });
  });

  it('adds the 2-piece bond on top of existing base stats', () => {
    // 虎啸 2 件：atk +0.08，与已有 atk 相加而不是覆盖
    expect(applyBondStats({ atk: 0.10 }, { '武器': 'u1', '护甲': 'u2' }, owned)).toEqual({ atk: 0.18 });
  });

  it('adds the full 3-piece bond stats into the stat object', () => {
    expect(applyBondStats({}, fullSlots, owned)).toMatchObject({ atk: 0.15, spd: 0.08 });
  });

  it('does not mutate the input base stats object', () => {
    const base = { atk: 0.10 };
    const result = applyBondStats(base, fullSlots, owned);
    expect(result).not.toBe(base);
    expect(base).toEqual({ atk: 0.10 });
  });

  it('flows dragon-series lordHp and blockerHp into the stat object', () => {
    const dragonOwned = [
      { uid: 'u1', id: 'p_dragonWeapon', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u2', id: 'p_dragonArmor', rarity: 'common', lvl: 1, affixes: [] },
      { uid: 'u3', id: 'p_dragonTrinket', rarity: 'common', lvl: 1, affixes: [] },
    ];
    expect(applyBondStats({}, { '武器': 'u1', '护甲': 'u2', '饰品': 'u3' }, dragonOwned))
      .toMatchObject({ lordHp: 4, blockerHp: 0.20 });
  });
});
