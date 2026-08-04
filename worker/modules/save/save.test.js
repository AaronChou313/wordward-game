import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { validateSave } from './routes.js';
import { signAccessToken } from '../../security/jwt.js';

function makeDb() {
  const users = new Map([['u1', { id: 'u1', username: 'alice', status: 'ACTIVE' }]]);
  const saves = new Map();
  return {
    saves,
    prepare(sql) {
      return { bind(...params) {
        return {
          async first() {
            if (sql.includes('FROM users')) return users.get(params[0]) || null;
            if (sql.includes('FROM game_saves')) return saves.get(params[0]) || null;
            return null;
          },
          async run() {
            if (sql.startsWith('INSERT INTO game_saves')) {
              const [userId, schemaVersion, dataJson, updatedAt] = params;
              if (saves.has(userId)) return { meta: { changes: 0 } };
              saves.set(userId, { user_id: userId, schema_version: schemaVersion, version: 1, data_json: dataJson, updated_at: updatedAt });
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('UPDATE game_saves')) {
              const [schemaVersion, dataJson, updatedAt, userId, version] = params;
              const current = saves.get(userId);
              if (!current || current.version !== version) return { meta: { changes: 0 } };
              saves.set(userId, { ...current, schema_version: schemaVersion, data_json: dataJson, version: current.version + 1, updated_at: updatedAt });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
        };
      } };
    },
  };
}

async function request(app, method, body) {
  const token = await signAccessToken({ id: 'u1', username: 'alice' }, 'jwt');
  return app.request(`https://wordward.example/api/save`, {
    method, headers: { Authorization: `Bearer ${token}`, Origin: 'https://wordward.example', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('save route helpers', () => {
  it('validates client schema versions and rejects protected merit', () => {
    expect(validateSave({ version: 0, data: { version: 2 } })).toEqual({ version: 0, data: { version: 2 } });
    expect(validateSave({ version: 0, data: { version: 0 } })).toBeNull();
    expect(validateSave({ version: 0, data: { merit: {}, version: 2 } })).toEqual({ version: 0, data: { merit: {}, version: 2 } });
    expect(validateSave({ version: -1, data: { version: 2 } })).toBeNull();
  });

  it('creates, increments, and rejects stale cloud-save versions', async () => {
    const db = makeDb();
    const app = createApp({ env: { APP_ORIGIN: 'https://wordward.example', JWT_ACCESS_SECRET: 'jwt', REFRESH_TOKEN_PEPPER: 'pepper', DB: db }, ctx: {} });
    expect((await request(app, 'GET')).status).toBe(404);
    const first = await request(app, 'PUT', { version: 0, data: { version: 2, gold: 1 } });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ version: 1, data: { version: 2, gold: 1 } });
    const second = await request(app, 'PUT', { version: 1, data: { version: 2, gold: 2 } });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ version: 2, data: { version: 2, gold: 2 } });
    const stale = await request(app, 'PUT', { version: 1, data: { version: 2, gold: 3 } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: 'Save conflict', current: { version: 2, data: { gold: 2 } } });
  });

  it('rejects protected merit and payloads over 256 KiB UTF-8', async () => {
    const db = makeDb();
    const app = createApp({ env: { APP_ORIGIN: 'https://wordward.example', JWT_ACCESS_SECRET: 'jwt', REFRESH_TOKEN_PEPPER: 'pepper', DB: db }, ctx: {} });
    const merit = await request(app, 'PUT', { version: 0, data: { version: 2, merit: { total: 999 } } });
    expect(merit.status).toBe(400);
    const large = await request(app, 'PUT', { version: 0, data: { version: 2, text: '✓'.repeat(256 * 1024) } });
    expect(large.status).toBe(413);
  });

  it('allows only one concurrent first save', async () => {
    const db = makeDb();
    const app = createApp({ env: { APP_ORIGIN: 'https://wordward.example', JWT_ACCESS_SECRET: 'jwt', REFRESH_TOKEN_PEPPER: 'pepper', DB: db }, ctx: {} });
    const results = await Promise.all([
      request(app, 'PUT', { version: 0, data: { version: 2, gold: 1 } }),
      request(app, 'PUT', { version: 0, data: { version: 2, gold: 2 } }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
  });
});
