import { base64UrlToBytes, bytesToBase64Url, toBytes } from './encoding.js';

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
  if (passwordLength < 10 || passwordLength > 128) throw new AuthValidationError('Password must be 10 to 128 characters');
  return { username: normalized, password: passwordText };
}

export async function hashPassword(password, options = {}) {
  const iterations = Number(options.iterations || 120000);
  const version = options.version || 'PBKDF2-SHA-256-v1';
  if (!Number.isInteger(iterations) || iterations < 1) throw new TypeError('iterations must be a positive integer');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: bytesToBase64Url(new Uint8Array(bits)), salt: bytesToBase64Url(salt), iterations, version };
}

export async function verifyPassword(password, record) {
  try {
    const iterations = Number(record?.iterations);
    if (!Number.isInteger(iterations) || iterations < 1 || typeof record?.salt !== 'string' || typeof record?.hash !== 'string') return false;
    const salt = base64UrlToBytes(record.salt);
    const expected = base64UrlToBytes(record.hash);
    const key = await crypto.subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8));
    let difference = actual.length ^ expected.length;
    const length = Math.max(actual.length, expected.length);
    for (let index = 0; index < length; index += 1) difference |= (actual[index % (actual.length || 1)] || 0) ^ (expected[index % (expected.length || 1)] || 0);
    return difference === 0;
  } catch {
    return false;
  }
}
