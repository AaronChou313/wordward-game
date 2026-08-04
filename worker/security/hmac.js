import { bytesToBase64Url, bytesToHex, toBytes } from './encoding.js';

/** A controlled configuration failure; callers map this to a generic 503. */
export class SecretConfigurationError extends Error {
  constructor() {
    super('Authentication configuration unavailable');
    this.name = 'SecretConfigurationError';
    this.code = 'CONFIGURATION_ERROR';
    this.status = 503;
    this.statusCode = 503;
  }
}

export function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.trim() === '') throw new SecretConfigurationError();
  return secret;
}

async function hmac(value, secret) {
  requireSecret(secret);
  const key = await crypto.subtle.importKey('raw', toBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, toBytes(value)));
}

export async function hashCursor(payload, secret) {
  return bytesToBase64Url(await hmac(JSON.stringify(payload), secret));
}

export async function hashRefreshToken(token, pepper) {
  return bytesToHex(await hmac(token, pepper));
}

export { hmac };
