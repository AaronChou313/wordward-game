import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const config = {
  nodeEnv: 'test', host: '127.0.0.1', port: 3100,
  databaseUrl: 'postgresql://unused',
  jwtAccessSecret: 'test-access-secret-with-at-least-32-chars',
  refreshTokenPepper: 'test-refresh-pepper-with-at-least-32-chars',
};

let app;
let saves;
let createRaceSave;

beforeEach(async () => {
  saves = new Map();
  createRaceSave = null;
  const gameSave = {
    async findUnique({ where }) {
      return saves.get(where.userId) || null;
    },
    async create({ data }) {
      if (createRaceSave) {
        saves.set(data.userId, createRaceSave);
        const error = new Error('unique constraint');
        error.code = 'P2002';
        throw error;
      }
      if (saves.has(data.userId)) throw new Error('unique constraint');
      const saved = { ...data, updatedAt: new Date('2026-08-03T00:00:00Z') };
      saves.set(data.userId, saved);
      return saved;
    },
    async updateMany({ where, data }) {
      const current = saves.get(where.userId);
      if (!current || current.version !== where.version) return { count: 0 };
      const saved = {
        ...current,
        ...data,
        version: data.version.increment === undefined
          ? data.version
          : current.version + data.version.increment,
      };
      saves.set(where.userId, saved);
      return { count: 1 };
    },
  };
  const prisma = {
    gameSave,
    async $transaction(callback) { return callback({ gameSave }); },
  };
  app = buildApp({ config, prisma });
  await app.ready();
});

afterEach(async () => app.close());

describe('cloud save API', () => {
  it('creates version one from the first version-zero write and reads it back', async () => {
    const created = await request('PUT', 'user-1', { version: 0, data: sampleSave(450) });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ version: 1, data: sampleSave(450) });
    expect(saves.get('user-1')).toMatchObject({ schemaVersion: 2, version: 1 });

    const read = await request('GET', 'user-1');
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ version: 1, data: sampleSave(450) });
  });

  it('scopes reads to the authenticated owner', async () => {
    saves.set('user-2', {
      userId: 'user-2', schemaVersion: 2, version: 3, data: sampleSave(900),
    });

    const response = await request('GET', 'user-1');

    expect(response.statusCode).toBe(404);
  });

  it('increments the optimistic version after an exact-version write', async () => {
    saves.set('user-1', {
      userId: 'user-1', schemaVersion: 2, version: 4, data: sampleSave(400),
    });

    const response = await request('PUT', 'user-1', { version: 4, data: sampleSave(800) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: 5, data: sampleSave(800) });
  });

  it('rejects a stale write with the current cloud save', async () => {
    saves.set('user-1', {
      userId: 'user-1', schemaVersion: 2, version: 5, data: sampleSave(700),
    });

    const response = await request('PUT', 'user-1', { version: 4, data: sampleSave(800) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Save conflict', current: { version: 5, data: sampleSave(700) },
    });
    expect(saves.get('user-1').data.gold).toBe(700);
  });

  it('returns a conflict when another device wins the first-write race', async () => {
    createRaceSave = {
      userId: 'user-1', schemaVersion: 2, version: 1, data: sampleSave(610),
    };

    const response = await request('PUT', 'user-1', { version: 0, data: sampleSave(800) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Save conflict', current: { version: 1, data: sampleSave(610) },
    });
  });

  it('rejects JSON save data larger than 256 KiB', async () => {
    const response = await request('PUT', 'user-1', {
      version: 0,
      data: { version: 2, notes: 'x'.repeat(256 * 1024) },
    });

    expect(response.statusCode).toBe(413);
    expect(saves.size).toBe(0);
  });

  it('rejects protected merit fields instead of trusting client totals', async () => {
    const response = await request('PUT', 'user-1', {
      version: 0,
      data: { ...sampleSave(500), merit: { total: 999999, claimed: {} } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Protected save fields are not allowed' });
    expect(saves.size).toBe(0);
  });
});

function sampleSave(gold) {
  return { version: 2, gold, unlockedChars: ['精', '铁'] };
}

function request(method, userId, payload) {
  return app.inject({
    method,
    url: '/api/save',
    headers: { authorization: `Bearer ${app.jwt.sign({ id: userId })}` },
    payload,
  });
}
