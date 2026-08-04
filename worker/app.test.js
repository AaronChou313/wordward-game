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
});
