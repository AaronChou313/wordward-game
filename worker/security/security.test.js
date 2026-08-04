import { describe, expect, it, vi } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from './encoding.js';
import { hashCursor, hashRefreshToken } from './hmac.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';
import { clearRefreshCookie, setRefreshCookie } from './cookies.js';
import { hashPassword, normalizeUsername, validateCredentials, verifyPassword } from './password.js';
import { verifyTurnstile } from './turnstile.js';
import { requireSameOrigin } from '../middleware/origin.js';
import { consumeLimit } from '../middleware/limits.js';

describe('Worker security primitives', () => {
  it('normalizes usernames and enforces credential lengths', () => {
    expect(normalizeUsername('  Ａlice  ')).toBe('alice');
    expect(validateCredentials(' Alice ', '1234567890')).toEqual({ username: 'alice', password: '1234567890' });
    expect(() => validateCredentials('ab', '1234567890')).toThrow(/Username/);
    expect(() => validateCredentials('alice', 'short')).toThrow(/Password/);
    expect(() => validateCredentials('alice', 'x'.repeat(129))).toThrow(/Password/);
  });

  it('hashes and verifies passwords with unique salts', async () => {
    const first = await hashPassword('correct horse', { iterations: 1000, version: 'v1' });
    const second = await hashPassword('correct horse', { iterations: 1000, version: 'v1' });
    expect(first.salt).not.toBe(second.salt);
    expect(await verifyPassword('correct horse', first)).toBe(true);
    expect(await verifyPassword('wrong horse', first)).toBe(false);
    expect(await verifyPassword('correct horse', { ...first, hash: first.hash.slice(0, -2) })).toBe(false);
  });

  it('round-trips base64url without Node Buffer', () => {
    const encoded = encodeBase64Url('✓ worker');
    expect(decodeBase64Url(encoded, true)).toBe('✓ worker');
  });

  it('signs and verifies HS256 access tokens', async () => {
    const now = 1_700_000_000;
    const token = await signAccessToken({ id: 'u1', username: 'alice' }, 'secret', now, 60);
    expect(await verifyAccessToken(token, 'secret', now + 30)).toMatchObject({ id: 'u1', username: 'alice', iat: now, exp: now + 60 });
    await expect(verifyAccessToken(token, 'secret', now + 60)).rejects.toThrow(/expired/i);
    await expect(verifyAccessToken(`${token.slice(0, -1)}x`, 'secret', now)).rejects.toThrow();
    await expect(verifyAccessToken('not.a.jwt', 'secret', now)).rejects.toThrow();
    const badHeader = `${encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${token.split('.')[1]}.${token.split('.')[2]}`;
    await expect(verifyAccessToken(badHeader, 'secret', now)).rejects.toThrow(/algorithm/i);
  });

  it('creates signed refresh and cursor hashes', async () => {
    expect(await hashRefreshToken('token', 'pepper')).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCursor({ id: 'u1', score: 2 }, 'cursor-secret')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('sets and clears the refresh cookie attributes', () => {
    const headers = new Headers();
    setRefreshCookie(headers, 'abc');
    expect(headers.get('Set-Cookie')).toBe('wordward_refresh=abc; Max-Age=2592000; Path=/api/auth; HttpOnly; Secure; SameSite=Lax');
    clearRefreshCookie(headers);
    expect(headers.get('Set-Cookie')).toBe('wordward_refresh=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax');
  });

  it('accepts same-origin state changes and rejects cross-origin API requests', () => {
    const env = { APP_ORIGIN: 'https://wordward.example' };
    expect(requireSameOrigin(new Request('https://wordward.example/api/save', { method: 'POST', headers: { Origin: env.APP_ORIGIN } }), env)).toBeNull();
    const rejected = requireSameOrigin(new Request('https://wordward.example/api/save', { method: 'POST', headers: { Origin: 'https://evil.example' } }), env);
    expect(rejected).toBeInstanceOf(Response);
    expect(rejected.status).toBe(403);
  });

  it('verifies Turnstile and maps upstream errors', async () => {
    const request = new Request('https://wordward.example/api/auth/login', { headers: { 'CF-Connecting-IP': '203.0.113.4' } });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await verifyTurnstile('token', request, 'secret', fetchImpl)).toEqual({ ok: true, reason: 'ok' });
    expect(fetchImpl.mock.calls[0][0]).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(await verifyTurnstile('token', request, 'secret', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 })))).toEqual({ ok: false, reason: 'invalid' });
    expect(await verifyTurnstile('token', request, 'secret', vi.fn().mockRejectedValue(new Error('offline')))).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('consumes rate limits and allows absent bindings', async () => {
    expect(await consumeLimit(undefined, 'x')).toEqual({ allowed: true });
    expect(await consumeLimit({ limit: vi.fn().mockResolvedValue({ success: true }) }, 'x')).toEqual({ allowed: true });
    expect(await consumeLimit({ limit: vi.fn().mockResolvedValue({ success: false }) }, 'x')).toEqual({ allowed: false });
  });
});
