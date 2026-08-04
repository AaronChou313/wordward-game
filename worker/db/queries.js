import { D1ConflictError, D1UnavailableError } from './errors.js';

function requireDb(db) {
  if (!db || typeof db.prepare !== 'function') throw new D1UnavailableError();
  return db;
}

function classifyError(error) {
  if (error instanceof D1ConflictError || error instanceof D1UnavailableError) return error;
  // D1 wraps SQLite failures in one or more Error.cause objects. Inspect the
  // complete chain (including error codes) so constraint failures remain 409s
  // instead of being mistaken for transient database outages.
  const parts = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === 'string') parts.push(current);
    else {
      for (const key of ['message', 'code', 'name', 'stack']) {
        if (current[key] !== undefined) parts.push(String(current[key]));
      }
    }
    if (current instanceof D1ConflictError || current instanceof D1UnavailableError) return current;
    current = current.cause;
  }
  const message = parts.join(' ').toLowerCase();
  if (message.includes('constraint') || message.includes('unique') || message.includes('foreign key') || message.includes('sqlite_constraint')) {
    let constraint = 'constraint';
    if (message.includes('username')) constraint = 'users.username';
    else if (message.includes('token_hash')) constraint = 'refresh_tokens.token_hash';
    else if (message.includes('run_id')) constraint = 'merit_run_checkpoints.user_id_run_id';
    else if (message.includes('difficulty')) constraint = 'merit_claims.user_id_difficulty_endless_floor_boss_wave';
    return new D1ConflictError('Database conflict', constraint);
  }
  return new D1UnavailableError();
}

function prepared(db, sql, params) {
  try {
    const statement = requireDb(db).prepare(sql);
    return params.length ? statement.bind(...params) : statement;
  } catch (error) {
    throw classifyError(error);
  }
}

export async function run(db, sql, ...params) {
  try {
    return await prepared(db, sql, params).run();
  } catch (error) {
    throw classifyError(error);
  }
}

export async function first(db, sql, ...params) {
  try {
    const value = await prepared(db, sql, params).first();
    return value ?? null;
  } catch (error) {
    throw classifyError(error);
  }
}

export async function all(db, sql, ...params) {
  try {
    const value = await prepared(db, sql, params).all();
    return Array.isArray(value) ? value : (value?.results || []);
  } catch (error) {
    throw classifyError(error);
  }
}

/**
 * Execute prepared statements atomically. Statements may be D1 prepared
 * statements or `{ sql, params }` descriptors, which keeps callers from
 * interpolating values into SQL.
 */
export async function batch(db, statements) {
  try {
    requireDb(db);
    if (!Array.isArray(statements)) throw new TypeError('statements must be an array');
    const preparedStatements = statements.map((statement) => {
      if (statement && typeof statement.run === 'function') return statement;
      if (!statement || typeof statement.sql !== 'string') throw new TypeError('invalid statement');
      return prepared(db, statement.sql, statement.params || []);
    });
    return await db.batch(preparedStatements);
  } catch (error) {
    throw classifyError(error);
  }
}

export { classifyError };
