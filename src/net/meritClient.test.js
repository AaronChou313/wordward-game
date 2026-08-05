import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, login } from './apiClient.js';
import {
  buildMeritClaim,
  flushMeritClaims,
  queueMeritClaim,
  resetMeritClientForTests,
} from './meritClient.js';
import { getSave, replaceSave } from '../meta/saveData.js';

let storage;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => ({ content: 'test-site-key' })),
    getElementById: vi.fn(() => null),
    createElement: vi.fn(() => ({ id: '', hidden: false, dataset: {} })),
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal('turnstile', {
    render: vi.fn(() => 'test-widget'),
    execute: vi.fn((widgetId, options) => options.callback('test-token')),
    reset: vi.fn(),
  });
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });
  clearSession();
  resetMeritClientForTests();
  replaceSave({ version: 3, merit: { total: 1, claimed: { 'easy:30': true } } }, { sync: false });
});

afterEach(() => {
  clearSession();
  resetMeritClientForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('offline merit claim queue', () => {
  it('builds the approved claim summary and submits it for the current user', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({ awarded: true, merit: 1, meritTotal: 9 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    const payload = battleClaim();

    await queueMeritClaim(payload);

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(payload);
    expect(queueContents()).toEqual([]);
    expect(getSave().merit.total).toBe(9);
  });

  it('does not reduce mature local merit when the verified total is lower', async () => {
    replaceSave({ version: 3, merit: { total: 12, claimed: {} } }, { sync: false });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({ awarded: false, merit: 1, meritTotal: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    await queueMeritClaim(battleClaim());

    expect(getSave().merit.total).toBe(12);
  });

  it('deduplicates offline claims, keeps them pending, and retries after recovery', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValueOnce(response({ awarded: true, merit: 1, meritTotal: 1 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    const payload = battleClaim();

    await queueMeritClaim(payload);
    await queueMeritClaim(payload);
    expect(queueContents()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(queueContents()).toEqual([]);
  });

  it('does not assign an offline battle to an unknown account', async () => {
    const result = await queueMeritClaim(battleClaim());

    expect(result).toEqual({ queued: false, reason: 'not-authenticated' });
    expect(queueContents()).toEqual([]);
  });

  it('preserves another account queue while flushing only the current user', async () => {
    storage.set('sgtd_meritQueue', JSON.stringify([
      { userId: 'user-2', payload: battleClaim({ runId: 'run-user-2' }) },
    ]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({ awarded: true, merit: 1, meritTotal: 1 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await queueMeritClaim(battleClaim());

    await flushMeritClaims();

    expect(queueContents()).toEqual([
      { userId: 'user-2', payload: battleClaim({ runId: 'run-user-2' }) },
    ]);
  });

  it('keeps a claim when authentication expires instead of deleting it as invalid', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({ error: 'expired' }, 401))
      .mockResolvedValueOnce(response({ error: 'Invalid refresh token' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    await queueMeritClaim(battleClaim());

    expect(queueContents()).toHaveLength(1);
  });

  it('keeps a temporarily progression-locked claim for prerequisite retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({
        error: 'Claim progression is not unlocked', code: 'PROGRESSION_LOCKED',
      }, 400));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    await queueMeritClaim(battleClaim({ difficulty: 'normal', runId: 'run-normal' }));

    expect(queueContents()).toHaveLength(1);
  });

  it('continues past a locked claim so a queued prerequisite can unlock it', async () => {
    storage.set('sgtd_meritQueue', JSON.stringify([
      { userId: 'user-1', payload: battleClaim({ difficulty: 'normal', runId: 'run-normal' }) },
    ]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({
        error: 'Claim progression is not unlocked', code: 'PROGRESSION_LOCKED',
      }, 400))
      .mockResolvedValueOnce(response({ awarded: true, merit: 1, meritTotal: 1 }, 201))
      .mockResolvedValueOnce(response({ awarded: true, merit: 2, meritTotal: 3 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    await queueMeritClaim(battleClaim());

    expect(queueContents()).toEqual([]);
  });

  it('flushes queued merit claims after the user logs in', async () => {
    storage.set('sgtd_meritQueue', JSON.stringify([
      { userId: 'user-1', payload: battleClaim({ runId: 'run-queued-offline' }) },
    ]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('user-1'))
      .mockResolvedValueOnce(response({ awarded: true, merit: 1, meritTotal: 9 }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await login('liubei', 'correct-horse-123');
    const result = await flushMeritClaims();

    expect(result).toEqual({ queued: false });
    expect(queueContents()).toEqual([]);
  });
});

function battleClaim(overrides = {}) {
  return buildMeritClaim({
    difficulty: 'easy', endlessFloor: 1, bossWave: 30,
    runId: 'run-user-1', seed: 'seed-user-1',
    startedAt: new Date('2026-08-03T00:00:00.000Z'),
    finishedAt: new Date('2026-08-03T00:05:00.000Z'),
    kills: 100, lordHp: 50,
    ...overrides,
  });
}

function queueContents() {
  return JSON.parse(storage.get('sgtd_meritQueue') || '[]');
}

function sessionResponse(userId) {
  return response({ accessToken: 'memory-token', user: { id: userId, username: 'liubei' } });
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}
