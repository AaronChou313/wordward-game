const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') || SAFE_METHODS.has(request.method.toUpperCase())) return null;
  let expected;
  try {
    if (typeof env.APP_ORIGIN !== 'string' || !env.APP_ORIGIN.trim()) throw new Error('missing origin');
    const configured = new URL(env.APP_ORIGIN);
    if (!['http:', 'https:'].includes(configured.protocol) || configured.origin === 'null') throw new Error('malformed origin');
    if (configured.username || configured.password || (configured.pathname !== '/' && configured.pathname !== '') || configured.search || configured.hash) throw new Error('malformed origin');
    expected = configured.origin;
  } catch {
    return forbiddenResponse();
  }
  if (url.origin !== expected) return forbiddenResponse();
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const applicationRequest = request.headers.get('X-Wordward-Request') === '1';
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  let supplied = origin && origin !== 'null' ? origin : null;
  if (!supplied && referer) {
    try {
      supplied = new URL(referer).origin;
    } catch {
      supplied = null;
    }
  }
  if (supplied && supplied !== expected) return forbiddenResponse();
  if (!supplied && fetchSite === 'cross-site') return forbiddenResponse();
  if (!supplied && fetchSite !== 'same-origin' && !applicationRequest) return forbiddenResponse();
  return null;
}

function forbiddenResponse() {
  return new Response(JSON.stringify({ error: 'Forbidden', code: 'ORIGIN_MISMATCH' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
}
