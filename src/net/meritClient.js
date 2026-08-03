import { loadData, saveData } from '../core/storage.js';
import { getSave, persist } from '../meta/saveData.js';
import { ApiError, apiRequest, getCurrentUser } from './apiClient.js';

const RETRY_DELAY_MS = 5000;

let flushInFlight = null;
let flushOwnerId = null;
let retryTimer = null;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushMeritClaims());
}

export function buildMeritClaim(input) {
  return {
    difficulty: input.difficulty,
    endlessFloor: input.difficulty === 'endless' ? input.endlessFloor : 1,
    bossWave: input.bossWave,
    runId: input.runId,
    seed: input.seed,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    summary: {
      wave: input.bossWave,
      kills: input.kills,
      lordHp: input.lordHp,
    },
  };
}

export async function queueMeritClaim(payload) {
  const user = getCurrentUser();
  if (!user) return { queued: false, reason: 'not-authenticated' };
  const queue = meritQueue();
  const key = claimKey(payload);
  if (!queue.some((entry) => entry.userId === user.id && claimKey(entry.payload) === key)) {
    queue.push({ userId: user.id, payload });
    saveQueue(queue);
  }
  return flushMeritClaims();
}

export function flushMeritClaims() {
  const user = getCurrentUser();
  if (!user) return Promise.resolve({ queued: false, reason: 'not-authenticated' });
  if (flushInFlight) {
    if (flushOwnerId === user.id) return flushInFlight;
    return flushInFlight.then(() => flushMeritClaims());
  }
  flushOwnerId = user.id;
  const promise = drainQueue(user.id).finally(() => {
    if (flushInFlight === promise) {
      flushInFlight = null;
      flushOwnerId = null;
    }
  });
  flushInFlight = promise;
  return promise;
}

export function getLeaderboard(cursor = null, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiRequest('/api/leaderboard?' + params.toString(), { retry: false });
}

export function getMyRank() {
  return apiRequest('/api/leaderboard/me');
}

export function resetMeritClientForTests() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  flushInFlight = null;
  flushOwnerId = null;
}

async function drainQueue(userId) {
  const deferred = new Set();
  while (getCurrentUser() && getCurrentUser().id === userId) {
    const queue = meritQueue();
    const entry = queue.find((candidate) => candidate.userId === userId
      && !deferred.has(claimKey(candidate.payload)));
    if (!entry) {
      if (queue.some((candidate) => candidate.userId === userId)) {
        scheduleRetry();
        return { queued: true };
      }
      return { queued: false };
    }
    try {
      const result = await apiRequest('/api/merit/claims', {
        method: 'POST', body: entry.payload,
      });
      if (!getCurrentUser() || getCurrentUser().id !== userId) return { queued: true };
      removeEntry(userId, claimKey(entry.payload));
      deferred.clear();
      if (Number.isInteger(result.meritTotal)) {
        getSave().merit.total = Math.max(getSave().merit.total, result.meritTotal);
        persist();
      }
    } catch (error) {
      const progressionLocked = error instanceof ApiError
        && error.data && error.data.code === 'PROGRESSION_LOCKED';
      if (progressionLocked) {
        deferred.add(claimKey(entry.payload));
        continue;
      }
      if (error instanceof ApiError && !progressionLocked
        && (error.status === 400 || error.status === 422)) {
        removeEntry(userId, claimKey(entry.payload));
        continue;
      }
      scheduleRetry();
      return { queued: true };
    }
  }
  return { queued: true };
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushMeritClaims();
  }, RETRY_DELAY_MS);
}

function removeEntry(userId, key) {
  saveQueue(meritQueue().filter((entry) => (
    entry.userId !== userId || claimKey(entry.payload) !== key
  )));
}

function meritQueue() {
  const queue = loadData('meritQueue', []);
  return Array.isArray(queue) ? queue : [];
}

function saveQueue(queue) {
  saveData('meritQueue', queue, { notify: false });
}

function claimKey(payload) {
  return [payload.difficulty, payload.endlessFloor, payload.bossWave].join(':');
}
