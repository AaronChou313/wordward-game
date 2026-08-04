import { describe, expect, it, vi } from 'vitest';
import { parseCredentials } from './schemas.js';
import { createApp } from '../../app.js';
import { authenticateUser, rotateRefreshToken } from './service.js';
import { signAccessToken } from '../../security/jwt.js';

describe('Worker authentication schemas', () => {
  it('accepts credentials and preserves the Turnstile token', () => {
    expect(parseCredentials({ username: ' Alice ', password: 'correct horse', turnstileToken: 'ts' })).toEqual({
      username: ' Alice ', password: 'correct horse', turnstileToken: 'ts',
    });
  });

  it('rejects unknown or malformed fields', () => {
    expect(() => parseCredentials({ username: 'alice', password: 'correct horse', extra: true })).toThrow();
    expect(() => parseCredentials(null)).toThrow();
  });

  it('maps unavailable Turnstile to a stable 503', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const env = { JWT_ACCESS_SECRET: 'jwt', REFRESH_TOKEN_PEPPER: 'pepper', TURNSTILE_SECRET_KEY: 'turnstile', DB: {} };
    await expect(authenticateUser(env, { username: 'alice', password: 'correct horse', turnstileToken: 'token' }, new Request('https://x'))).rejects.toMatchObject({ status: 503, code: 'AUTH_UNAVAILABLE' });
    vi.stubGlobal('fetch', originalFetch);
  });

  it('fails closed when authentication secrets are missing', async () => {
    await expect(authenticateUser({ DB: {} }, { username: 'alice', password: 'correct horse', turnstileToken: '' }, new Request('https://x'))).rejects.toMatchObject({ status: 503, code: 'CONFIGURATION_ERROR' });
  });

  it('maps protected-route D1 outages to 503', async () => {
    const token = await signAccessToken({ id: 'u1', username: 'alice' }, 'jwt');
    const c = {
      env: { JWT_ACCESS_SECRET: 'jwt', REFRESH_TOKEN_PEPPER: 'pepper', DB: { prepare() { throw new Error('database unavailable'); } } },
      req: { header(name) { return name === 'Authorization' ? `Bearer ${token}` : ''; } },
      json(body, status) { return { body, status }; },
    };
    const { requireAuth } = await import('./routes.js');
    await expect(requireAuth(c, async () => {})).resolves.toMatchObject({ status: 503, body: { code: 'D1_UNAVAILABLE' } });
  });

  it('clears logout cookie when D1 revocation fails', async () => {
    const app = createApp({ env: { APP_ORIGIN: 'https://wordward.example', REFRESH_TOKEN_PEPPER: 'pepper', DB: { prepare() { throw new Error('offline'); } } }, ctx: {} });
    const response = await app.request('https://wordward.example/api/auth/logout', { method: 'POST', headers: { Origin: 'https://wordward.example', Cookie: 'wordward_refresh=abc' } });
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(await response.json()).toEqual({ error: 'Authentication unavailable', code: 'D1_UNAVAILABLE' });
  });

  it('accepts one refresh rotation and rejects replay', async () => {
    const state = { revoked: false };
    const current = { id: 'r1', user_id: 'u1', token_hash: '', revoked_at: null, rotated_to_id: null, expires_at: Date.now() + 100000, status: 'ACTIVE', username: 'alice', merit_total: 0, merit_reached_at: null, password_hash: '', password_salt: '', password_kdf: 'v1', password_iterations: 1000, user_created_at: 1, user_updated_at: 1 };
    const db = { prepare(sql) { return { bind() { return { first: async () => (state.revoked ? { ...current, revoked_at: Date.now() } : current), run: async () => ({ meta: { changes: 1 } }) }; } }; }, batch: async () => { state.revoked = true; return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]; } };
    const first = await rotateRefreshToken(db, 'token', 'pepper');
    expect(first.token.token).toBeTruthy();
    await expect(rotateRefreshToken(db, 'token', 'pepper')).rejects.toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' });
  });

  it('allows exactly one concurrent refresh rotation and rejects the race loser', async () => {
    const state = { revoked: false };
    const current = { id: 'r1', user_id: 'u1', token_hash: '', revoked_at: null, rotated_to_id: null, expires_at: Date.now() + 100000, status: 'ACTIVE', username: 'alice', merit_total: 0, merit_reached_at: null, password_hash: '', password_salt: '', password_kdf: 'v1', password_iterations: 1000, user_created_at: 1, user_updated_at: 1 };
    const db = {
      prepare() {
        return { bind() { return { first: async () => (state.revoked ? { ...current, revoked_at: Date.now() } : current), run: async () => ({ meta: { changes: 0 } }) }; } };
      },
      batch: async () => {
        if (state.revoked) return [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
        state.revoked = true;
        return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
      },
    };
    const results = await Promise.allSettled([
      rotateRefreshToken(db, 'token', 'pepper'),
      rotateRefreshToken(db, 'token', 'pepper'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ status: 401, code: 'INVALID_REFRESH_TOKEN' });
  });
});
