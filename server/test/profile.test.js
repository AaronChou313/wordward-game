import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const config = {
  nodeEnv: 'test', host: '127.0.0.1', port: 3100,
  databaseUrl: 'postgresql://unused',
  jwtAccessSecret: 'test-access-secret-with-at-least-32-chars',
  refreshTokenPepper: 'test-refresh-pepper-with-at-least-32-chars',
};

let app;
let profiles;

beforeEach(async () => {
  profiles = new Map([
    ['user-1', { userId: 'user-1', nickname: '玄德', avatarUrl: null, bio: '汉室宗亲' }],
    ['user-2', { userId: 'user-2', nickname: '孟德', avatarUrl: null, bio: '治世能臣' }],
  ]);
  const prisma = {
    profile: {
      async findUnique({ where }) { return profiles.get(where.userId) || null; },
      async update({ where, data }) {
        const profile = { ...profiles.get(where.userId), ...data };
        profiles.set(where.userId, profile);
        return profile;
      },
    },
  };
  app = buildApp({ config, prisma });
  await app.ready();
});

afterEach(async () => app.close());

describe('profile API', () => {
  it('reads only the authenticated user profile', async () => {
    const response = await request('GET', '/api/profile', 'user-1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      nickname: '玄德', avatarUrl: null, bio: '汉室宗亲',
    });
  });

  it('updates only the authenticated user profile', async () => {
    const response = await request('PUT', '/api/profile', 'user-1', {
      nickname: '刘玄德',
      avatarUrl: 'https://example.com/liubei.png',
      bio: '仁德之主',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      nickname: '刘玄德', avatarUrl: 'https://example.com/liubei.png', bio: '仁德之主',
    });
    expect(profiles.get('user-2')).toMatchObject({ nickname: '孟德', bio: '治世能臣' });
  });

  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/profile' });
    expect(response.statusCode).toBe(401);
  });

  it('enforces nickname, bio, and HTTPS avatar constraints', async () => {
    const invalid = [
      { nickname: '', avatarUrl: null, bio: '' },
      { nickname: '名'.repeat(25), avatarUrl: null, bio: '' },
      { nickname: '玄德', avatarUrl: null, bio: '文'.repeat(201) },
      { nickname: '玄德', avatarUrl: 'http://example.com/avatar.png', bio: '' },
      { nickname: '玄德', avatarUrl: 'https://', bio: '' },
    ];

    for (const payload of invalid) {
      const response = await request('PUT', '/api/profile', 'user-1', payload);
      expect(response.statusCode).toBe(400);
    }
  });
});

function request(method, url, userId, payload) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${app.jwt.sign({ id: userId })}` },
    payload,
  });
}
