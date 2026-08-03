import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const TEST_CONFIG = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3100,
  databaseUrl: 'postgresql://unused:unused@localhost:5432/unused',
  jwtAccessSecret: 'test-access-secret-with-at-least-32-chars',
  refreshTokenPepper: 'test-refresh-pepper-with-at-least-32-chars',
};

let app;
let prisma;

beforeEach(() => {
  prisma = createMemoryPrisma();
  app = buildApp({ config: TEST_CONFIG, prisma });
});

afterEach(async () => {
  await app.close();
});

describe('registration', () => {
  it('normalizes usernames and stores only an Argon2id password hash', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: '  ＣａｏＣａｏ  ', password: 'correct-horse-123' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      user: { id: expect.any(String), username: 'caocao' },
    });
    expect(prisma.records.users[0]).toMatchObject({
      username: 'caocao',
      passwordHash: expect.stringMatching(/^\$argon2id\$/),
      profile: { nickname: 'caocao' },
    });
    expect(JSON.stringify(prisma.records.users[0])).not.toContain('correct-horse-123');

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/api/auth');
    expect(prisma.records.refreshTokens[0].tokenHash).not.toBe(cookieValue(setCookie));
  });

  it('enforces normalized username and password length constraints', async () => {
    const attempts = [
      { username: '  ab  ', password: 'correct-horse-123' },
      { username: 'a'.repeat(25), password: 'correct-horse-123' },
      { username: 'valid', password: 'short-123' },
      { username: 'valid', password: 'x'.repeat(129) },
    ];

    for (const payload of attempts) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload });
      expect(response.statusCode).toBe(400);
    }
    expect(prisma.records.users).toHaveLength(0);
  });

  it('rejects a duplicate normalized username', async () => {
    await register(app, 'CaoCao');
    const duplicate = await register(app, '  caocao  ');

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'Username is unavailable' });
  });
});

describe('sessions', () => {
  it('returns the same generic error for unknown users and bad passwords', async () => {
    await register(app, 'liubei');

    const unknown = await login(app, 'missing', 'wrong-password');
    const wrong = await login(app, 'liubei', 'wrong-password');

    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual({ error: 'Invalid username or password' });
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('issues a 15-minute access token and rotates a 30-day refresh token', async () => {
    const registered = await register(app, 'guanyu');
    const firstCookie = cookiePair(registered.headers['set-cookie']);
    const firstRawToken = cookieValue(firstCookie);
    const firstRecord = prisma.records.refreshTokens[0];
    const access = app.jwt.decode(registered.json().accessToken);

    expect(access.exp - access.iat).toBe(15 * 60);
    expect(firstRecord.expiresAt.getTime() - firstRecord.createdAt.getTime())
      .toBe(30 * 24 * 60 * 60 * 1000);

    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: firstCookie },
    });
    const secondCookie = cookiePair(refreshed.headers['set-cookie']);

    expect(refreshed.statusCode).toBe(200);
    expect(cookieValue(secondCookie)).not.toBe(firstRawToken);
    expect(firstRecord.revokedAt).toBeInstanceOf(Date);
    expect(prisma.records.refreshTokens).toHaveLength(2);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: firstCookie },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toEqual({ error: 'Invalid refresh token' });
    expect(replay.headers['set-cookie']).toContain('Max-Age=0');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: secondCookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(prisma.records.refreshTokens[1].revokedAt).toBeInstanceOf(Date);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('decorates authenticated requests with request.user.id', async () => {
    app.get('/test/protected', { onRequest: app.authenticate }, async (request) => ({
      id: request.user.id,
    }));
    const registered = await register(app, 'zhaoyun');

    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: { authorization: `Bearer ${registered.json().accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: registered.json().user.id });
  });

  it('rate limits repeated login attempts', async () => {
    await register(app, 'sunquan');
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      responses.push(await login(app, 'sunquan', 'wrong-password'));
    }

    expect(responses.slice(0, 5).every((response) => response.statusCode === 401)).toBe(true);
    expect(responses[5].statusCode).toBe(429);
  });
});

function register(target, username) {
  return target.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: 'correct-horse-123' },
  });
}

function login(target, username, password) {
  return target.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
}

function cookiePair(setCookie) {
  return setCookie.split(';')[0];
}

function cookieValue(cookie) {
  return cookiePair(cookie).split('=')[1];
}

function createMemoryPrisma() {
  const records = { users: [], refreshTokens: [] };
  let nextUserId = 1;
  let nextTokenId = 1;

  const client = {
    records,
    user: {
      async create({ data }) {
        if (records.users.some((user) => user.username === data.username)) {
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        const user = {
          id: `user-${nextUserId++}`,
          username: data.username,
          passwordHash: data.passwordHash,
          status: 'ACTIVE',
          profile: data.profile && data.profile.create,
        };
        records.users.push(user);
        return user;
      },
      async findUnique({ where }) {
        return records.users.find((user) => (
          where.username ? user.username === where.username : user.id === where.id
        )) || null;
      },
    },
    refreshToken: {
      async create({ data }) {
        const record = { id: `token-${nextTokenId++}`, revokedAt: null, ...data };
        records.refreshTokens.push(record);
        return record;
      },
      async findUnique({ where, include }) {
        const record = records.refreshTokens.find((token) => token.tokenHash === where.tokenHash) || null;
        if (!record || !include || !include.user) return record;
        return { ...record, user: records.users.find((user) => user.id === record.userId) };
      },
      async update({ where, data }) {
        const record = records.refreshTokens.find((token) => token.id === where.id);
        Object.assign(record, data);
        return record;
      },
      async updateMany({ where, data }) {
        const matches = records.refreshTokens.filter((token) => (
          (where.id === undefined || token.id === where.id)
          && (where.tokenHash === undefined || token.tokenHash === where.tokenHash)
          && (where.revokedAt === undefined || token.revokedAt === where.revokedAt)
          && (!where.expiresAt || token.expiresAt > where.expiresAt.gt)
        ));
        matches.forEach((token) => Object.assign(token, data));
        return { count: matches.length };
      },
    },
    async $transaction(callback) {
      return callback(client);
    },
    async $disconnect() {},
  };
  return client;
}
