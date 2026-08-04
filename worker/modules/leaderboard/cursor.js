import { bytesToBase64Url, decodeBase64Url } from '../../security/encoding.js';
import { hmac, requireSecret } from '../../security/hmac.js';

function equalBytes(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

export async function encodeCursor(cursor, secret) {
  requireSecret(secret);
  const payload = bytesToBase64Url(JSON.stringify(cursor));
  const signature = bytesToBase64Url(await hmac(`leaderboard:${payload}`, secret));
  return `${payload}.${signature}`;
}

export async function decodeCursor(value, secret) {
  requireSecret(secret);
  if (typeof value !== 'string' || value.length > 512) throw new Error('Invalid cursor');
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Invalid cursor');
  let actual;
  try { actual = decodeBase64Url(parts[1]); } catch { throw new Error('Invalid cursor'); }
  const expected = await hmac(`leaderboard:${parts[0]}`, secret);
  if (!equalBytes(actual, expected)) throw new Error('Invalid cursor');
  let cursor;
  try { cursor = JSON.parse(decodeBase64Url(parts[0], true)); } catch { throw new Error('Invalid cursor'); }
  if (!cursor || !Number.isInteger(cursor.meritTotal) || cursor.meritTotal <= 0 || !Number.isInteger(cursor.rank) || cursor.rank <= 0 || typeof cursor.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor.id) || typeof cursor.meritReachedAt !== 'string' || !Number.isFinite(Date.parse(cursor.meritReachedAt))) throw new Error('Invalid cursor');
  return cursor;
}
