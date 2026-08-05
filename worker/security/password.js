import { base64UrlToBytes, bytesToBase64Url, toBytes } from './encoding.js';

// Keep the PBKDF2 work bounded so malformed records cannot turn verification
// into an unbounded CPU operation. These bounds are shared by hashing and
// verification and can be tightened during deployment benchmarking.
//
// Cloudflare Workers caps WebCrypto PBKDF2 at 100_000 iterations: requests
// above it throw NotSupportedError. 100_000 is therefore also the safe
// default here — anything higher must fail closed before reaching the
// runtime, never surface as a transient 503.
export const MIN_PASSWORD_ITERATIONS = 1;
export const MAX_PASSWORD_ITERATIONS = 100_000;
export const DEFAULT_PASSWORD_ITERATIONS = 100_000;
export const PASSWORD_KDF_VERSION = 'PBKDF2-SHA-256-v1';
const SUPPORTED_KDF_VERSIONS = new Set([PASSWORD_KDF_VERSION, 'v1']);

export class AuthValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AuthValidationError';
    this.status = status;
    this.statusCode = status;
  }
}

export function normalizeUsername(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

export function validateCredentials(username, password) {
  const normalized = normalizeUsername(username);
  const passwordText = String(password ?? '');
  const usernameLength = Array.from(normalized).length;
  const passwordLength = Array.from(passwordText).length;
  if (usernameLength < 3 || usernameLength > 24) throw new AuthValidationError('Username must be 3 to 24 characters');
  if (passwordLength < 1 || passwordLength > 128) throw new AuthValidationError('Password must be 1 to 128 characters');
  return { username: normalized, password: passwordText };
}

export async function hashPassword(password, options = {}) {
  const rawIterations = options?.iterations;
  const iterations = rawIterations === undefined ? DEFAULT_PASSWORD_ITERATIONS : parseIterations(rawIterations);
  const version = options?.version === undefined ? PASSWORD_KDF_VERSION : options.version;
  if (!isValidIterations(iterations)) throw new TypeError('iterations must be a bounded positive integer');
  if (!isValidKdfVersion(version)) throw new TypeError('unsupported password KDF version');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt: bytesToBase64Url(salt), iterations, version };
}

export async function verifyPassword(password, record) {
  try {
    const iterations = parseIterations(record?.iterations);
    if (!isValidIterations(iterations) || typeof record?.salt !== 'string' || typeof record?.hash !== 'string') return false;
    if (record.version !== undefined && !isValidKdfVersion(record.version)) return false;
    const salt = base64UrlToBytes(record.salt);
    const expected = base64UrlToBytes(record.hash);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const key = await crypto.subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
    let difference = actual.length ^ expected.length;
    for (let index = 0; index < expected.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

function isValidIterations(value) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= MIN_PASSWORD_ITERATIONS && value <= MAX_PASSWORD_ITERATIONS;
}

function parseIterations(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return Number.NaN;
  if (typeof value === 'string' && value.trim() === '') return Number.NaN;
  return Number(value);
}

function isValidKdfVersion(value) {
  return typeof value === 'string' && SUPPORTED_KDF_VERSIONS.has(value);
}
