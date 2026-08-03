import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const config = {
  nodeEnv: 'test', host: '127.0.0.1', port: 3100,
  databaseUrl: 'postgresql://unused',
  jwtAccessSecret: 'test-access-secret-with-at-least-32-chars',
  refreshTokenPepper: 'test-refresh-pepper-with-at-least-32-chars',
};

let app;

beforeEach(async () => {
  app = buildApp({ config, prisma: leaderboardPrisma() });
  await app.ready();
});

afterEach(async () => app.close());

describe('global merit leaderboard', () => {
  it('orders by merit, earliest attainment, then stable id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/leaderboard?limit=10' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rows: [
        row(1, 'user-2', '孟德', 100),
        row(2, 'user-1', '玄德', 100),
        row(3, 'user-3', '云长', 80),
        row(4, 'user-4', '翼德', 80),
      ],
      nextCursor: null,
    });
  });

  it('paginates with stable global ranks and an opaque cursor', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/leaderboard?limit=2' });
    const firstBody = first.json();
    expect(firstBody.rows.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: 'GET', url: `/api/leaderboard?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({
      rows: [row(3, 'user-3', '云长', 80), row(4, 'user-4', '翼德', 80)],
      nextCursor: null,
    });
  });

  it('returns the authenticated current-user rank', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/leaderboard/me',
      headers: { authorization: `Bearer ${app.jwt.sign({ id: 'user-1' })}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(row(2, 'user-1', '玄德', 100));
  });

  it('returns an unranked result for a user with no validated merit', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/leaderboard/me',
      headers: { authorization: `Bearer ${app.jwt.sign({ id: 'user-5' })}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rank: null, userId: 'user-5', nickname: '仲谋', avatarUrl: null, merit: 0,
    });
  });

  it('rejects malformed cursors and requires auth for /me', async () => {
    const malformed = await app.inject({ method: 'GET', url: '/api/leaderboard?cursor=not-a-cursor' });
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/leaderboard/me' });

    expect(malformed.statusCode).toBe(400);
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('rejects a cursor whose embedded rank was tampered with', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/leaderboard?limit=2' });
    const cursor = first.json().nextCursor;
    const forged = forgeCursor(cursor);

    const response = await app.inject({
      method: 'GET', url: `/api/leaderboard?limit=2&cursor=${encodeURIComponent(forged)}`,
    });

    expect(response.statusCode).toBe(400);
  });

  it('never accepts an anonymous leaderboard cursor as an access token', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/leaderboard?limit=2' });
    const cursor = first.json().nextCursor;

    const response = await app.inject({
      method: 'GET', url: '/api/leaderboard/me',
      headers: { authorization: `Bearer ${cursor}` },
    });

    expect(response.statusCode).toBe(401);
  });
});

function forgeCursor(cursor) {
  if (cursor.includes('.')) {
    const chars = cursor.split('');
    const index = Math.max(0, chars.length - 2);
    chars[index] = chars[index] === 'a' ? 'b' : 'a';
    return chars.join('');
  }
  const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  decoded.rank = 999;
  return Buffer.from(JSON.stringify(decoded)).toString('base64url');
}

function row(rank, userId, nickname, merit) {
  return { rank, userId, nickname, avatarUrl: null, merit };
}

function leaderboardPrisma() {
  const users = [
    user('user-1', '玄德', 100, '2026-08-03T10:00:00.000Z'),
    user('user-2', '孟德', 100, '2026-08-03T09:00:00.000Z'),
    user('user-4', '翼德', 80, '2026-08-03T11:00:00.000Z'),
    user('user-3', '云长', 80, '2026-08-03T11:00:00.000Z'),
    user('user-5', '仲谋', 0, null),
  ];
  return {
    user: {
      async findMany({ where, take }) {
        return users.filter((entry) => matches(entry, where)).sort(compareUsers).slice(0, take);
      },
      async findUnique({ where }) { return users.find((entry) => entry.id === where.id) || null; },
      async count({ where }) { return users.filter((entry) => matches(entry, where)).length; },
    },
  };
}

function user(id, nickname, meritTotal, reachedAt) {
  return {
    id, meritTotal, meritReachedAt: reachedAt ? new Date(reachedAt) : null,
    profile: { nickname, avatarUrl: null },
  };
}

function compareUsers(a, b) {
  return b.meritTotal - a.meritTotal
    || a.meritReachedAt - b.meritReachedAt
    || a.id.localeCompare(b.id);
}

function matches(entry, where = {}) {
  const checks = [];
  if (where.meritTotal !== undefined) {
    if (typeof where.meritTotal === 'number') checks.push(entry.meritTotal === where.meritTotal);
    else {
      if (where.meritTotal.gt !== undefined) checks.push(entry.meritTotal > where.meritTotal.gt);
      if (where.meritTotal.lt !== undefined) checks.push(entry.meritTotal < where.meritTotal.lt);
    }
  }
  if (where.meritReachedAt instanceof Date) checks.push(Boolean(entry.meritReachedAt)
    && entry.meritReachedAt.getTime() === where.meritReachedAt.getTime());
  else if (where.meritReachedAt && where.meritReachedAt.gt) checks.push(entry.meritReachedAt > where.meritReachedAt.gt);
  else if (where.meritReachedAt && where.meritReachedAt.lt) checks.push(entry.meritReachedAt < where.meritReachedAt.lt);
  if (where.id && where.id.gt) checks.push(entry.id > where.id.gt);
  if (where.id && where.id.lt) checks.push(entry.id < where.id.lt);
  if (where.OR) checks.push(where.OR.some((branch) => matches(entry, branch)));
  if (where.AND) checks.push(where.AND.every((branch) => matches(entry, branch)));
  return checks.every(Boolean);
}
