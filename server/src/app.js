import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { loadConfig } from './config.js';

export function buildApp(options = {}) {
  const config = options.config || loadConfig();
  const app = Fastify({
    logger: options.logger ?? config.nodeEnv !== 'test',
    bodyLimit: 1024 * 1024,
  });

  app.decorate('config', config);
  app.register(cookie);
  app.register(jwt, { secret: config.jwtAccessSecret });
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
