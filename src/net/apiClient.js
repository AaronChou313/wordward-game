let accessToken = null;
let currentUser = null;
let refreshInFlight = null;
let refreshEpoch = null;
let sessionEpoch = 0;

export class ApiError extends Error {
  constructor(status, data) {
    super(data && data.error ? data.error : `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function getCurrentUser() {
  return currentUser;
}

export function clearSession() {
  sessionEpoch++;
  accessToken = null;
  currentUser = null;
}

export async function apiRequest(path, options = {}) {
  const requestEpoch = sessionEpoch;
  const response = await fetch(path, requestOptions(options));
  if (response.status === 401 && options.retry !== false && path !== '/api/auth/refresh') {
    const refreshed = requestEpoch === sessionEpoch && await refreshSession();
    if (refreshed) return apiRequest(path, { ...options, retry: false });
  }
  const data = await responseData(response);
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export async function register(username, password) {
  return establishSession('/api/auth/register', username, password);
}

export async function login(username, password) {
  return establishSession('/api/auth/login', username, password);
}

export async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST', retry: false });
  } finally {
    clearSession();
  }
}

export async function restoreSession() {
  return refreshSession();
}

export function getProfile() {
  return apiRequest('/api/profile');
}

export function updateProfile(profile) {
  return apiRequest('/api/profile', { method: 'PUT', body: profile });
}

async function establishSession(path, username, password) {
  const session = await apiRequest(path, {
    method: 'POST', body: { username, password }, retry: false,
  });
  sessionEpoch++;
  accessToken = session.accessToken;
  currentUser = session.user;
  return session;
}

async function refreshSession() {
  const epoch = sessionEpoch;
  if (refreshInFlight && refreshEpoch === epoch) return refreshInFlight;
  const promise = performRefresh(epoch).finally(() => {
    if (refreshInFlight === promise) {
      refreshInFlight = null;
      refreshEpoch = null;
    }
  });
  refreshInFlight = promise;
  refreshEpoch = epoch;
  return promise;
}

async function performRefresh(epoch) {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (sessionEpoch !== epoch) return false;
    if (!response.ok) {
      clearSession();
      return false;
    }
    const session = await responseData(response);
    if (sessionEpoch !== epoch) return false;
    if (!session || !session.accessToken) throw new Error('Invalid session response');
    accessToken = session.accessToken;
    currentUser = session.user;
    return true;
  } catch {
    if (sessionEpoch === epoch) clearSession();
    return false;
  }
}

function requestOptions(options) {
  const headers = { ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };
}

async function responseData(response) {
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new ApiError(response.status, { error: 'API unavailable' });
  }
}
