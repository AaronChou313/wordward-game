import { describe, expect, it } from 'vitest';
import { claimBossCompletion } from '../battle/progression.js';
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

  it('normalizes a legacy endless wave-30 claim before progression checks', () => {
    const migrated = migrateSave({
      version: 1,
      diff: {
        unlocked: ['easy', 'normal', 'hard', 'endless'],
        endlessFloor: 1,
        best: {},
        selected: { id: 'endless', floor: 1 },
      },
      merit: { total: 8, claimed: { 'endless:30': true } },
    });

    expect(migrated.merit.claimed).toEqual({ 'endless:1:30': true });

    const repeat = claimBossCompletion(migrated, 'endless', 30, 1);

    expect(repeat).toEqual({ claimed: false, merit: 0, unlocked: null });
    expect(migrated.merit.total).toBe(8);
    expect(migrated.diff.endlessFloor).toBe(1);
  });

  it('idempotently collapses legacy and canonical endless claims to one key', () => {
    const raw = {
      version: 2,
      merit: {
        total: 9,
        claimed: {
          'easy:30': true,
          'endless:30': true,
          'endless:1:30': true,
        },
      },
    };

    const first = migrateSave(raw);
    const second = migrateSave(first);

    expect(first.merit.claimed).toEqual({
      'easy:30': true,
      'endless:1:30': true,
    });
    expect(second.merit.claimed).toEqual(first.merit.claimed);
    expect(second.merit.total).toBe(9);
  });
});
