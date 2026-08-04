import { bytesToBase64Url, bytesToHex, toBytes } from './encoding.js';

async function hmac(value, secret) {
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
