import { first, run } from '../../db/queries.js';
import { D1UnavailableError } from '../../db/errors.js';
import { toProfile } from '../../db/rows.js';
import { requireSameOrigin } from '../../middleware/origin.js';
import { requireAuth } from '../auth/routes.js';

export function normalizeProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  // Keep the wire shape explicit.  In particular, an omitted avatarUrl is
  // different from a caller intentionally clearing it with null.
  const keys = Object.keys(body);
  if (keys.length !== 3 || keys.some((key) => !['nickname', 'avatarUrl', 'bio'].includes(key))) return null;
  if (typeof body.nickname !== 'string' || typeof body.bio !== 'string') return null;
  const nickname = body.nickname.trim();
  const bio = body.bio.trim();
  if (Array.from(nickname).length < 1 || Array.from(nickname).length > 24) return null;
  if (Array.from(bio).length > 200) return null;

  let avatarUrl = body.avatarUrl;
  if (avatarUrl !== null && typeof avatarUrl !== 'string') return null;
  if (typeof avatarUrl === 'string' && (avatarUrl.length === 0 || Array.from(avatarUrl).length > 2048)) return null;
  if (typeof avatarUrl === 'string') {
    try {
      const parsed = new URL(avatarUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
      avatarUrl = parsed.href;
    } catch {
      return null;
    }
  }
  return { nickname, avatarUrl, bio };
}

function publicProfile(row) {
  const profile = toProfile(row);
  return { nickname: profile.nickname, avatarUrl: profile.avatarUrl, bio: profile.bio };
}

function unavailable(c) {
  return c.json({ error: 'Profile unavailable', code: 'D1_UNAVAILABLE' }, 503);
}

function profileNotFound(c) {
  return c.json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' }, 404);
}

export function profileRoutes(app) {
  app.get('/api/profile', requireAuth, async (c) => {
    try {
      const row = await first(c.env.DB, 'SELECT user_id, nickname, avatar_url, bio, updated_at FROM profiles WHERE user_id = ?', c.var.user.id);
      if (!row) return profileNotFound(c);
      return c.json(publicProfile(row));
    } catch (error) {
      if (error instanceof D1UnavailableError) return unavailable(c);
      throw error;
    }
  });

  app.put('/api/profile', requireAuth, async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    let data;
    try { data = normalizeProfile(await c.req.json()); } catch { data = null; }
    if (!data) return c.json({ error: 'Invalid profile', code: 'INVALID_PROFILE' }, 400);
    try {
      const current = await first(c.env.DB, 'SELECT user_id FROM profiles WHERE user_id = ?', c.var.user.id);
      if (!current) return profileNotFound(c);
      const result = await run(c.env.DB, 'UPDATE profiles SET nickname = ?, avatar_url = ?, bio = ?, updated_at = ? WHERE user_id = ?', data.nickname, data.avatarUrl, data.bio, Date.now(), c.var.user.id);
      if (!Number(result?.meta?.changes || 0)) return profileNotFound(c);
      const row = await first(c.env.DB, 'SELECT user_id, nickname, avatar_url, bio, updated_at FROM profiles WHERE user_id = ?', c.var.user.id);
      return row ? c.json(publicProfile(row)) : profileNotFound(c);
    } catch (error) {
      if (error instanceof D1UnavailableError) return unavailable(c);
      throw error;
    }
  });
}
