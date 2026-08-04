import { parseCredentials } from './schemas.js';
import {
  ACCESS_TOKEN_TTL,
  AuthError,
  authenticateUser,
  createRefreshToken,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from './service.js';
import { clearRefreshCookie, setRefreshCookie } from '../../security/cookies.js';
import { signAccessToken, verifyAccessToken } from '../../security/jwt.js';
import { first } from '../../db/queries.js';
import { toPublicUser, toUser } from '../../db/rows.js';
import { requireSameOrigin } from '../../middleware/origin.js';

const COOKIE_NAME = 'wordward_refresh';

function errorResponse(c, error, clear = false) {
  if (clear) {
    const headers = new Headers();
    clearRefreshCookie(headers);
    c.header('Set-Cookie', headers.get('Set-Cookie'));
  }
  if (error instanceof AuthError) return c.json({ error: error.message }, error.status);
  return c.json({ error: 'Authentication unavailable' }, 503);
}

async function body(c) {
  try { return parseCredentials(await c.req.json()); } catch { throw new AuthError('Invalid request', 400, 'INVALID_REQUEST'); }
}

function sessionResponse(c, env, user, refresh, status = 200) {
  const headers = new Headers();
  setRefreshCookie(headers, refresh.token);
  c.header('Set-Cookie', headers.get('Set-Cookie'));
  return signAccessToken(user, env.JWT_ACCESS_SECRET, Date.now(), ACCESS_TOKEN_TTL)
    .then((accessToken) => c.json({ accessToken, user: toPublicUser(user) }, status));
}

export function authRoutes(app) {
  app.post('/api/auth/register', async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    try {
      const input = await body(c);
      const result = await registerUser(c.env, input, c.req.raw);
      return sessionResponse(c, c.env, result.user, result.refreshToken, 201);
    } catch (error) { return errorResponse(c, error); }
  });

  app.post('/api/auth/login', async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    try {
      const input = await body(c);
      const user = await authenticateUser(c.env, input, c.req.raw);
      const refresh = await createRefreshToken(c.env.DB, user.id, c.env.REFRESH_TOKEN_PEPPER);
      return sessionResponse(c, c.env, user, refresh);
    } catch (error) { return errorResponse(c, error); }
  });

  app.post('/api/auth/refresh', async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    try {
      const cookie = c.req.header('Cookie') || '';
      const token = cookie.match(/(?:^|;\s*)wordward_refresh=([^;]*)/)?.[1] || '';
      const result = await rotateRefreshToken(c.env.DB, token, c.env.REFRESH_TOKEN_PEPPER);
      return sessionResponse(c, c.env, result.user, result.token);
    } catch (error) { return errorResponse(c, error, true); }
  });

  app.post('/api/auth/logout', async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    const cookie = c.req.header('Cookie') || '';
    const token = cookie.match(/(?:^|;\s*)wordward_refresh=([^;]*)/)?.[1] || '';
    await revokeRefreshToken(c.env.DB, token, c.env.REFRESH_TOKEN_PEPPER);
    const headers = new Headers();
    clearRefreshCookie(headers);
    c.header('Set-Cookie', headers.get('Set-Cookie'));
    return c.body(null, 204);
  });
}

/** Hono middleware for protected routes. Attaches a public active user as `c.var.user`. */
export async function requireAuth(c, next) {
  const header = c.req.header('Authorization') || '';
  if (!header.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verifyAccessToken(header.slice(7), c.env.JWT_ACCESS_SECRET);
    const row = await first(c.env.DB, 'SELECT * FROM users WHERE id = ?', payload.id);
    const user = toUser(row);
    if (!user || user.status !== 'ACTIVE' || user.username !== payload.username) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', toPublicUser(user));
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}
