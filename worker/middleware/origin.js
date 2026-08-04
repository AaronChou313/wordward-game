const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') || SAFE_METHODS.has(request.method.toUpperCase())) return null;
  if (!env.APP_ORIGIN) return null;
  const expected = new URL(env.APP_ORIGIN).origin;
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  let supplied = origin;
  if (!supplied && referer) {
    try {
      supplied = new URL(referer).origin;
    } catch {
      supplied = null;
    }
  }
  if (!supplied || supplied !== expected) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  return null;
}
