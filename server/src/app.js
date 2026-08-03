import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { authRoutes } from './modules/auth/routes.js';
import { profileRoutes } from './modules/profile/routes.js';
import { saveRoutes } from './modules/save/routes.js';
import { meritRoutes } from './modules/merit/routes.js';
import { leaderboardRoutes } from './modules/leaderboard/routes.js';

const PRODUCTION_PROXY_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::1/128',
  'fc00::/7',
];

export function buildApp(options = {}) {
  const config = options.config || loadConfig();
  const ownsPrisma = !options.prisma;
  const prisma = options.prisma || createPrisma(config.databaseUrl);
  const app = Fastify({
    logger: options.logger ?? config.nodeEnv !== 'test',
    bodyLimit: 1024 * 1024,
    trustProxy: config.nodeEnv === 'production' ? PRODUCTION_PROXY_CIDRS : false,
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
  app.register(meritRoutes, { prefix: '/api/merit' });
  app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });

  app.get('/api/health', async () => ({ status: 'ok' }));

  if (ownsPrisma) {
    app.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  }

  return app;
}
