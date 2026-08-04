import { first, run } from '../../db/queries.js';
import { D1ConflictError, D1UnavailableError } from '../../db/errors.js';
import { toSave } from '../../db/rows.js';
import { requireSameOrigin } from '../../middleware/origin.js';
import { requireAuth } from '../auth/routes.js';

const MAX_SAVE_BYTES = 256 * 1024;

export function validateSave(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body).some((key) => !['version', 'data'].includes(key))) return null;
  if (!Number.isInteger(body.version) || body.version < 0) return null;
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return null;
  if (!Number.isInteger(body.data.version) || body.data.version < 1) return null;
  return { version: body.version, data: body.data };
}

function publicSave(row) {
  const save = toSave(row);
  return { version: save.version, data: save.data };
}

function conflict(c, row) {
  return c.json({ error: 'Save conflict', code: 'SAVE_CONFLICT', current: row ? publicSave(row) : null }, 409);
}

function unavailable(c) {
  return c.json({ error: 'Cloud save unavailable', code: 'D1_UNAVAILABLE' }, 503);
}

function invalidSave(c) {
  return c.json({ error: 'Invalid save schema version', code: 'INVALID_SAVE' }, 400);
}

export function saveRoutes(app) {
  app.get('/api/save', requireAuth, async (c) => {
    try {
      const row = await first(c.env.DB, 'SELECT user_id, schema_version, version, data_json, updated_at FROM game_saves WHERE user_id = ?', c.var.user.id);
      if (!row) return c.json({ error: 'Cloud save not found', code: 'SAVE_NOT_FOUND' }, 404);
      return c.json(publicSave(row));
    } catch (error) {
      if (error instanceof D1UnavailableError) return unavailable(c);
      throw error;
    }
  });

  app.put('/api/save', requireAuth, async (c) => {
    const rejected = requireSameOrigin(c.req.raw, c.env);
    if (rejected) return rejected;
    let input;
    try { input = validateSave(await c.req.json()); } catch { input = null; }
    if (!input) return invalidSave(c);
    if (Object.prototype.hasOwnProperty.call(input.data, 'merit')) return c.json({ error: 'Protected save fields are not allowed', code: 'PROTECTED_SAVE_FIELDS' }, 400);
    let dataJson;
    try { dataJson = JSON.stringify(input.data); } catch { return invalidSave(c); }
    if (new TextEncoder().encode(dataJson).byteLength > MAX_SAVE_BYTES) return c.json({ error: 'Save data is too large', code: 'SAVE_TOO_LARGE' }, 413);

    try {
      const userId = c.var.user.id;
      const now = Date.now();
      if (input.version === 0) {
        let result;
        try {
          result = await run(c.env.DB, 'INSERT INTO game_saves (user_id, schema_version, version, data_json, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING', userId, input.data.version, dataJson, now);
        } catch (error) {
          if (!(error instanceof D1ConflictError)) throw error;
          result = { meta: { changes: 0 } };
        }
        if (Number(result?.meta?.changes || 0)) {
          const created = await first(c.env.DB, 'SELECT user_id, schema_version, version, data_json, updated_at FROM game_saves WHERE user_id = ?', userId);
          return c.json(publicSave(created));
        }
        const current = await first(c.env.DB, 'SELECT user_id, schema_version, version, data_json, updated_at FROM game_saves WHERE user_id = ?', userId);
        return conflict(c, current);
      }

      const result = await run(c.env.DB, 'UPDATE game_saves SET schema_version = ?, data_json = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?', input.data.version, dataJson, now, userId, input.version);
      if (!Number(result?.meta?.changes || 0)) {
        const current = await first(c.env.DB, 'SELECT user_id, schema_version, version, data_json, updated_at FROM game_saves WHERE user_id = ?', userId);
        return conflict(c, current);
      }
      const updated = await first(c.env.DB, 'SELECT user_id, schema_version, version, data_json, updated_at FROM game_saves WHERE user_id = ?', userId);
      return c.json(publicSave(updated));
    } catch (error) {
      if (error instanceof D1UnavailableError) return unavailable(c);
      throw error;
    }
  });
}

export { MAX_SAVE_BYTES };
