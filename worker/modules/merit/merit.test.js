import { readFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { first, run } from '../../db/queries.js';
import { meritForClaim, normalizeClaim, MeritClaimError, recordMeritClaim } from './service.js';

const base = {
  difficulty: 'easy', endlessFloor: 1, bossWave: 30, runId: 'run-0001', seed: 'seed-001',
  startedAt: '2026-08-03T00:00:00.000Z', finishedAt: '2026-08-03T00:05:00.000Z',
  summary: { wave: 30, kills: 1000, lordHp: 10 },
};

// Valid claims whose kill counts / durations satisfy normalization and whose
// run/checkpoint relationships satisfy the progression rules in service.js
// (a wave > 30 claim must share its run's wave-30 checkpoint; normal requires
// a prior easy wave-30 claim).
const easy30 = base;
const easy30RunA = {
  difficulty: 'easy', endlessFloor: 1, bossWave: 30, runId: 'run-aaaa', seed: 'seed-aaaa',
  startedAt: '2026-08-03T00:00:00.000Z', finishedAt: '2026-08-03T00:05:00.000Z',
  summary: { wave: 30, kills: 1000, lordHp: 10 },
};
const easy60RunA = {
  difficulty: 'easy', endlessFloor: 1, bossWave: 60, runId: 'run-aaaa', seed: 'seed-aaaa',
  startedAt: '2026-08-03T00:00:00.000Z', finishedAt: '2026-08-03T00:10:00.000Z',
  summary: { wave: 60, kills: 3000, lordHp: 10 },
};
const normal30RunB = {
  difficulty: 'normal', endlessFloor: 1, bossWave: 30, runId: 'run-bbbb', seed: 'seed-bbbb',
  startedAt: '2026-08-03T02:00:00.000Z', finishedAt: '2026-08-03T02:05:00.000Z',
  summary: { wave: 30, kills: 1000, lordHp: 10 },
};

const migrations = [
  new URL('../../../migrations/0001_initial.sql', import.meta.url),
  new URL('../../../migrations/0002_leaderboard_best.sql', import.meta.url),
];

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

describe('merit claim best record', () => {
  let platform;
  let db;
  let env;

  async function applyMigrations(database) {
    for (const path of migrations) {
      const sql = await readFile(path, 'utf8');
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await database.exec(`${statement.replace(/\s+/g, ' ')};`);
      }
    }
  }

  beforeEach(async () => {
    platform = await getPlatformProxy({ environment: 'preview', remoteBindings: false, persist: false });
    db = platform.env.DB;
    env = platform.env;
    await applyMigrations(db);
    const now = Date.now();
    await run(db, 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'u1', 'alice', 'hash', 'salt', 'PBKDF2-SHA-256', 1000, now, now);
  });

  afterEach(async () => {
    await platform?.dispose();
    platform = undefined;
    db = undefined;
    env = undefined;
  });

  async function best(userId = 'u1') {
    return first(db, 'SELECT best_difficulty, best_wave FROM users WHERE id = ?', userId);
  }

  it('records best difficulty and wave on a new claim', async () => {
    const result = await recordMeritClaim(env, 'u1', easy30, Date.now());
    expect(result.awarded).toBe(true);
    expect(await best()).toEqual({ best_difficulty: 'EASY', best_wave: 30 });
  });

  it('upgrades the best wave within the same difficulty', async () => {
    await recordMeritClaim(env, 'u1', easy30RunA, Date.now());
    await recordMeritClaim(env, 'u1', easy60RunA, Date.now());
    expect(await best()).toEqual({ best_difficulty: 'EASY', best_wave: 60 });
  });

  it('promotes on a higher difficulty and never downgrades on a weaker claim', async () => {
    await recordMeritClaim(env, 'u1', easy30RunA, Date.now());
    expect(await best()).toEqual({ best_difficulty: 'EASY', best_wave: 30 });
    await recordMeritClaim(env, 'u1', normal30RunB, Date.now());
    expect(await best()).toEqual({ best_difficulty: 'NORMAL', best_wave: 30 });
    // A weaker claim after the record is set must not overwrite it.
    await recordMeritClaim(env, 'u1', easy60RunA, Date.now());
    expect(await best()).toEqual({ best_difficulty: 'NORMAL', best_wave: 30 });
  });
});
