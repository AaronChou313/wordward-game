import { base64UrlToBytes, bytesToBase64Url, decodeBase64Url } from './encoding.js';
import { hmac } from './hmac.js';

function nowSeconds(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  return Math.floor(Date.now() / 1000);
}

function equalBytes(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

export async function signAccessToken({ id, username }, secret, now = Date.now(), ttlSeconds = 900) {
  if (!id || !username) throw new TypeError('id and username are required');
  const iat = nowSeconds(now);
  const header = bytesToBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = bytesToBase64Url(JSON.stringify({ iat, exp: iat + Number(ttlSeconds), id, username }));
  const input = `${header}.${payload}`;
  return `${input}.${bytesToBase64Url(await hmac(input, secret))}`;
}

export async function verifyAccessToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') throw new Error('Malformed JWT');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Malformed JWT');
  let header;
  let payload;
  try {
    header = JSON.parse(decodeBase64Url(parts[0], true));
    payload = JSON.parse(decodeBase64Url(parts[1], true));
  } catch {
    throw new Error('Malformed JWT');
  }
  if (header.alg !== 'HS256') throw new Error('Unsupported JWT algorithm');
  const expected = await hmac(`${parts[0]}.${parts[1]}`, secret);
  if (!equalBytes(expected, base64UrlToBytes(parts[2]))) throw new Error('Invalid JWT signature');
  if (!payload || typeof payload.id !== 'string' || typeof payload.username !== 'string' || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) throw new Error('Invalid JWT claims');
  if (nowSeconds(now) >= payload.exp) throw new Error('JWT expired');
  return payload;
}
