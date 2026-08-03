import { loginSchema, registerSchema } from './schemas.js';
import {
  ACCESS_TOKEN_TTL,
  AuthError,
  authenticateUser,
  createRefreshToken,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from './service.js';

const REFRESH_COOKIE = 'wordward_refresh';
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export async function authRoutes(app) {
  app.post('/register', {
    schema: registerSchema,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const { user, refreshToken } = await app.prisma.$transaction(async (tx) => {
        const createdUser = await registerUser(tx, request.body);
        const createdToken = await createRefreshToken(
          tx,
          createdUser.id,
          app.config.refreshTokenPepper,
        );
        return { user: createdUser, refreshToken: createdToken };
      });
      return sendSession(app, reply, user, refreshToken, 201);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post('/login', {
    schema: loginSchema,
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const user = await authenticateUser(app.prisma, request.body);
      const refreshToken = await createRefreshToken(
        app.prisma,
        user.id,
        app.config.refreshTokenPepper,
      );
      return sendSession(app, reply, user, refreshToken);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post('/refresh', async (request, reply) => {
    try {
      const rotated = await rotateRefreshToken(
        app.prisma,
        request.cookies[REFRESH_COOKIE],
        app.config.refreshTokenPepper,
      );
      return sendSession(app, reply, rotated.user, rotated.token);
    } catch (error) {
      clearRefreshCookie(reply);
      return sendAuthError(reply, error);
    }
  });

  app.post('/logout', async (request, reply) => {
    await revokeRefreshToken(
      app.prisma,
      request.cookies[REFRESH_COOKIE],
      app.config.refreshTokenPepper,
    );
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });
}

function sendSession(app, reply, user, refreshToken, statusCode = 200) {
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_MAX_AGE,
  });
  const accessToken = app.jwt.sign({ id: user.id, username: user.username }, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
  return reply.code(statusCode).send({
    accessToken,
    user: { id: user.id, username: user.username },
  });
}

function clearRefreshCookie(reply) {
  reply.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth',
  });
}

function sendAuthError(reply, error) {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  throw error;
}
