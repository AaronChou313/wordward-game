const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function toBytes(value) {
  return value instanceof Uint8Array ? value : textEncoder.encode(String(value));
}

export function bytesToBase64Url(value) {
  const bytes = toBytes(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function encodeBase64Url(value) {
  return bytesToBase64Url(value);
}

export function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Malformed base64url');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  let binary;
  try {
    binary = atob(base64);
  } catch {
    throw new Error('Malformed base64url');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function decodeBase64Url(value, asText = false) {
  const bytes = base64UrlToBytes(value);
  return asText ? textDecoder.decode(bytes) : bytes;
}

export function bytesToHex(value) {
  return Array.from(toBytes(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value) {
  if (typeof value !== 'string' || value.length % 2 || !/^[0-9a-f]+$/i.test(value)) throw new Error('Malformed hex');
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}
