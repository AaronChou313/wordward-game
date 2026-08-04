import { first, batch, run } from '../../db/queries.js';
import { D1ConflictError } from '../../db/errors.js';
import { toPublicUser, toUser } from '../../db/rows.js';
import { hashRefreshToken, requireSecret } from '../../security/hmac.js';
import {
  DEFAULT_PASSWORD_ITERATIONS,
  PASSWORD_KDF_VERSION,
  hashPassword,
  validateCredentials,
  verifyPassword,
} from '../../security/password.js';
import { consumeLimit } from '../../middleware/limits.js';
import { verifyTurnstile } from '../../security/turnstile.js';
import { bytesToBase64Url } from '../../security/encoding.js';

export const ACCESS_TOKEN_TTL = 900;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function requireAuthSecrets(env) {
  requireSecret(env?.JWT_ACCESS_SECRET);
  requireSecret(env?.REFRESH_TOKEN_PEPPER);
}

export class AuthError extends Error {
  constructor(message, status = 400, code = undefined) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

function nowMs(now) {
  return now instanceof Date ? now.getTime() : Number(now ?? Date.now());
}

function configuredIterations(env) {
  const value = Number(env?.PASSWORD_KDF_ITERATIONS ?? DEFAULT_PASSWORD_ITERATIONS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PASSWORD_ITERATIONS;
}

function configuredVersion(env) {
  return env?.PASSWORD_KDF_VERSION || PASSWORD_KDF_VERSION;
}

function requestIp(request) {
  return request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

async function verifyChallenge(env, input, request) {
  const result = await verifyTurnstile(input.turnstileToken, request, env?.TURNSTILE_SECRET_KEY);
  if (!result.ok) {
    if (result.reason === 'unavailable') throw new AuthError('Authentication unavailable', 503, 'AUTH_UNAVAILABLE');
    throw new AuthError('Verification failed', 403, 'TURNSTILE_FAILED');
  }
}

function publicUser(row) {
  return toPublicUser(toUser(row) || row);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

export async function createRefreshToken(db, userId, pepper, now = Date.now()) {
  if (!db || !userId) throw new TypeError('db and userId are required');
  requireSecret(pepper);
  const createdAt = nowMs(now);
  const token = randomToken();
  const id = crypto.randomUUID();
  await run(db, 'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', id, userId, await hashRefreshToken(token, pepper), createdAt + REFRESH_TOKEN_TTL_MS, createdAt);
  return { token, id };
}

export async function registerUser(env, input, request) {
  requireAuthSecrets(env);
  const { username, password, turnstileToken } = input || {};
  let credentials;
  try { credentials = validateCredentials(username, password); } catch (error) {
    throw new AuthError(error.message, error.status || 400);
  }
  const registrationLimit = await consumeLimit(env?.REGISTER_LIMIT, requestIp(request));
  if (!registrationLimit.allowed) throw new AuthError('Too many requests', 429, 'RATE_LIMITED');
  await verifyChallenge(env, { ...credentials, turnstileToken }, request);
  const passwordRecord = await hashPassword(credentials.password, { iterations: configuredIterations(env), version: configuredVersion(env) });
  const now = Date.now();
  const userId = crypto.randomUUID();
  const refresh = { token: randomToken(), id: crypto.randomUUID() };
  const tokenHash = await hashRefreshToken(refresh.token, env.REFRESH_TOKEN_PEPPER);
  try {
    await batch(env.DB, [
      { sql: 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, status, merit_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params: [userId, credentials.username, passwordRecord.hash, passwordRecord.salt, passwordRecord.version, passwordRecord.iterations, 'ACTIVE', 0, now, now] },
      { sql: 'INSERT INTO profiles (user_id, nickname, avatar_url, bio, updated_at) VALUES (?, ?, ?, ?, ?)', params: [userId, credentials.username, null, '', now] },
      { sql: 'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', params: [refresh.id, userId, tokenHash, now + REFRESH_TOKEN_TTL_MS, now] },
    ]);
  } catch (error) {
    if (error instanceof D1ConflictError && error.constraint === 'users.username') throw new AuthError('Username is unavailable', 409, 'USERNAME_UNAVAILABLE');
    throw error;
  }
  const user = await first(env.DB, 'SELECT * FROM users WHERE id = ?', userId);
  return { user: publicUser(user), refreshToken: refresh };
}

export async function authenticateUser(env, input, request) {
  requireAuthSecrets(env);
  const { username, password, turnstileToken } = input || {};
  let credentials;
  try { credentials = validateCredentials(username, password); } catch (error) {
    throw new AuthError(error.message, error.status || 400);
  }
  const ipLimit = await consumeLimit(env?.LOGIN_IP_LIMIT, requestIp(request));
  const userLimit = await consumeLimit(env?.LOGIN_USER_LIMIT, credentials.username);
  if (!ipLimit.allowed || !userLimit.allowed) throw new AuthError('Too many requests', 429, 'RATE_LIMITED');
  await verifyChallenge(env, { ...credentials, turnstileToken }, request);
  const row = await first(env.DB, 'SELECT * FROM users WHERE username = ?', credentials.username);
  const record = row ? { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations, version: row.password_kdf } : {
    hash: bytesToBase64Url(new Uint8Array(32)), salt: bytesToBase64Url(new Uint8Array(16)), iterations: configuredIterations(env), version: configuredVersion(env),
  };
  const valid = await verifyPassword(credentials.password, record);
  if (!row || !valid || row.status !== 'ACTIVE') throw new AuthError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
  return publicUser(row);
}

export async function rotateRefreshToken(db, token, pepper, now = Date.now()) {
  requireSecret(pepper);
  if (!token) throw new AuthError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  const timestamp = nowMs(now);
  const tokenHash = await hashRefreshToken(token, pepper);
  const current = await first(db, 'SELECT r.*, u.username, u.status, u.merit_total, u.merit_reached_at, u.password_hash, u.password_salt, u.password_kdf, u.password_iterations, u.created_at AS user_created_at, u.updated_at AS user_updated_at FROM refresh_tokens r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?', tokenHash);
  if (!current || current.revoked_at !== null || current.rotated_to_id !== null || Number(current.expires_at) <= timestamp || current.status !== 'ACTIVE') throw new AuthError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  const next = { token: randomToken(), id: crypto.randomUUID() };
  const nextHash = await hashRefreshToken(next.token, pepper);
  const result = await batch(db, [
    { sql: "UPDATE refresh_tokens SET revoked_at = ?, rotated_to_id = ? WHERE id = ? AND revoked_at IS NULL AND rotated_to_id IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM users WHERE users.id = refresh_tokens.user_id AND users.status = 'ACTIVE')", params: [timestamp, next.id, current.id, timestamp] },
    { sql: 'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) SELECT ?, user_id, ?, ?, ? FROM refresh_tokens WHERE id = ? AND rotated_to_id = ?', params: [next.id, nextHash, timestamp + REFRESH_TOKEN_TTL_MS, timestamp, current.id, next.id] },
  ]);
  if (!result?.[0]?.meta?.changes || !result?.[1]?.meta?.changes) throw new AuthError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  const row = { id: current.user_id, username: current.username, status: current.status, merit_total: current.merit_total, merit_reached_at: current.merit_reached_at, created_at: current.user_created_at, updated_at: current.user_updated_at };
  return { user: publicUser(row), token: next };
}

export async function revokeRefreshToken(db, token, pepper, now = Date.now()) {
  requireSecret(pepper);
  if (!token) return false;
  const result = await run(db, 'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', nowMs(now), await hashRefreshToken(token, pepper));
  return Number(result?.meta?.changes || 0) > 0;
}
