import { describe, expect, it } from 'vitest';
import { meritForClaim, normalizeClaim, MeritClaimError } from './service.js';

const base = {
  difficulty: 'easy', endlessFloor: 1, bossWave: 30, runId: 'run-0001', seed: 'seed-001',
  startedAt: '2026-08-03T00:00:00.000Z', finishedAt: '2026-08-03T00:05:00.000Z',
  summary: { wave: 30, kills: 1000, lordHp: 10 },
};

describe('merit validation', () => {
  it.each([['easy', 30, 1], ['normal', 30, 2], ['hard', 60, 8], ['endless', 60, 16]])('derives %s wave merit', (difficulty, wave, expected) => {
    expect(meritForClaim(difficulty, wave)).toBe(expected);
  });

  it('normalizes timestamps and summary JSON', () => {
    const result = normalizeClaim(base, Date.parse('2026-08-03T01:00:00.000Z'));
    expect(result.startedAt).toBe(Date.parse(base.startedAt));
    expect(result.finishedAt).toBe(Date.parse(base.finishedAt));
    expect(result.summaryJson).toBe(JSON.stringify(base.summary));
  });

  it('rejects malformed summaries and impossible waves', () => {
    expect(() => normalizeClaim({ ...base, bossWave: 45 })).toThrow(MeritClaimError);
    expect(() => normalizeClaim({ ...base, summary: { wave: 29, kills: 1, lordHp: 0 } })).toThrow(MeritClaimError);
  });
});
