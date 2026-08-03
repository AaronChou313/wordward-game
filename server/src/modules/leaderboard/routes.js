import { createHmac, timingSafeEqual } from 'node:crypto';

export async function leaderboardRoutes(app) {
  app.get('/me', { onRequest: app.authenticate }, async (request, reply) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.id },
      include: { profile: true },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });
    if (user.meritTotal <= 0 || !user.meritReachedAt) return leaderboardRow(user, null);

    const ahead = await app.prisma.user.count({ where: aheadOf(user) });
    return leaderboardRow(user, ahead + 1);
  });

  app.get('/', { schema: { querystring: querySchema } }, async (request, reply) => {
    const limit = request.query.limit || 20;
    let cursor = null;
    if (request.query.cursor) {
      try {
        cursor = decodeCursor(app, request.query.cursor);
      } catch {
        return reply.code(400).send({ error: 'Invalid leaderboard cursor' });
      }
    }

    const users = await app.prisma.user.findMany({
      where: cursor ? afterCursor(cursor) : { meritTotal: { gt: 0 } },
      orderBy: [
        { meritTotal: 'desc' },
        { meritReachedAt: 'asc' },
        { id: 'asc' },
      ],
      take: limit + 1,
      include: { profile: true },
    });
    const hasMore = users.length > limit;
    const page = users.slice(0, limit);
    const baseRank = cursor ? cursor.rank : 0;
    const rows = page.map((user, index) => leaderboardRow(user, baseRank + index + 1));
    const last = page[page.length - 1];
    return {
      rows,
      nextCursor: hasMore && last
        ? encodeCursor(app, {
          meritTotal: last.meritTotal,
          meritReachedAt: last.meritReachedAt.toISOString(),
          id: last.id,
          rank: baseRank + page.length,
        })
        : null,
    };
  });
}

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', minLength: 1, maxLength: 512 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
};

function afterCursor(cursor) {
  const reachedAt = new Date(cursor.meritReachedAt);
  return {
    AND: [
      { meritTotal: { gt: 0 } },
      {
        OR: [
          { meritTotal: { lt: cursor.meritTotal } },
          { meritTotal: cursor.meritTotal, meritReachedAt: { gt: reachedAt } },
          { meritTotal: cursor.meritTotal, meritReachedAt: reachedAt, id: { gt: cursor.id } },
        ],
      },
    ],
  };
}

function aheadOf(user) {
  return {
    OR: [
      { meritTotal: { gt: user.meritTotal } },
      { meritTotal: user.meritTotal, meritReachedAt: { lt: user.meritReachedAt } },
      { meritTotal: user.meritTotal, meritReachedAt: user.meritReachedAt, id: { lt: user.id } },
    ],
  };
}

function leaderboardRow(user, rank) {
  return {
    rank,
    userId: user.id,
    nickname: user.profile ? user.profile.nickname : user.username,
    avatarUrl: user.profile ? user.profile.avatarUrl : null,
    merit: user.meritTotal,
  };
}

function encodeCursor(app, cursor) {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const signature = cursorSignature(app, payload);
  return payload + '.' + signature;
}

function decodeCursor(app, value) {
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid cursor');
  const actual = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(cursorSignature(app, payload), 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid cursor');
  }
  const cursor = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!cursor
    || !Number.isInteger(cursor.meritTotal) || cursor.meritTotal < 1
    || !Number.isInteger(cursor.rank) || cursor.rank < 1
    || typeof cursor.id !== 'string' || cursor.id.length < 1
    || typeof cursor.meritReachedAt !== 'string'
    || !Number.isFinite(new Date(cursor.meritReachedAt).getTime())) {
    throw new Error('Invalid cursor');
  }
  return cursor;
}

function cursorSignature(app, payload) {
  return createHmac('sha256', app.config.refreshTokenPepper)
    .update('leaderboard:' + payload)
    .digest('base64url');
}
