const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, request, secret, fetchImpl = fetch) {
  if (!token || !secret) return { ok: false, reason: 'invalid' };
  const body = new URLSearchParams({ secret, response: token });
  const remoteIp = request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('X-Forwarded-For')?.split(',')[0]?.trim();
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const response = await fetchImpl(VERIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const result = await response.json();
    return result?.success === true ? { ok: true, reason: 'ok' } : { ok: false, reason: 'invalid' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
