import { loadData, saveData, subscribeDataSaves } from '../core/storage.js';
import { getSave, replaceSave } from '../meta/saveData.js';
import { ApiError, apiRequest, getCurrentUser } from './apiClient.js';

const SYNC_DELAY_MS = 400;
const RETRY_DELAY_MS = 5000;

let syncState = { status: 'offline', cloudVersion: null };
let pendingCloud = null;
let pendingCloudUserId = null;
let queuedTimer = null;
let retryTimer = null;
let syncInFlight = null;
let syncOwnerId = null;
let uploadInFlight = null;
let uploadOwnerId = null;
let localRevision = 0;
let listeners = new Set();

subscribeDataSaves((key) => {
  if (key !== 'save') return;
  queueCloudUpload();
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => retryPendingUpload());
}

export function getSyncState() {
  return { ...syncState };
}

export function subscribeSyncState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function syncSave() {
  const user = getCurrentUser();
  if (!user) return Promise.resolve(setState('offline', null));
  if (syncInFlight) {
    if (syncOwnerId === user.id) return syncInFlight;
    return syncInFlight.then(() => syncSave());
  }
  syncOwnerId = user.id;
  const promise = runSyncSave(user).finally(() => {
    if (syncInFlight === promise) {
      syncInFlight = null;
      syncOwnerId = null;
    }
  });
  syncInFlight = promise;
  return promise;
}

async function runSyncSave(user, staleReads = 0) {
  if (pendingCloudUserId && pendingCloudUserId !== user.id) clearPendingCloud();
  if (uploadInFlight) {
    await uploadInFlight;
    if (!isCurrentUser(user.id)) return getSyncState();
    if (pendingCloud && pendingCloudUserId === user.id) return getSyncState();
  }
  setState('syncing', syncState.cloudVersion);

  const storedLocal = loadData('save', null);
  const readRevision = localRevision;
  try {
    const cloud = await apiRequest('/api/save');
    if (!isCurrentUser(user.id)) return getSyncState();
    const metadata = syncMetadata(user.id);

    if (!storedLocal) {
      pendingCloud = cloud;
      pendingCloudUserId = user.id;
      return useCloudSave();
    }
    if (metadata && metadata.version > cloud.version && staleReads < 1) {
      return runSyncSave(user, staleReads + 1);
    }
    if (!metadata || metadata.version !== cloud.version) {
      pendingCloud = cloud;
      pendingCloudUserId = user.id;
      return setState('conflict', cloud.version);
    }
    if (localRevision !== readRevision) {
      if (!metadata.dirty) saveSyncMetadata(user.id, metadata.version, true);
      return startUploadDrain();
    }
    if (sameSave(storedLocal, cloud.data)) {
      clearPendingCloud();
      saveSyncMetadata(user.id, cloud.version, false);
      return setState('synced', cloud.version);
    }
    markDirty(user.id, metadata.version);
    return startUploadDrain();
  } catch (error) {
    if (!isCurrentUser(user.id)) return getSyncState();
    if (error instanceof ApiError && error.status === 404) {
      markDirty(user.id, 0);
      return startUploadDrain();
    }
    const metadata = syncMetadata(user.id);
    scheduleRetry();
    return setState('offline', metadata ? metadata.version : null);
  }
}

export function uploadLocalSave(expectedVersion) {
  const user = getCurrentUser();
  if (!user) return Promise.resolve(setState('offline', null));
  const metadata = syncMetadata(user.id);
  const version = expectedVersion
    ?? (pendingCloud && pendingCloudUserId === user.id ? pendingCloud.version : null)
    ?? (metadata ? metadata.version : 0);
  clearPendingCloud();
  if (!metadata || !metadata.dirty || metadata.version !== version) {
    markDirty(user.id, version);
  }
  clearScheduledUpload();
  return startUploadDrain();
}

export function useCloudSave() {
  const user = getCurrentUser();
  if (!user || !pendingCloud || pendingCloudUserId !== user.id) return getSyncState();
  const cloud = pendingCloud;
  replaceSave(cloud.data, { sync: false });
  saveSyncMetadata(user.id, cloud.version, false);
  clearPendingCloud();
  return setState('synced', cloud.version);
}

export function resetSaveSyncForTests() {
  clearScheduledUpload();
  clearPendingCloud();
  syncInFlight = null;
  syncOwnerId = null;
  uploadInFlight = null;
  uploadOwnerId = null;
  localRevision = 0;
  syncState = { status: 'offline', cloudVersion: null };
  listeners = new Set();
}

function queueCloudUpload() {
  const user = getCurrentUser();
  if (!user) return;
  if (pendingCloudUserId && pendingCloudUserId !== user.id) clearPendingCloud();
  if (pendingCloud || syncState.status === 'conflict') return;
  localRevision++;
  const metadata = syncMetadata(user.id);
  if (!metadata) return;
  saveSyncMetadata(user.id, metadata.version, true);
  if (queuedTimer) clearTimeout(queuedTimer);
  queuedTimer = setTimeout(() => {
    queuedTimer = null;
    startUploadDrain();
  }, SYNC_DELAY_MS);
}

function retryPendingUpload() {
  const user = getCurrentUser();
  if (!user) return;
  if (pendingCloudUserId && pendingCloudUserId !== user.id) clearPendingCloud();
  if (pendingCloud || syncState.status === 'conflict') return;
  const metadata = syncMetadata(user.id);
  if (metadata && metadata.dirty) startUploadDrain();
  else if (syncState.status === 'offline') syncSave();
}

function startUploadDrain() {
  const user = getCurrentUser();
  if (!user) return Promise.resolve(setState('offline', null));
  if (uploadInFlight) {
    if (uploadOwnerId === user.id) return uploadInFlight;
    return uploadInFlight.then(() => startUploadDrain());
  }
  uploadOwnerId = user.id;
  uploadInFlight = drainUploads().finally(() => {
    uploadInFlight = null;
    uploadOwnerId = null;
  });
  return uploadInFlight;
}

async function drainUploads() {
  const user = getCurrentUser();
  if (!user) return setState('offline', null);

  while (true) {
    if (!isCurrentUser(user.id)) return getSyncState();
    const metadata = syncMetadata(user.id);
    if (!metadata || !metadata.dirty) {
      return setState('synced', metadata ? metadata.version : null);
    }
    const revision = localRevision;
    setState('syncing', metadata.version);

    try {
      const cloud = await apiRequest('/api/save', {
        method: 'PUT',
        body: { version: metadata.version, data: cloudSafeSave(localSnapshot()) },
      });
      if (!isCurrentUser(user.id)) return getSyncState();
      const stillDirty = localRevision !== revision;
      saveSyncMetadata(user.id, cloud.version, stillDirty);
      if (!stillDirty) return setState('synced', cloud.version);
    } catch (error) {
      if (!isCurrentUser(user.id)) return getSyncState();
      if (error instanceof ApiError && error.status === 409) {
        pendingCloud = (error.data && error.data.current) || { version: 0, data: null };
        pendingCloudUserId = user.id;
        return setState('conflict', pendingCloud.version);
      }
      saveSyncMetadata(user.id, metadata.version, true);
      scheduleRetry();
      return setState('offline', metadata.version);
    }
  }
}

function markDirty(userId, version) {
  localRevision++;
  saveSyncMetadata(userId, version, true);
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryPendingUpload();
  }, RETRY_DELAY_MS);
}

function clearScheduledUpload() {
  if (queuedTimer) clearTimeout(queuedTimer);
  if (retryTimer) clearTimeout(retryTimer);
  queuedTimer = null;
  retryTimer = null;
}

function clearPendingCloud() {
  pendingCloud = null;
  pendingCloudUserId = null;
}

function isCurrentUser(userId) {
  const user = getCurrentUser();
  return Boolean(user && user.id === userId);
}

function localSnapshot() {
  return loadData('save', null) || getSave();
}

function cloudSafeSave(save) {
  const copy = JSON.parse(JSON.stringify(save));
  delete copy.merit;
  return copy;
}

function sameSave(local, cloud) {
  return JSON.stringify(canonical(cloudSafeSave(local))) === JSON.stringify(canonical(cloud));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function syncMetadata(userId) {
  const metadata = loadData('cloudSync', null);
  return metadata && metadata.userId === userId ? metadata : null;
}

function saveSyncMetadata(userId, version, dirty) {
  saveData('cloudSync', { userId, version, dirty }, { notify: false });
}

function setState(status, cloudVersion) {
  syncState = { status, cloudVersion };
  for (const listener of listeners) listener(getSyncState());
  return getSyncState();
}
