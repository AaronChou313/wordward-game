import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, login } from './apiClient.js';
import {
  getSyncState,
  resetSaveSyncForTests,
  syncSave,
  uploadLocalSave,
  useCloudSave,
} from './saveSync.js';
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
  resetSaveSyncForTests();
  replaceSave(localSave(300), { sync: false });
});

afterEach(() => {
  clearSession();
  resetSaveSyncForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('resilient cloud save sync', () => {
  it('keeps the local save playable and reports offline when the API is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    const result = await syncSave();

    expect(result.status).toBe('offline');
    expect(getSyncState().status).toBe('offline');
    expect(getSave().gold).toBe(300);
  });

  it('requires an explicit choice the first time both local and cloud saves exist', async () => {
    const cloud = { version: 4, data: cloudSave(900) };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response(cloud));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    const result = await syncSave();

    expect(result).toMatchObject({ status: 'conflict', cloudVersion: 4 });
    expect(getSave().gold).toBe(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uploads the chosen local save at the cloud version without protected merit fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ version: 4, data: cloudSave(900) }))
      .mockResolvedValueOnce(response({ version: 5, data: cloudSave(300) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();

    const result = await uploadLocalSave();

    expect(result.status).toBe('synced');
    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.version).toBe(4);
    expect(body.data.gold).toBe(300);
    expect(body.data).not.toHaveProperty('merit');
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 5 });
  });

  it('replaces local progression only after choosing the cloud save', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ version: 2, data: cloudSave(750) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();

    const result = useCloudSave();

    expect(result.status).toBe('synced');
    expect(getSave().gold).toBe(750);
    expect(getSave().merit).toEqual({ total: 0, claimed: {} });
  });

  it('queues a later local write after establishing the cloud version', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockResolvedValueOnce(response({ version: 1, data: cloudSave(300) }))
      .mockResolvedValueOnce(response({ version: 2, data: cloudSave(425) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();

    replaceSave(localSave(425));
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const queuedBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(queuedBody).toMatchObject({ version: 1, data: { version: 2, gold: 425 } });
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 2 });
  });

  it('serializes an upload with a newer local write and drains the latest snapshot', async () => {
    let resolveFirstQueuedUpload;
    const firstQueuedUpload = new Promise((resolve) => { resolveFirstQueuedUpload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockResolvedValueOnce(response({ version: 1, data: cloudSave(300) }))
      .mockReturnValueOnce(firstQueuedUpload)
      .mockResolvedValueOnce(response({ version: 3, data: cloudSave(500) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();

    replaceSave(localSave(425));
    const first = uploadLocalSave();
    replaceSave(localSave(500));
    const overlapping = uploadLocalSave();
    resolveFirstQueuedUpload(response({ version: 2, data: cloudSave(425) }));
    await Promise.all([first, overlapping]);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({
      version: 1, data: { gold: 425 },
    });
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toMatchObject({
      version: 2, data: { gold: 500 },
    });
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 3 });
  });

  it('keeps a failed write pending and retries it after the network recovers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockResolvedValueOnce(response({ version: 1, data: cloudSave(300) }))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(response({ version: 2, data: cloudSave(425) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();

    replaceSave(localSave(425));
    await vi.advanceTimersByTimeAsync(400);
    expect(getSyncState().status).toBe('offline');

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 2 });
  });

  it('treats JSONB key reordering as the same save without an extra write', async () => {
    storage.set('sgtd_cloudSync', JSON.stringify({ userId: 'user-1', version: 7 }));
    replaceSave({ version: 2, gold: 300, settings: { volume: 80 } }, { sync: false });
    const stored = JSON.parse(storage.get('sgtd_save'));
    delete stored.merit;
    const { version, gold, ...rest } = stored;
    const reorderedCloud = { ...rest, gold, version };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ version: 7, data: reorderedCloud }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    const result = await syncSave();

    expect(result).toMatchObject({ status: 'synced', cloudVersion: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries an initial cloud read after the API comes back', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(response({ version: 3, data: cloudSave(800) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    await syncSave();
    expect(getSyncState().status).toBe('offline');
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getSyncState()).toMatchObject({ status: 'conflict', cloudVersion: 3 });
  });

  it('ignores a delayed cloud response after the signed-in user changes', async () => {
    let resolveOldCloud;
    const oldCloud = new Promise((resolve) => { resolveOldCloud = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockReturnValueOnce(oldCloud)
      .mockResolvedValueOnce(response({
        accessToken: 'user-two-token', user: { id: 'user-2', username: 'caocao' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    const oldSync = syncSave();
    clearSession();
    await login('caocao', 'correct-horse-456');
    resolveOldCloud(response({ version: 8, data: cloudSave(999) }));
    await oldSync;

    expect(getSave().gold).toBe(300);
    expect(storage.get('sgtd_cloudSync')).toBeUndefined();
    expect(getSyncState().status).not.toBe('conflict');
  });

  it('uploads a new local write that happens while the cloud read is pending', async () => {
    let resolveCloudRead;
    const cloudRead = new Promise((resolve) => { resolveCloudRead = resolve; });
    storage.set('sgtd_cloudSync', JSON.stringify({ userId: 'user-1', version: 7 }));
    replaceSave(localSave(300), { sync: false });
    const oldCloud = JSON.parse(storage.get('sgtd_save'));
    delete oldCloud.merit;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockReturnValueOnce(cloudRead)
      .mockResolvedValueOnce(response({ version: 8, data: cloudSave(400) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    const syncing = syncSave();
    replaceSave(localSave(400));
    resolveCloudRead(response({ version: 7, data: oldCloud }));
    await syncing;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      version: 7, data: { gold: 400 },
    });
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 8 });
  });

  it('drains the new account after an old account upload finishes late', async () => {
    let resolveOldUpload;
    const oldUpload = new Promise((resolve) => { resolveOldUpload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockReturnValueOnce(oldUpload)
      .mockResolvedValueOnce(response({
        accessToken: 'user-two-token', user: { id: 'user-2', username: 'caocao' },
      }))
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockResolvedValueOnce(response({ version: 1, data: cloudSave(300) }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    const oldSync = syncSave();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    clearSession();
    await login('caocao', 'correct-horse-456');
    const newSync = syncSave();
    resolveOldUpload(response({ version: 1, data: cloudSave(300) }));
    await Promise.all([oldSync, newSync]);

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(JSON.parse(fetchMock.mock.calls[5][1].body).version).toBe(0);
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 1 });
    expect(JSON.parse(storage.get('sgtd_cloudSync'))).toMatchObject({
      userId: 'user-2', version: 1, dirty: false,
    });
  });

  it('coalesces concurrent sync reads so an old GET cannot create a false conflict', async () => {
    let resolveSecondRead;
    const secondRead = new Promise((resolve) => { resolveSecondRead = resolve; });
    storage.set('sgtd_cloudSync', JSON.stringify({ userId: 'user-1', version: 1 }));
    replaceSave(localSave(400), { sync: false });
    let getCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (path, options = {}) => {
      if (path === '/api/auth/login') return sessionResponse();
      if ((options.method || 'GET') === 'GET') {
        getCount++;
        if (getCount === 2) return secondRead;
        return response({ version: 1, data: cloudSave(300) });
      }
      return response({ version: 2, data: cloudSave(400) });
    });
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');

    const first = syncSave();
    const concurrent = syncSave();
    await first;
    resolveSecondRead(response({ version: 1, data: cloudSave(300) }));
    await concurrent;

    expect(getCount).toBe(1);
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 2 });
  });

  it('waits for an in-flight upload before reading the same account cloud save', async () => {
    let resolveQueuedUpload;
    let latestCloud;
    const queuedUpload = new Promise((resolve) => { resolveQueuedUpload = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockResolvedValueOnce(response({ version: 1, data: cloudSave(300) }))
      .mockReturnValueOnce(queuedUpload)
      .mockImplementationOnce(async () => response({ version: 2, data: latestCloud }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();
    replaceSave(localSave(425));
    latestCloud = JSON.parse(storage.get('sgtd_save'));
    delete latestCloud.merit;

    const uploading = uploadLocalSave();
    const syncing = syncSave();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    resolveQueuedUpload(response({ version: 2, data: cloudSave(425) }));
    await Promise.all([uploading, syncing]);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 2 });
  });

  it('re-reads when a queued upload overtakes an already pending cloud read', async () => {
    vi.useFakeTimers();
    let resolveOldRead;
    const oldRead = new Promise((resolve) => { resolveOldRead = resolve; });
    let latestCloud;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(response({ error: 'Cloud save not found' }, 404))
      .mockResolvedValueOnce(response({ version: 1, data: cloudSave(300) }))
      .mockReturnValueOnce(oldRead)
      .mockResolvedValueOnce(response({ version: 2, data: cloudSave(425) }))
      .mockImplementationOnce(async () => response({ version: 2, data: latestCloud }));
    vi.stubGlobal('fetch', fetchMock);
    await login('liubei', 'correct-horse-123');
    await syncSave();

    replaceSave(localSave(425));
    latestCloud = JSON.parse(storage.get('sgtd_save'));
    delete latestCloud.merit;
    const syncing = syncSave();
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    resolveOldRead(response({ version: 1, data: cloudSave(300) }));
    await syncing;

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(getSyncState()).toMatchObject({ status: 'synced', cloudVersion: 2 });
  });
});

function localSave(gold) {
  return { version: 2, gold, merit: { total: 99, claimed: { 'easy:30': true } } };
}

function cloudSave(gold) {
  return { version: 2, gold };
}

function sessionResponse() {
  return response({
    accessToken: 'memory-token', user: { id: 'user-1', username: 'liubei' },
  });
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}
