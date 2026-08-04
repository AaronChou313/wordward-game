const baseUrl = (process.env.BASE_URL || 'https://sheepgame.top').replace(/\/$/, '');
const wwwUrl = (process.env.WWW_URL || 'https://www.sheepgame.top').replace(/\/$/, '');

async function get(url, options) {
  return fetch(url, { redirect: 'manual', ...options });
}
async function json(response) {
  if (!(response.headers.get('content-type') || '').includes('application/json')) return null;
  return response.json();
}
try {
  const shell = await get(baseUrl + '/');
  if (shell.status !== 200 || !(await shell.text()).includes('<canvas')) throw new Error('production shell check failed');
  const health = await get(baseUrl + '/api/health');
  if (health.status !== 200 || (await json(health))?.status !== 'ok') throw new Error('health check failed');
  const missing = await get(baseUrl + '/api/missing');
  if (missing.status !== 404 || (await json(missing))?.error !== 'API route not found') throw new Error('API 404 check failed');
  const protectedResponse = await get(baseUrl + '/api/profile');
  if (protectedResponse.status !== 401) throw new Error('protected route is not denying anonymous access');
  const www = await get(wwwUrl + '/', { redirect: 'manual' });
  if (![301, 302, 307, 308].includes(www.status) || !((www.headers.get('location') || '').startsWith(baseUrl))) {
    throw new Error('www redirect check failed');
  }
  console.log(`Release checks passed for ${baseUrl}`);
} catch (error) {
  console.error(`Release checks failed: ${error.message}`);
  process.exitCode = 1;
}
