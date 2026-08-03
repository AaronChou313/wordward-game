import { describe, expect, it } from 'vitest';
import { migrateSave } from './saveData.js';

describe('migrateSave', () => {
  it('upgrades a version-1 save without losing existing progress', () => {
    const version1Save = {
      version: 1,
      gold: 825,
      items: { owned: { heal: 3 }, equippedActive: ['heal'], equippedPassive: ['lucky'] },
      unlockedChars: ['精', '铁', '赵', '云', '吕', '布', '关', '羽'],
      bestWave: 29,
      settings: { volume: 45 },
      diff: { unlocked: ['easy', 'normal'], endlessFloor: 4, best: { easy: 31 }, selected: { id: 'normal' } },
      equipment: {
        owned: [{ uid: 1, id: 'sword', rarity: 'rare', lvl: 2 }],
        nextUid: 2,
        player: { '武器': 1, '护甲': null, '饰品': null },
        units: { '兵': null, '骑': null, '枪': null, '弓': null, '炮': null },
      },
      codex: { base: ['兵'], prefix: ['精'], hero: ['赵云'] },
    };

    expect(migrateSave(version1Save)).toEqual({
      ...version1Save,
      version: 2,
      merit: { total: 0, claimed: {} },
      gacha: { smallPity: 0, bigPity: 0 },
      shop: { stock: [] },
    });
  });
});
