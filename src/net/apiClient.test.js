import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  clearSession,
  getAccessToken,
  login,
  logout,
} from './apiClient.js';

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe('API client sessions', () => {
  it('keeps the access token in memory and includes refresh cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      accessToken: 'memory-token', user: { id: 'user-1', username: 'liubei' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await login('liubei', 'correct-horse-123');

    expect(getAccessToken()).toBe('memory-token');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }));
  });

  it('refreshes once on 401 and retries with the new bearer token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ error: 'expired' }, 401))
      .mockResolvedValueOnce(response({ accessToken: 'renewed', user: { id: 'user-1' } }))
      .mockResolvedValueOnce(response({ nickname: '玄德' }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await apiRequest('/api/profile');

    expect(profile).toEqual({ nickname: '玄德' });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer renewed');
  });

  it('coalesces concurrent 401 responses into one refresh rotation', async () => {
    let profileCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation(async (path) => {
      if (path === '/api/auth/refresh') {
        refreshCalls++;
        return response({ accessToken: 'shared-token', user: { id: 'user-1' } });
      }
      profileCalls++;
      if (profileCalls <= 2) return response({ error: 'expired' }, 401);
      return response({ nickname: '玄德' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      apiRequest('/api/profile'),
      apiRequest('/api/profile'),
    ]);

    expect(results).toEqual([{ nickname: '玄德' }, { nickname: '玄德' }]);
    expect(refreshCalls).toBe(1);
    expect(profileCalls).toBe(4);
  });

  it('clears memory tokens and calls logout with credentials included', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ accessToken: 'memory-token', user: { id: 'user-1' } }))
      .mockResolvedValueOnce(response(null, 204));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    await logout();

    expect(getAccessToken()).toBeNull();
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'include' }),
    ]);
  });
});

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}
