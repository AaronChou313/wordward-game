import { Hono } from 'hono';
import { authRoutes } from './modules/auth/routes.js';
import { profileRoutes } from './modules/profile/routes.js';
import { saveRoutes } from './modules/save/routes.js';
import { meritRoutes } from './modules/merit/routes.js';
import { leaderboardRoutes } from './modules/leaderboard/routes.js';
import { errorHandler } from './middleware/errors.js';

/**
 * Create the Worker HTTP application.
 * @param {{ env: import('./types.js').WorkerEnv, ctx: ExecutionContext }} options
 */
export function createApp({ env, ctx }) {
  const app = new Hono();

  // Hono's env is populated from the request context; bind the supplied env
  // for app.request() tests while preserving Worker runtime behavior.
  app.use('*', async (c, next) => {
    if (!c.env || Object.keys(c.env).length === 0) c.env = env || {};
    await next();
  });

  authRoutes(app);
  profileRoutes(app);
  saveRoutes(app);
  meritRoutes(app);
  leaderboardRoutes(app);

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.onError(errorHandler);

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
