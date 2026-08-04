import { Hono } from 'hono';

/**
 * Create the Worker HTTP application.
 * @param {{ env: import('./types.js').WorkerEnv, ctx: ExecutionContext }} options
 */
export function createApp({ env, ctx }) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'API route not found' }, 404);
    }
    if (env?.ASSETS) {
      return env.ASSETS.fetch(c.req.raw);
    }
    return c.text('Not Found', 404);
  });

  return app;
}
