import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSave } from '../meta/saveData.js';

const submit = vi.fn();

vi.mock('../net/meritClient.js', () => ({
  buildMeritClaim: (input) => input,
  queueMeritClaim: (payload) => submit(payload),
}));

const { BattleScene } = await import('./battleScene.js');

describe('BattleScene verified merit submission', () => {
  beforeEach(() => submit.mockReset());

  it('submits a defeated Boss even when its local reward was already claimed', () => {
    const save = getSave();
    save.merit = { total: 1, claimed: { 'easy:30': true } };
    save.diff.unlocked = ['easy', 'normal'];

    const scene = new BattleScene({});
    scene.diff = { id: 'easy', floor: 1 };
    scene.runId = 'run-server-backfill';
    scene.runSeed = 'seed-server-backfill';
    scene.runStartedAt = new Date('2026-08-03T00:00:00.000Z');
    scene.score = { kills: 1100 };
    scene.lordHp = 10;

    const result = scene.handleBossDefeated(30);

    expect(result.claimed).toBe(false);
    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      difficulty: 'easy', bossWave: 30, kills: 1101,
    }));
  });
});
