import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { normalizeProfile } from './routes.js';
import { signAccessToken } from '../../security/jwt.js';

function envWithDb(db) {
  return { APP_ORIGIN: 'https://wordward.example', JWT_ACCESS_SECRET: 'jwt', REFRESH_TOKEN_PEPPER: 'pepper', DB: db };
}

function profileDb({ userId = 'u1', profile = { nickname: 'Alice', avatar_url: null, bio: '' } } = {}) {
  const users = new Map([[userId, { id: userId, username: 'alice', status: 'ACTIVE' }]]);
  const profiles = new Map(profile ? [[userId, { user_id: userId, ...profile }]] : []);
  return {
    profiles,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM users')) return users.get(params[0]) || null;
              if (sql.includes('FROM profiles')) return profiles.get(params[0]) || null;
              return null;
            },
            async run() {
              if (sql.startsWith('UPDATE profiles')) {
                const [nickname, avatarUrl, bio, updatedAt, id] = params;
                if (!profiles.has(id)) return { meta: { changes: 0 } };
                profiles.set(id, { user_id: id, nickname, avatar_url: avatarUrl, bio, updated_at: updatedAt });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };
}

async function authHeader() {
  return `Bearer ${await signAccessToken({ id: 'u1', username: 'alice' }, 'jwt')}`;
}

describe('profile route helpers', () => {
  it('trims fields and canonicalizes valid HTTPS avatar URLs', () => {
    expect(normalizeProfile({ nickname: '  名称  ', avatarUrl: 'https://example.com/a.png', bio: '  介绍  ' })).toEqual({
      nickname: '名称', avatarUrl: 'https://example.com/a.png', bio: '介绍',
    });
  });

  it('rejects invalid profile lengths and non-HTTPS avatars', () => {
    expect(normalizeProfile({ nickname: '', avatarUrl: null, bio: '' })).toBeNull();
    expect(normalizeProfile({ nickname: '名'.repeat(25), avatarUrl: null, bio: '' })).toBeNull();
    expect(normalizeProfile({ nickname: '名', avatarUrl: null, bio: '文'.repeat(201) })).toBeNull();
    expect(normalizeProfile({ nickname: '名', avatarUrl: 'http://example.com/a', bio: '' })).toBeNull();
    expect(normalizeProfile({ nickname: '名', avatarUrl: 'https://', bio: '' })).toBeNull();
  });
});

describe('profile routes', () => {
  it('protects profile reads and returns the public profile shape', async () => {
    const db = profileDb();
    const app = createApp({ env: envWithDb(db), ctx: {} });
    expect((await app.request('https://wordward.example/api/profile')).status).toBe(401);
    const response = await app.request('https://wordward.example/api/profile', { headers: { Authorization: await authHeader() } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ nickname: 'Alice', avatarUrl: null, bio: '' });
  });

  it('updates a profile and returns 404 when the profile is missing', async () => {
    const db = profileDb();
    const app = createApp({ env: envWithDb(db), ctx: {} });
    const response = await app.request('https://wordward.example/api/profile', {
      method: 'PUT', headers: { Authorization: await authHeader(), Origin: 'https://wordward.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: '  Bob ', avatarUrl: 'https://example.com/bob', bio: ' hi ' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ nickname: 'Bob', avatarUrl: 'https://example.com/bob', bio: 'hi' });

    const missingDb = profileDb({ profile: null });
    const missingApp = createApp({ env: envWithDb(missingDb), ctx: {} });
    const missing = await missingApp.request('https://wordward.example/api/profile', { headers: { Authorization: await authHeader() } });
    expect(missing.status).toBe(404);
  });
});
