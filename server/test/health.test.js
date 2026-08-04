import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const VALID_ENV = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '3100',
  DATABASE_URL: 'postgresql://wordward:wordward@localhost:5432/wordward_test',
  JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-32-chars',
  REFRESH_TOKEN_PEPPER: 'test-refresh-pepper-with-at-least-32-chars',
};

let app;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('server configuration', () => {
  it('validates and normalizes required environment values', () => {
    expect(loadConfig(VALID_ENV)).toEqual({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 3100,
      databaseUrl: VALID_ENV.DATABASE_URL,
      jwtAccessSecret: VALID_ENV.JWT_ACCESS_SECRET,
      refreshTokenPepper: VALID_ENV.REFRESH_TOKEN_PEPPER,
      appOrigin: null,
    });
  });

  it('rejects missing or unsafe secrets without echoing them', () => {
    expect(() => loadConfig({ ...VALID_ENV, JWT_ACCESS_SECRET: 'short' }))
      .toThrow('JWT_ACCESS_SECRET must be at least 32 characters');
    expect(() => loadConfig({ ...VALID_ENV, DATABASE_URL: '' }))
      .toThrow('DATABASE_URL is required');
    expect(() => loadConfig({ ...VALID_ENV, REFRESH_TOKEN_PEPPER: 'short' }))
      .toThrow('REFRESH_TOKEN_PEPPER must be at least 32 characters');
  });

  it('rejects invalid runtime modes and ports', () => {
    expect(() => loadConfig({ ...VALID_ENV, NODE_ENV: 'staging' }))
      .toThrow('NODE_ENV must be development, test, or production');
    expect(() => loadConfig({ ...VALID_ENV, PORT: '0' }))
      .toThrow('PORT must be an integer between 1 and 65535');
    expect(() => loadConfig({ ...VALID_ENV, PORT: 'not-a-port' }))
      .toThrow('PORT must be an integer between 1 and 65535');
  });

  it('requires one exact HTTPS application origin in production', () => {
    expect(() => loadConfig({ ...VALID_ENV, NODE_ENV: 'production' }))
      .toThrow('APP_ORIGIN is required');
    expect(() => loadConfig({
      ...VALID_ENV, NODE_ENV: 'production', APP_ORIGIN: 'http://game.example.com',
    })).toThrow('APP_ORIGIN must be an HTTPS origin');
    expect(loadConfig({
      ...VALID_ENV, NODE_ENV: 'production', APP_ORIGIN: 'https://game.example.com',
    }).appOrigin).toBe('https://game.example.com');
  });
});

describe('GET /api/health', () => {
  it('reports readiness without exposing configuration or secrets', async () => {
    app = buildApp({ config: loadConfig(VALID_ENV) });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.body).not.toContain(VALID_ENV.JWT_ACCESS_SECRET);
    expect(response.body).not.toContain(VALID_ENV.DATABASE_URL);
  });

  it('trusts forwarded client details only in the production proxy topology', async () => {
    app = buildApp({
      config: loadConfig({
        ...VALID_ENV, NODE_ENV: 'production', APP_ORIGIN: 'https://game.example.com',
      }),
      logger: false,
    });
    app.get('/proxy-probe', async (request) => ({ ip: request.ip, protocol: request.protocol }));

    const response = await app.inject({
      method: 'GET',
      url: '/proxy-probe',
      headers: {
        'x-forwarded-for': '203.0.113.42',
        'x-forwarded-proto': 'https',
      },
    });

    expect(response.json()).toEqual({ ip: '203.0.113.42', protocol: 'https' });
  });

  it('ignores forged forwarding headers from an untrusted remote address', async () => {
    app = buildApp({
      config: loadConfig({
        ...VALID_ENV, NODE_ENV: 'production', APP_ORIGIN: 'https://game.example.com',
      }),
      logger: false,
    });
    app.get('/untrusted-proxy-probe', async (request) => ({
      ip: request.ip, protocol: request.protocol,
    }));

    const response = await app.inject({
      method: 'GET', url: '/untrusted-proxy-probe', remoteAddress: '198.51.100.20',
      headers: { 'x-forwarded-for': '203.0.113.99', 'x-forwarded-proto': 'https' },
    });

    expect(response.json()).toEqual({ ip: '198.51.100.20', protocol: 'http' });
  });

  it('emits credentialed CORS headers only for the configured application origin', async () => {
    app = buildApp({
      config: loadConfig({
        ...VALID_ENV, NODE_ENV: 'production', APP_ORIGIN: 'https://game.example.com',
      }),
      logger: false,
    });

    const allowed = await app.inject({
      method: 'GET', url: '/api/health', headers: { origin: 'https://game.example.com' },
    });
    const denied = await app.inject({
      method: 'GET', url: '/api/health', headers: { origin: 'https://evil.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('https://game.example.com');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(denied.headers['access-control-allow-origin']).toBe('https://game.example.com');
    expect(denied.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});
