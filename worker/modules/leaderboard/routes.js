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

// Difficulty is ranked best-to-worst: ENDLESS < HARD < NORMAL < EASY < (none).
// The ELSE 4 branch also normalises NULL best_difficulty (brand-new 0-merit
// users who never claimed) to the lowest rank, so an explicit COALESCE is not
// required for the difficulty key.
const DIFFICULTY_RANK = `CASE
  WHEN u.best_difficulty = 'ENDLESS' THEN 0
  WHEN u.best_difficulty = 'HARD' THEN 1
  WHEN u.best_difficulty = 'NORMAL' THEN 2
  WHEN u.best_difficulty = 'EASY' THEN 3
  ELSE 4
END`;

// NULL best_wave / merit_reached_at (never claimed) are folded to 0 so the
// ORDER BY and the cursor predicates compare a consistent, total order. This
// is what makes brand-new 0-merit users pageable: raw `NULL = ?`/`NULL < ?`
// are NULL (falsy), which would silently drop every following all-NULL row.
const COMPOSITE_ORDER = `u.merit_total DESC, ${DIFFICULTY_RANK} ASC, COALESCE(u.best_wave, 0) DESC, COALESCE(u.merit_reached_at, 0) ASC, u.id ASC`;

function rankOf(difficulty) {
  if (difficulty === 'ENDLESS') return 0;
  if (difficulty === 'HARD') return 1;
  if (difficulty === 'NORMAL') return 2;
  if (difficulty === 'EASY') return 3;
  return 4;
}

/** Rows strictly AFTER the composite key `{ merit, rank, wave, reached, id }` (for paging forward). */
function afterKey(key) {
  const sql = `(
    u.merit_total < ?
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) > ?)
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) = ? AND COALESCE(u.best_wave, 0) < ?)
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) = ? AND COALESCE(u.best_wave, 0) = ? AND COALESCE(u.merit_reached_at, 0) > ?)
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) = ? AND COALESCE(u.best_wave, 0) = ? AND COALESCE(u.merit_reached_at, 0) = ? AND u.id > ?)
  )`;
  const p = key;
  const params = [p.merit, p.merit, p.rank, p.merit, p.rank, p.wave, p.merit, p.rank, p.wave, p.reached, p.merit, p.rank, p.wave, p.reached, p.id];
  return { sql, params };
}

/** Rows strictly BEFORE the composite key (counts as the user's rank - 1). */
function beforeKey(key) {
  const sql = `(
    u.merit_total > ?
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) < ?)
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) = ? AND COALESCE(u.best_wave, 0) > ?)
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) = ? AND COALESCE(u.best_wave, 0) = ? AND COALESCE(u.merit_reached_at, 0) < ?)
    OR (u.merit_total = ? AND (${DIFFICULTY_RANK}) = ? AND COALESCE(u.best_wave, 0) = ? AND COALESCE(u.merit_reached_at, 0) = ? AND u.id < ?)
  )`;
  const p = key;
  const params = [p.merit, p.merit, p.rank, p.merit, p.rank, p.wave, p.merit, p.rank, p.wave, p.reached, p.merit, p.rank, p.wave, p.reached, p.id];
  return { sql, params };
}

export function leaderboardRoutes(app) {
  app.get('/api/leaderboard/me', requireAuth, async (c) => {
    try {
      const user = await first(c.env.DB, 'SELECT u.id, u.username, u.status, u.merit_total, u.merit_reached_at, u.best_difficulty, u.best_wave, p.nickname, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?', c.var.user.id);
      if (!user || user.status !== 'ACTIVE') return c.json({ error: 'Account unavailable', code: 'ACCOUNT_UNAVAILABLE' }, 403);
      const key = {
        merit: Number(user.merit_total),
        rank: rankOf(user.best_difficulty),
        wave: Number(user.best_wave) || 0,
        reached: Number(user.merit_reached_at) || 0,
        id: user.id,
      };
      const { sql, params } = beforeKey(key);
      const ahead = await first(c.env.DB, `SELECT COUNT(*) AS count FROM users u WHERE u.status = 'ACTIVE' AND ${sql}`, ...params);
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
      let where = `u.status = 'ACTIVE'`;
      if (cursor) {
        const after = afterKey({ merit: cursor.meritTotal, rank: cursor.bestDifficultyRank, wave: cursor.bestWave, reached: cursor.meritReachedAt, id: cursor.id });
        where += ` AND ${after.sql}`;
        params.push(...after.params);
      }
      const users = await all(c.env.DB, `SELECT u.id, u.username, u.merit_total, u.merit_reached_at, u.best_difficulty, u.best_wave, p.nickname, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE ${where} ORDER BY ${COMPOSITE_ORDER} LIMIT ?`, ...params, limit + 1);
      const hasMore = users.length > limit;
      const page = users.slice(0, limit);
      const baseRank = cursor ? cursor.rank : 0;
      const rows = page.map((entry, index) => row(entry, baseRank + index + 1));
      const last = page[page.length - 1];
      const nextCursor = hasMore && last ? await encodeCursor({
        meritTotal: Number(last.merit_total),
        bestDifficultyRank: rankOf(last.best_difficulty),
        bestWave: Number(last.best_wave) || 0,
        meritReachedAt: Number(last.merit_reached_at) || 0,
        id: last.id,
        rank: baseRank + page.length,
      }, secret(c.env)) : null;
      return c.json({ rows, nextCursor });
    } catch (error) { if (error instanceof D1UnavailableError) return unavailable(c); throw error; }
  });
}
