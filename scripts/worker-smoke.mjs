const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');

async function check(path, expectedStatus, predicate, label) {
  const response = await fetch(baseUrl + path);
  if (response.status !== expectedStatus) throw new Error(`${label}: expected ${expectedStatus}, got ${response.status}`);
  if (predicate && !(await predicate(response))) throw new Error(`${label}: response check failed`);
}

const json = async (response) => {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) return null;
  return response.json();
};

try {
  await check('/api/health', 200, async (r) => (await json(r))?.status === 'ok', 'health');
  await check('/api/missing', 404, async (r) => (await json(r))?.error === 'API route not found', 'API 404');
  await check('/', 200, async (r) => (await r.text()).includes('<canvas'), 'static shell');
  await check('/api/profile', 401, async (r) => (await json(r))?.error === 'Unauthorized', 'protected route');
  console.log(`Worker smoke passed: ${baseUrl}`);
} catch (error) {
  console.error(`Worker smoke failed: ${error.message}`);
  process.exitCode = 1;
}
