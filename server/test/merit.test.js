import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { meritForClaim } from '../src/modules/merit/service.js';

const config = {
  nodeEnv: 'test', host: '127.0.0.1', port: 3100,
  databaseUrl: 'postgresql://unused',
  jwtAccessSecret: 'test-access-secret-with-at-least-32-chars',
  refreshTokenPepper: 'test-refresh-pepper-with-at-least-32-chars',
};

let app;
let prisma;

beforeEach(async () => {
  prisma = memoryPrisma();
  app = buildApp({ config, prisma });
  await app.ready();
});

afterEach(async () => app.close());

describe('server-validated merit claims', () => {
  it.each([
    ['easy', 30, 1], ['easy', 60, 2],
    ['normal', 30, 2], ['normal', 60, 4],
    ['hard', 30, 4], ['hard', 60, 8],
    ['endless', 30, 8], ['endless', 60, 16],
  ])('derives %s wave %i merit on the server', (difficulty, wave, merit) => {
    expect(meritForClaim(difficulty, wave)).toBe(merit);
  });

  it('awards an authenticated claim once and returns duplicates idempotently', async () => {
    const payload = claim({ difficulty: 'easy', bossWave: 30 });

    const first = await request('user-1', payload);
    const duplicate = await request('user-1', payload);

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ awarded: true, merit: 1, meritTotal: 1 });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({ awarded: false, merit: 1, meritTotal: 1 });
    expect(prisma.records.claims).toHaveLength(1);
  });

  it('accepts remaining Lord health granted by equipped armor', async () => {
    const payload = claim();
    payload.summary.lordHp = 23;

    const response = await request('user-1', payload);

    expect(response.statusCode).toBe(201);
  });

  it('rejects impossible waves, unlock order, elapsed time, and mismatched summaries', async () => {
    const invalid = [
      claim({ difficulty: 'easy', bossWave: 45, summary: { wave: 45, kills: 100, lordHp: 50 } }),
      claim({ difficulty: 'normal', bossWave: 30 }),
      claim({ difficulty: 'easy', bossWave: 60 }),
      claim({ difficulty: 'easy', bossWave: 30, startedAt: '2026-08-03T00:00:00.000Z', finishedAt: '2026-08-03T00:00:10.000Z' }),
      claim({ difficulty: 'easy', bossWave: 30, startedAt: '2026-08-03T00:00:00.000Z', finishedAt: '2026-08-03T00:00:30.000Z' }),
      claim({ difficulty: 'easy', bossWave: 30, summary: { wave: 29, kills: 100, lordHp: 50 } }),
      claim({ difficulty: 'easy', bossWave: 30, summary: { wave: 30, kills: 1, lordHp: 50 } }),
      claim({ difficulty: 'easy', bossWave: 30, summary: { wave: 30, kills: 30, lordHp: 10 } }),
    ];

    for (const payload of invalid) {
      const response = await request('user-1', payload);
      expect(response.statusCode).toBe(400);
    }
    expect(prisma.records.claims).toHaveLength(0);
  });

  it('enforces the full difficulty and endless-floor progression chain', async () => {
    for (const payload of [
      claim({ difficulty: 'easy', bossWave: 30, runId: 'run-easy' }),
      claim({ difficulty: 'normal', bossWave: 30, runId: 'run-normal' }),
      claim({ difficulty: 'hard', bossWave: 30, runId: 'run-hard' }),
      claim({ difficulty: 'endless', endlessFloor: 1, bossWave: 30, runId: 'run-endless-1' }),
      claim({ difficulty: 'endless', endlessFloor: 2, bossWave: 30, runId: 'run-endless-2' }),
      claim({ difficulty: 'endless', endlessFloor: 2, bossWave: 60, runId: 'run-endless-2' }),
    ]) {
      const response = await request('user-1', payload);
      expect(response.statusCode, JSON.stringify(response.json())).toBe(201);
    }

    expect(prisma.records.users.get('user-1').meritTotal).toBe(39);
    expect(prisma.records.claims).toHaveLength(6);
  });

  it('requires authentication and rejects client-submitted totals', async () => {
    const unauthenticated = await app.inject({ method: 'POST', url: '/api/merit/claims', payload: claim() });
    const forged = await request('user-1', { ...claim(), meritTotal: 999999 });

    expect(unauthenticated.statusCode).toBe(401);
    expect(forged.statusCode).toBe(400);
  });

  it('recovers idempotently when a concurrent request wins the unique-key race', async () => {
    prisma.forceDuplicateRace = true;

    const response = await request('user-1', claim());

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ awarded: false, merit: 1, meritTotal: 1 });
    expect(prisma.records.claims).toHaveLength(1);
  });

  it('restores the losing run checkpoint after a concurrent first-award race', async () => {
    prisma.forceDuplicateRace = true;
    prisma.forceDuplicateRaceRunId = 'run-winner';
    const losingRun = { runId: 'run-loser', seed: 'seed-loser' };

    const raced = await request('user-1', claim(losingRun));
    const continued = await request('user-1', claim({ ...losingRun, bossWave: 60 }));

    expect(raced.statusCode).toBe(200);
    expect(continued.statusCode).toBe(201);
    expect(continued.json()).toMatchObject({ merit: 2, meritTotal: 3 });
  });

  it('binds later Bosses in one run to the same seed and start time', async () => {
    expect((await request('user-1', claim({ bossWave: 30 }))).statusCode).toBe(201);

    const changedSeed = await request('user-1', claim({ bossWave: 60, seed: 'different-seed' }));

    expect(changedSeed.statusCode).toBe(400);
    expect(changedSeed.json()).toMatchObject({ code: 'RUN_MISMATCH' });
  });

  it('rejects a later Boss whose completion time moves backwards in one run', async () => {
    expect((await request('user-1', claim({
      finishedAt: '2026-08-03T00:10:00.000Z',
    }))).statusCode).toBe(201);

    const reversed = await request('user-1', claim({
      bossWave: 60, finishedAt: '2026-08-03T00:05:00.000Z',
    }));

    expect(reversed.statusCode).toBe(400);
    expect(reversed.json()).toMatchObject({ code: 'RUN_MISMATCH' });
  });

  it('allows a later run to replay wave 30 before continuing to wave 60', async () => {
    expect((await request('user-1', claim({ runId: 'run-first' }))).statusCode).toBe(201);
    const secondRun = {
      runId: 'run-second', seed: 'seed-second',
      startedAt: '2026-08-03T01:00:00.000Z',
      finishedAt: '2026-08-03T01:10:00.000Z',
    };

    const replay = await request('user-1', claim(secondRun));
    const continued = await request('user-1', claim({
      ...secondRun, bossWave: 60, finishedAt: '2026-08-03T01:20:00.000Z',
    }));

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ awarded: false, meritTotal: 1 });
    expect(continued.statusCode).toBe(201);
    expect(continued.json()).toMatchObject({ awarded: true, merit: 2, meritTotal: 3 });
  });
});

function request(userId, payload) {
  return app.inject({
    method: 'POST', url: '/api/merit/claims', payload,
    headers: { authorization: `Bearer ${app.jwt.sign({ id: userId })}` },
  });
}

function claim(overrides = {}) {
  const bossWave = overrides.bossWave || 30;
  const difficulty = overrides.difficulty || 'easy';
  const endlessFloor = overrides.endlessFloor || 1;
  const defaultFinishedAt = bossWave > 30
    ? '2026-08-03T00:10:00.000Z'
    : '2026-08-03T00:05:00.000Z';
  return {
    difficulty,
    endlessFloor,
    bossWave,
    runId: 'run-0001',
    seed: 'seed-001',
    startedAt: '2026-08-03T00:00:00.000Z',
    finishedAt: defaultFinishedAt,
    summary: { wave: bossWave, kills: plausibleKills(difficulty, endlessFloor, bossWave), lordHp: 10 },
    ...overrides,
  };
}

function plausibleKills(difficulty, endlessFloor, bossWave) {
  const base = difficulty === 'easy' ? 6
    : difficulty === 'normal' ? 8
      : difficulty === 'hard' ? 10
        : 10 + 2 * (endlessFloor - 1);
  const growth = difficulty === 'easy' || difficulty === 'normal' ? 2 : 3;
  const total = bossWave * base + growth * bossWave * (bossWave + 1) / 2
    + Math.floor(bossWave / 10);
  return total - 10;
}

function memoryPrisma() {
  const records = {
    users: new Map([['user-1', {
      id: 'user-1', status: 'ACTIVE', meritTotal: 0, meritReachedAt: null,
    }]]),
    claims: [],
    checkpoints: [],
  };
  let nextId = 1;
  const meritClaim = {
    async findUnique({ where }) {
      const key = where.userId_difficulty_endlessFloor_bossWave;
      return records.claims.find((entry) => entry.userId === key.userId
        && entry.difficulty === key.difficulty
        && entry.endlessFloor === key.endlessFloor
        && entry.bossWave === key.bossWave) || null;
    },
    async create({ data }) {
      if (client.forceDuplicateRace) {
        client.forceDuplicateRace = false;
        const entry = {
          id: `claim-${nextId++}`,
          ...data,
          runId: client.forceDuplicateRaceRunId || data.runId,
        };
        records.claims.push(entry);
        const winner = records.users.get(data.userId);
        winner.meritTotal += data.merit;
        winner.meritReachedAt = new Date();
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const duplicate = records.claims.some((entry) => entry.userId === data.userId
        && entry.difficulty === data.difficulty
        && entry.endlessFloor === data.endlessFloor
        && entry.bossWave === data.bossWave);
      if (duplicate) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const entry = { id: `claim-${nextId++}`, ...data };
      records.claims.push(entry);
      return entry;
    },
  };
  const user = {
    async findUnique({ where }) { return records.users.get(where.id) || null; },
    async update({ where, data }) {
      const current = records.users.get(where.id);
      current.meritTotal += data.meritTotal.increment;
      current.meritReachedAt = data.meritReachedAt;
      return current;
    },
  };
  const meritRunCheckpoint = {
    async findUnique({ where }) {
      const key = where.userId_runId;
      return records.checkpoints.find((entry) => entry.userId === key.userId
        && entry.runId === key.runId) || null;
    },
    async create({ data }) {
      const entry = { id: `checkpoint-${records.checkpoints.length + 1}`, ...data };
      records.checkpoints.push(entry);
      return entry;
    },
    async update({ where, data }) {
      const key = where.userId_runId;
      const entry = records.checkpoints.find((candidate) => candidate.userId === key.userId
        && candidate.runId === key.runId);
      Object.assign(entry, data);
      return entry;
    },
  };
  const client = {
    records, meritClaim, meritRunCheckpoint, user,
    forceDuplicateRace: false, forceDuplicateRaceRunId: null,
    async $transaction(callback) {
      const checkpoints = records.checkpoints.map((entry) => ({ ...entry }));
      try {
        return await callback({ meritClaim, meritRunCheckpoint, user });
      } catch (error) {
        records.checkpoints.splice(0, records.checkpoints.length, ...checkpoints);
        throw error;
      }
    },
  };
  return client;
}
