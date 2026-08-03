import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { authRoutes } from './modules/auth/routes.js';
import { profileRoutes } from './modules/profile/routes.js';
import { saveRoutes } from './modules/save/routes.js';

export function buildApp(options = {}) {
  const config = options.config || loadConfig();
  const ownsPrisma = !options.prisma;
  const prisma = options.prisma || createPrisma(config.databaseUrl);
  const app = Fastify({
    logger: options.logger ?? config.nodeEnv !== 'test',
    bodyLimit: 1024 * 1024,
  });

  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async function authenticate(request) {
    await request.jwtVerify();
  });
  app.register(cookie);
  app.register(jwt, { secret: config.jwtAccessSecret });
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(profileRoutes, { prefix: '/api/profile' });
  app.register(saveRoutes, { prefix: '/api/save' });

  app.get('/api/health', async () => ({ status: 'ok' }));

  if (ownsPrisma) {
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  }

  return app;
}
