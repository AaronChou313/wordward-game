import { readFile } from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { all, batch, classifyError, first, run } from './queries.js';
import { D1ConflictError, D1UnavailableError } from './errors.js';
import { toClaim, toCheckpoint, toProfile, toSave, toUser } from './rows.js';

const migrationPath = new URL('../../migrations/0001_initial.sql', import.meta.url);
let platform;
let db;

async function applyMigration(database) {
  const sql = await readFile(migrationPath, 'utf8');
  for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
    await database.exec(`${statement.replace(/\s+/g, ' ')};`);
  }
}

beforeEach(async () => {
  platform = await getPlatformProxy({ environment: 'preview', remoteBindings: false, persist: false });
  db = platform.env.DB;
  await applyMigration(db);
});

afterEach(async () => {
  await platform?.dispose();
  platform = undefined;
  db = undefined;
});

describe('D1 initial migration', () => {
  it('creates all six tables and supporting indexes', async () => {
    const tables = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' ORDER BY name");
    expect(tables.map((row) => row.name)).toEqual([
      'game_saves', 'merit_claims', 'merit_run_checkpoints', 'profiles', 'refresh_tokens', 'users',
    ]);
    const indexes = await all(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'");
    expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'users_leaderboard_idx', 'merit_claims_lookup_idx', 'merit_run_checkpoints_updated_idx',
      'refresh_tokens_rotated_idx',
    ]));
  });

  it('enforces unique username, claim, checkpoint run, and token hash constraints', async () => {
    const now = Date.now();
    await run(db, 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'u1', 'alice', 'hash', 'salt', 'PBKDF2-SHA-256', 1000, now, now);
    await expect(run(db, 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'u2', 'alice', 'hash', 'salt', 'PBKDF2-SHA-256', 1000, now, now)).rejects.toMatchObject({ code: 'D1_CONFLICT', constraint: 'users.username' });
    await run(db, 'INSERT INTO merit_claims (id, user_id, difficulty, endless_floor, boss_wave, merit, run_id, seed, started_at, finished_at, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'c1', 'u1', 'EASY', 1, 30, 1, 'run', 'seed', now, now, '{"wave":30}', now);
    await expect(run(db, 'INSERT INTO merit_claims (id, user_id, difficulty, endless_floor, boss_wave, merit, run_id, seed, started_at, finished_at, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'c2', 'u1', 'EASY', 1, 30, 1, 'run', 'seed', now, now, '{"wave":30}', now)).rejects.toMatchObject({ code: 'D1_CONFLICT' });
    await run(db, 'INSERT INTO merit_run_checkpoints (id, user_id, run_id, difficulty, endless_floor, seed, started_at, last_boss_wave, last_finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'p1', 'u1', 'run', 'EASY', 1, 'seed', now, 30, now, now);
    await expect(run(db, 'INSERT INTO merit_run_checkpoints (id, user_id, run_id, difficulty, endless_floor, seed, started_at, last_boss_wave, last_finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'p2', 'u1', 'run', 'EASY', 1, 'seed', now, 30, now, now)).rejects.toMatchObject({ code: 'D1_CONFLICT' });
    await run(db, 'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', 't1', 'u1', 'hash', now + 1000, now);
    await expect(run(db, 'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', 't2', 'u1', 'hash', now + 1000, now)).rejects.toMatchObject({ code: 'D1_CONFLICT', constraint: 'refresh_tokens.token_hash' });
  });

  it('cascades dependent rows when deleting a user and round-trips JSON text', async () => {
    const now = Date.now();
    await run(db, 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'u1', 'json-user', 'hash', 'salt', 'PBKDF2-SHA-256', 1000, now, now);
    await run(db, 'INSERT INTO profiles (user_id, nickname, bio, updated_at) VALUES (?, ?, ?, ?)', 'u1', 'N', '', now);
    await run(db, 'INSERT INTO game_saves (user_id, schema_version, version, data_json, updated_at) VALUES (?, ?, ?, ?, ?)', 'u1', 1, 1, JSON.stringify({ nested: ['✓'], n: 2 }), now);
    const save = toSave(await first(db, 'SELECT * FROM game_saves WHERE user_id = ?', 'u1'));
    expect(save.data).toEqual({ nested: ['✓'], n: 2 });
    await run(db, 'DELETE FROM users WHERE id = ?', 'u1');
    expect(await first(db, 'SELECT user_id FROM profiles WHERE user_id = ?', 'u1')).toBeNull();
    expect(await first(db, 'SELECT user_id FROM game_saves WHERE user_id = ?', 'u1')).toBeNull();
  });
});

describe('query helpers and row conversions', () => {
  it('classifies wrapped D1 errors without requiring Node process globals', () => {
    const originalProcess = globalThis.process;
    try {
      Reflect.deleteProperty(globalThis, 'process');
      const constraint = classifyError(Object.assign(new Error('request failed'), {
        cause: Object.assign(new Error('UNIQUE constraint failed: users.username'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }),
      }));
      expect(constraint).toBeInstanceOf(D1ConflictError);
      expect(constraint.constraint).toBe('users.username');
      expect(classifyError(new Error('connection unavailable'))).toBeInstanceOf(D1UnavailableError);
    } finally {
      globalThis.process = originalProcess;
    }
  });

  it('binds values without interpolating SQL text', async () => {
    const now = Date.now();
    const username = "x'); DROP TABLE users; --";
    await run(db, 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'u1', username, 'hash', 'salt', 'PBKDF2-SHA-256', 1000, now, now);
    expect((await first(db, 'SELECT username FROM users WHERE id = ?', 'u1')).username).toBe(username);
    expect((await first(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")).name).toBe('users');
  });

  it('executes a prepared batch and converts rows', async () => {
    const now = Date.now();
    const result = await batch(db, [
      { sql: 'INSERT INTO users (id, username, password_hash, password_salt, password_kdf, password_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params: ['u1', 'alice', 'h', 's', 'k', 1, now, now] },
      { sql: 'INSERT INTO profiles (user_id, nickname, bio, updated_at) VALUES (?, ?, ?, ?)', params: ['u1', 'Alice', '', now] },
    ]);
    expect(result).toHaveLength(2);
    expect(toUser(await first(db, 'SELECT * FROM users WHERE id = ?', 'u1'))).toMatchObject({ id: 'u1', username: 'alice', status: 'ACTIVE' });
    expect(toProfile(await first(db, 'SELECT * FROM profiles WHERE user_id = ?', 'u1'))).toMatchObject({ userId: 'u1', nickname: 'Alice' });
    expect(toClaim(null)).toBeNull();
    expect(toCheckpoint(null)).toBeNull();
  });
});
