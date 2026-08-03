import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_LOGIN_HASH = '$argon2id$v=19$m=65536,p=4,t=3$xDrIyfXcB86aO5Tdi5axxg$oxDi1ZzUTNszkSi+c2mbvhdrdf/UU/qKWOgugbo18BQ';

export class AuthError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function normalizeUsername(username) {
  return String(username || '').normalize('NFKC').trim().toLowerCase();
}

export function validateCredentials(username, password) {
  const normalized = normalizeUsername(username);
  const usernameLength = Array.from(normalized).length;
  const passwordLength = Array.from(String(password || '')).length;
  if (usernameLength < 3 || usernameLength > 24) {
    throw new AuthError('Username must be 3 to 24 characters', 400);
  }
  if (passwordLength < 10 || passwordLength > 128) {
    throw new AuthError('Password must be 10 to 128 characters', 400);
  }
  return { username: normalized, password: String(password) };
}

export async function registerUser(prisma, credentials) {
  const { username, password } = validateCredentials(credentials.username, credentials.password);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    return await prisma.user.create({
      data: {
        username,
        passwordHash,
        profile: { create: { nickname: username } },
      },
    });
  } catch (error) {
    if (error && error.code === 'P2002') {
      throw new AuthError('Username is unavailable', 409);
    }
    throw error;
  }
}

export async function authenticateUser(prisma, credentials) {
  const { username, password } = validateCredentials(credentials.username, credentials.password);
  const user = await prisma.user.findUnique({ where: { username } });
  const valid = await argon2.verify(user ? user.passwordHash : INVALID_LOGIN_HASH, password);
  if (!valid || user.status !== 'ACTIVE') {
    throw new AuthError('Invalid username or password', 401);
  }
  return user;
}

export async function createRefreshToken(prisma, userId, pepper, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token, pepper),
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

export async function rotateRefreshToken(prisma, token, pepper, now = new Date()) {
  if (!token) throw new AuthError('Invalid refresh token', 401);
  const tokenHash = hashRefreshToken(token, pepper);

  return prisma.$transaction(async (tx) => {
    const current = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!current || current.revokedAt || current.expiresAt <= now || current.user.status !== 'ACTIVE') {
      throw new AuthError('Invalid refresh token', 401);
    }

    const revoked = await tx.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) throw new AuthError('Invalid refresh token', 401);

    const nextToken = await createRefreshToken(tx, current.userId, pepper, now);
    return { token: nextToken, user: current.user };
  });
}

export async function revokeRefreshToken(prisma, token, pepper, now = new Date()) {
  if (!token) return false;
  const result = await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(token, pepper), revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count > 0;
}

export function hashRefreshToken(token, pepper) {
  return createHmac('sha256', pepper).update(token).digest('hex');
}
