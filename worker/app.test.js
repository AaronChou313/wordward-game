import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('worker shell', () => {
  it('serves health and JSON API 404s', async () => {
    const app = createApp({ env: { APP_ORIGIN: 'http://localhost:8787' }, ctx: {} });
    const health = await app.request('http://localhost:8787/api/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    const missing = await app.request('http://localhost:8787/api/missing');
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe('API route not found');
  });

  it('exposes only the public Turnstile site key', async () => {
    const app = createApp({ env: { TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret-key' }, ctx: {} });
    const response = await app.request('https://wordward.example/api/config');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ turnstileSiteKey: 'site-key' });
  });
});
