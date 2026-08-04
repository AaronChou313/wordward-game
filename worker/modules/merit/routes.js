import { D1UnavailableError } from '../../db/errors.js';
import { requireSameOrigin } from '../../middleware/origin.js';
import { consumeLimit } from '../../middleware/limits.js';
import { requireAuth } from '../auth/routes.js';
import { MeritClaimError, recordMeritClaim } from './service.js';

export function meritRoutes(app) {
  app.post('/api/merit/claims', requireAuth, async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    const limited = await consumeLimit(c.env.MERIT_LIMIT, c.var.user.id);
    if (!limited.allowed) return c.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429);
    let input;
    try { input = await c.req.json(); } catch { return c.json({ error: 'Invalid claim', code: 'INVALID_CLAIM' }, 400); }
    try {
      const result = await recordMeritClaim(c.env, c.var.user.id, input, Date.now());
      return c.json(result, result.awarded ? 201 : 200);
    } catch (error) {
      if (error instanceof MeritClaimError) return c.json({ error: error.message, code: error.code }, error.statusCode || 400);
      if (error instanceof D1UnavailableError) return c.json({ error: 'Merit unavailable', code: 'D1_UNAVAILABLE' }, 503);
      throw error;
    }
  });
}

