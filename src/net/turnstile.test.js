import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Turnstile browser adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads the public site key before executing an invisible challenge', async () => {
    const container = { id: '', hidden: false, dataset: {} };
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => null),
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => container),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ turnstileSiteKey: 'preview-site-key' }), { status: 200 })));
    const render = vi.fn(() => 'widget-1');
    const execute = vi.fn((widgetId, options) => options.callback('challenge-token'));
    vi.stubGlobal('turnstile', { render, execute, reset: vi.fn() });
    const { getTurnstileToken } = await import('./turnstile.js');

    await expect(getTurnstileToken('register')).resolves.toBe('challenge-token');
    expect(fetch).toHaveBeenCalledWith('/api/config', { credentials: 'same-origin' });
    expect(render).toHaveBeenCalledWith(container, {
      sitekey: 'preview-site-key', size: 'invisible', action: 'register',
    });
  });
});
