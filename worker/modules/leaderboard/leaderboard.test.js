import { readFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { run } from '../../db/queries.js';
import { signAccessToken } from '../../security/jwt.js';

const migrations = [
  new URL('../../../migrations/0001_initial.sql', import.meta.url),
  new URL('../../../migrations/0002_leaderboard_best.sql', import.meta.url),
];

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
  env = {
    APP_ORIGIN: 'https://wordward.example',
    JWT_ACCESS_SECRET: 'jwt',
    REFRESH_TOKEN_PEPPER: 'pepper',
    DB: db,
  };
  await applyMigrations(db);
});

afterEach(async () => {
  await platform?.dispose();
  platform = undefined;
  db = undefined;
  env = undefined;
});

/** Insert an active user and set its merit / best-record fields directly. */
async function seedUser({ id, username, merit = 0, difficulty = null, wave = null, reachedAt = null }) {
  const now = Date.now();
  await run(db, 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, username, 'hash', 'salt', 'PBKDF2-SHA-256', 1000, now, now);
  await run(db, 'UPDATE users SET merit_total = ?, merit_reached_at = ?, best_difficulty = ?, best_wave = ? WHERE id = ?', merit, reachedAt, difficulty, wave, id);
}

function leaderboardUrl(query = '') {
  return `https://wordward.example/api/leaderboard${query}`;
}

describe('leaderboard ordering', () => {
  it('includes zero-merit users and orders by merit then difficulty then wave', async () => {
    // D: highest merit, HARD/60. C: same merit, HARD/15 (harder difficulty than EASY). B: EASY/30. A: no merit.
    await seedUser({ id: 'u-a', username: 'alice', merit: 0 });
    await seedUser({ id: 'u-b', username: 'bob', merit: 10, difficulty: 'EASY', wave: 30, reachedAt: 1500 });
    await seedUser({ id: 'u-c', username: 'carol', merit: 10, difficulty: 'HARD', wave: 15, reachedAt: 1500 });
    await seedUser({ id: 'u-d', username: 'dave', merit: 10, difficulty: 'HARD', wave: 60, reachedAt: 1500 });

    const app = createApp({ env, ctx: {} });
    const response = await app.request(leaderboardUrl());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows.map((row) => row.userId)).toEqual(['u-d', 'u-c', 'u-b', 'u-a']);
    expect(body.rows.map((row) => row.merit)).toEqual([10, 10, 10, 0]);
    expect(body.rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it('orders equal merit/difficulty/wave by earlier reachedAt', async () => {
    await seedUser({ id: 'u-x', username: 'xavier', merit: 10, difficulty: 'EASY', wave: 30, reachedAt: 3000 });
    await seedUser({ id: 'u-y', username: 'yolanda', merit: 10, difficulty: 'EASY', wave: 30, reachedAt: 1000 });

    const app = createApp({ env, ctx: {} });
    const response = await app.request(leaderboardUrl());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows.map((row) => row.userId)).toEqual(['u-y', 'u-x']);
  });
});

describe('leaderboard me rank', () => {
  async function authHeader(userId, username) {
    return `Bearer ${await signAccessToken({ id: userId, username }, env.JWT_ACCESS_SECRET)}`;
  }

  it('returns a rank for a zero-merit user', async () => {
    await seedUser({ id: 'u-a', username: 'alice', merit: 0 });
    await seedUser({ id: 'u-b', username: 'bob', merit: 10, difficulty: 'EASY', wave: 30, reachedAt: 1500 });
    await seedUser({ id: 'u-c', username: 'carol', merit: 10, difficulty: 'HARD', wave: 15, reachedAt: 1500 });
    await seedUser({ id: 'u-d', username: 'dave', merit: 10, difficulty: 'HARD', wave: 60, reachedAt: 1500 });

    const app = createApp({ env, ctx: {} });
    const response = await app.request('https://wordward.example/api/leaderboard/me', {
      headers: { Authorization: await authHeader('u-a', 'alice') },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rank).toBe(4);
    expect(body.userId).toBe('u-a');
  });

  it('ranks the top user at one', async () => {
    await seedUser({ id: 'u-a', username: 'alice', merit: 0 });
    await seedUser({ id: 'u-d', username: 'dave', merit: 10, difficulty: 'HARD', wave: 60, reachedAt: 1500 });

    const app = createApp({ env, ctx: {} });
    const response = await app.request('https://wordward.example/api/leaderboard/me', {
      headers: { Authorization: await authHeader('u-d', 'dave') },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).rank).toBe(1);
  });
});

describe('leaderboard cursor pagination', () => {
  it('pages in composite order and does not drop rows across pages', async () => {
    await seedUser({ id: 'u-a', username: 'alice', merit: 0 });
    await seedUser({ id: 'u-b', username: 'bob', merit: 10, difficulty: 'EASY', wave: 30, reachedAt: 1500 });
    await seedUser({ id: 'u-c', username: 'carol', merit: 10, difficulty: 'HARD', wave: 15, reachedAt: 1500 });
    await seedUser({ id: 'u-d', username: 'dave', merit: 10, difficulty: 'HARD', wave: 60, reachedAt: 1500 });

    const app = createApp({ env, ctx: {} });
    const page1 = await app.request(leaderboardUrl('?limit=2'));
    expect(page1.status).toBe(200);
    const first = await page1.json();
    expect(first.rows.map((row) => row.userId)).toEqual(['u-d', 'u-c']);
    expect(first.nextCursor).toBeTruthy();

    const page2 = await app.request(leaderboardUrl(`?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`));
    expect(page2.status).toBe(200);
    const second = await page2.json();
    expect(second.rows.map((row) => row.userId)).toEqual(['u-b', 'u-a']);
    expect(second.rows.map((row) => row.rank)).toEqual([3, 4]);
    expect(second.nextCursor).toBeNull();
  });

  it('keeps null-reachedAt zero-merit users across pages', async () => {
    // Two zero-merit users with no claims (NULL best_difficulty/best_wave/reachedAt)
    // must both surface even when they span a page boundary (id ASC tie-break).
    await seedUser({ id: 'u-e', username: 'erin', merit: 0 });
    await seedUser({ id: 'u-f', username: 'frank', merit: 0 });

    const app = createApp({ env, ctx: {} });
    const page1 = await app.request(leaderboardUrl('?limit=1'));
    expect(page1.status).toBe(200);
    const first = await page1.json();
    expect(first.rows.map((row) => row.userId)).toEqual(['u-e']);
    expect(first.nextCursor).toBeTruthy();

    const page2 = await app.request(leaderboardUrl(`?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`));
    expect(page2.status).toBe(200);
    const second = await page2.json();
    expect(second.rows.map((row) => row.userId)).toEqual(['u-f']);
    expect(second.nextCursor).toBeNull();
  });
});
