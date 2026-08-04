import { all, first } from '../../db/queries.js';
import { D1UnavailableError } from '../../db/errors.js';
import { requireAuth } from '../auth/routes.js';
import { decodeCursor, encodeCursor } from './cursor.js';

const MAX_LIMIT = 50;
function secret(env) { return env?.LEADERBOARD_CURSOR_SECRET || env?.REFRESH_TOKEN_PEPPER; }
function row(value, rank) {
  return { rank, userId: value.id, nickname: value.nickname || value.username, avatarUrl: value.avatar_url ?? null, merit: Number(value.merit_total) };
}
function unavailable(c) { return c.json({ error: 'Leaderboard unavailable', code: 'D1_UNAVAILABLE' }, 503); }

export function leaderboardRoutes(app) {
  app.get('/api/leaderboard/me', requireAuth, async (c) => {
    try {
      const user = await first(c.env.DB, 'SELECT u.id, u.username, u.status, u.merit_total, u.merit_reached_at, p.nickname, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?', c.var.user.id);
      if (!user || user.status !== 'ACTIVE') return c.json({ error: 'Account unavailable', code: 'ACCOUNT_UNAVAILABLE' }, 403);
      if (Number(user.merit_total) <= 0 || user.merit_reached_at == null) return c.json(row(user, null));
      const ahead = await first(c.env.DB, `SELECT COUNT(*) AS count FROM users u WHERE u.status = 'ACTIVE' AND u.merit_total > 0 AND (u.merit_total > ? OR (u.merit_total = ? AND u.merit_reached_at < ?) OR (u.merit_total = ? AND u.merit_reached_at = ? AND u.id < ?))`, Number(user.merit_total), Number(user.merit_total), Number(user.merit_reached_at), Number(user.merit_total), Number(user.merit_reached_at), user.id);
      return c.json(row(user, Number(ahead?.count || 0) + 1));
    } catch (error) { if (error instanceof D1UnavailableError) return unavailable(c); throw error; }
  });

  app.get('/api/leaderboard', async (c) => {
    let limit = Number(c.req.query('limit') || 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return c.json({ error: 'Invalid leaderboard limit', code: 'INVALID_LEADERBOARD_LIMIT' }, 400);
    let cursor = null;
    const encoded = c.req.query('cursor');
    if (encoded) {
      try { cursor = await decodeCursor(encoded, secret(c.env)); } catch { return c.json({ error: 'Invalid leaderboard cursor', code: 'INVALID_LEADERBOARD_CURSOR' }, 400); }
    }
    try {
      const params = [];
      let where = `u.status = 'ACTIVE' AND u.merit_total > 0`;
      if (cursor) {
        where += ' AND (u.merit_total < ? OR (u.merit_total = ? AND u.merit_reached_at > ?) OR (u.merit_total = ? AND u.merit_reached_at = ? AND u.id > ?))';
        params.push(cursor.meritTotal, cursor.meritTotal, Date.parse(cursor.meritReachedAt), cursor.meritTotal, Date.parse(cursor.meritReachedAt), cursor.id);
      }
      const users = await all(c.env.DB, `SELECT u.id, u.username, u.merit_total, u.merit_reached_at, p.nickname, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE ${where} ORDER BY u.merit_total DESC, u.merit_reached_at ASC, u.id ASC LIMIT ?`, ...params, limit + 1);
      const hasMore = users.length > limit;
      const page = users.slice(0, limit);
      const baseRank = cursor ? cursor.rank : 0;
      const rows = page.map((entry, index) => row(entry, baseRank + index + 1));
      const last = page[page.length - 1];
      const nextCursor = hasMore && last ? await encodeCursor({ meritTotal: Number(last.merit_total), meritReachedAt: new Date(Number(last.merit_reached_at)).toISOString(), id: last.id, rank: baseRank + page.length }, secret(c.env)) : null;
      return c.json({ rows, nextCursor });
    } catch (error) { if (error instanceof D1UnavailableError) return unavailable(c); throw error; }
  });
}

