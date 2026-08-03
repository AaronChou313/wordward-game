import { describe, expect, it } from 'vitest';
import {
  canUnlockDifficulty,
  claimBossCompletion,
  isBossWave,
  isEliteWave,
  meritForBoss,
} from './progression.js';

describe('wave progression rules', () => {
  it('places elites on waves 10 and 20 of every 30-wave cycle', () => {
    expect([10, 20, 40, 50, 70, 80].every(isEliteWave)).toBe(true);
    expect([0, 9, 21, 30, 31, 60].some(isEliteWave)).toBe(false);
  });

  it('places bosses on positive multiples of 30', () => {
    expect([30, 60, 90].every(isBossWave)).toBe(true);
    expect([0, -30, 29, 31].some(isBossWave)).toBe(false);
  });

  it.each([
    ['easy', 1, 2],
    ['normal', 2, 4],
    ['hard', 4, 8],
    ['endless', 8, 16],
  ])('awards %s merit at waves 30 and 60', (diffId, wave30, wave60) => {
    expect(meritForBoss(diffId, 30)).toBe(wave30);
    expect(meritForBoss(diffId, 60)).toBe(wave60);
  });
});

describe('Boss completion claims', () => {
  it('does not unlock from a best-wave record but unlocks once wave-30 Boss is claimed', () => {
    const save = {
      merit: { total: 0, claimed: {} },
      diff: { unlocked: ['easy'], best: { easy: 99 } },
    };

    expect(canUnlockDifficulty(save, 'normal')).toBe(false);
    expect(save.diff.unlocked).toEqual(['easy']);

    const firstClaim = claimBossCompletion(save, 'easy', 30);

    expect(firstClaim).toEqual({ claimed: true, merit: 1, unlocked: 'normal' });
    expect(canUnlockDifficulty(save, 'normal')).toBe(true);
    expect(save).toEqual({
      merit: { total: 1, claimed: { 'easy:30': true } },
      diff: { unlocked: ['easy', 'normal'], best: { easy: 99 } },
    });
  });

  it('does not award merit or unlock twice for the same Boss claim', () => {
    const save = {
      merit: { total: 0, claimed: {} },
      diff: { unlocked: ['easy'], best: {} },
    };

    claimBossCompletion(save, 'easy', 30);
    const repeatClaim = claimBossCompletion(save, 'easy', 30);

    expect(repeatClaim).toEqual({ claimed: false, merit: 0, unlocked: null });
    expect(save.merit).toEqual({ total: 1, claimed: { 'easy:30': true } });
    expect(save.diff.unlocked).toEqual(['easy', 'normal']);
  });
});
