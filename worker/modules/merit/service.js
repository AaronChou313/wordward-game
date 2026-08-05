import { all, batch, first, run } from '../../db/queries.js';
import { D1ConflictError, D1UnavailableError } from '../../db/errors.js';
import { databaseDifficulty, MeritClaimError, meritForClaim, normalizeClaim, UNLOCK_REQUIREMENTS } from './validation.js';

const CHECKPOINT_TTL_MS = 48 * 60 * 60 * 1000;
const CLEANUP_LIMIT = 16;
const ATTEMPTS = 3;

export { MeritClaimError, meritForClaim, normalizeClaim };

function claimKey(userId, claim) { return [userId, databaseDifficulty(claim.difficulty), claim.endlessFloor, claim.bossWave]; }

async function existingClaim(db, userId, claim) {
  return first(db, 'SELECT id, merit, awarded_at FROM merit_claims WHERE user_id = ? AND difficulty = ? AND endless_floor = ? AND boss_wave = ?', ...claimKey(userId, claim));
}

function requirement(claim) {
  if (claim.bossWave > 30) return { difficulty: claim.difficulty, endlessFloor: claim.endlessFloor, bossWave: claim.bossWave - 30 };
  if (claim.difficulty === 'endless' && claim.endlessFloor > 1) return { difficulty: 'endless', endlessFloor: claim.endlessFloor - 1, bossWave: 30 };
  return UNLOCK_REQUIREMENTS[claim.difficulty] || null;
}

async function assertProgression(db, userId, claim) {
  const required = requirement(claim);
  if (!required) return;
  if (!await existingClaim(db, userId, required)) throw new MeritClaimError('Claim progression is not unlocked', 'PROGRESSION_LOCKED');
}

async function checkpoint(db, userId, claim) {
  const row = await first(db, 'SELECT * FROM merit_run_checkpoints WHERE user_id = ? AND run_id = ?', userId, claim.runId);
  if (!row) {
    if (claim.bossWave !== 30) throw new MeritClaimError('Boss claims do not belong to the same run', 'RUN_MISMATCH');
    return { create: true };
  }
  if (row.difficulty !== databaseDifficulty(claim.difficulty) || Number(row.endless_floor) !== claim.endlessFloor || row.seed !== claim.seed || Number(row.started_at) !== claim.startedAt || (claim.bossWave > 30 && (Number(row.last_boss_wave) < claim.bossWave - 30 || Number(row.last_finished_at) >= claim.finishedAt))) throw new MeritClaimError('Boss claims do not belong to the same run', 'RUN_MISMATCH');
  return { create: false, row };
}

async function cleanup(db, userId, runId, now) {
  const rows = await all(db, 'SELECT id FROM merit_run_checkpoints WHERE user_id = ? AND run_id != ? AND updated_at < ? ORDER BY updated_at ASC LIMIT ?', userId, runId, now - CHECKPOINT_TTL_MS, CLEANUP_LIMIT);
  if (rows.length) await batch(db, rows.map((row) => ({ sql: 'DELETE FROM merit_run_checkpoints WHERE id = ? AND user_id = ?', params: [row.id, userId] })));
}

async function attemptClaim(env, userId, claim, now) {
  const db = env?.DB || env;
  const user = await first(db, 'SELECT id, status, merit_total FROM users WHERE id = ?', userId);
  if (!user || user.status !== 'ACTIVE') throw new MeritClaimError('Account unavailable', 'ACCOUNT_UNAVAILABLE', 403);
  await cleanup(db, userId, claim.runId, now);
  const existing = await existingClaim(db, userId, claim);
  if (existing) return { awarded: false, merit: Number(existing.merit), meritTotal: Number(user.merit_total) };
  await assertProgression(db, userId, claim);
  const cp = await checkpoint(db, userId, claim);
  const id = crypto.randomUUID();
  const diff = databaseDifficulty(claim.difficulty);
  const statements = [
    { sql: 'INSERT OR IGNORE INTO merit_claims (id, user_id, difficulty, endless_floor, boss_wave, merit, run_id, seed, started_at, finished_at, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params: [id, userId, diff, claim.endlessFloor, claim.bossWave, claim.merit, claim.runId, claim.seed, claim.startedAt, claim.finishedAt, claim.summaryJson, now] },
  ];
  if (cp.create) statements.push({ sql: 'INSERT OR IGNORE INTO merit_run_checkpoints (id, user_id, run_id, difficulty, endless_floor, seed, started_at, last_boss_wave, last_finished_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM merit_claims WHERE id = ?)', params: [crypto.randomUUID(), userId, claim.runId, diff, claim.endlessFloor, claim.seed, claim.startedAt, claim.bossWave, claim.finishedAt, now, id] });
  else statements.push({ sql: 'UPDATE merit_run_checkpoints SET last_boss_wave = CASE WHEN last_boss_wave < ? THEN ? ELSE last_boss_wave END, last_finished_at = CASE WHEN last_boss_wave < ? THEN ? ELSE last_finished_at END, updated_at = ? WHERE user_id = ? AND run_id = ? AND EXISTS (SELECT 1 FROM merit_claims WHERE id = ?)', params: [claim.bossWave, claim.bossWave, claim.bossWave, claim.finishedAt, now, userId, claim.runId, id] });
  statements.push({ sql: 'UPDATE users SET merit_total = merit_total + ?, merit_reached_at = ?, updated_at = ? WHERE id = ? AND status = \'ACTIVE\' AND EXISTS (SELECT 1 FROM merit_claims WHERE id = ? AND awarded_at IS NULL)', params: [claim.merit, now, now, userId, id] });
  statements.push({ sql: 'UPDATE merit_claims SET awarded_at = ? WHERE id = ? AND awarded_at IS NULL', params: [now, id] });
  // Records this claim as the user's historical best difficulty/wave only when it
  // beats the current record (difficulty priority: ENDLESS > HARD > NORMAL > EASY,
  // higher wave wins within the same difficulty). Runs after the award UPDATE so
  // the awarded_at IS NOT NULL guard is satisfiable within this batch's statement
  // order, keeping it atomic with the claim writes.
  const difficultyRank = { ENDLESS: 4, HARD: 3, NORMAL: 2, EASY: 1 }[diff] || 0;
  statements.push({
    sql: `UPDATE users SET
      best_difficulty = CASE
        WHEN best_difficulty IS NULL OR ? > (CASE best_difficulty WHEN 'ENDLESS' THEN 4 WHEN 'HARD' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'EASY' THEN 1 ELSE 0 END)
              OR (? = (CASE best_difficulty WHEN 'ENDLESS' THEN 4 WHEN 'HARD' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'EASY' THEN 1 ELSE 0 END) AND ? > best_wave)
        THEN ? ELSE best_difficulty END,
      best_wave = CASE
        WHEN best_difficulty IS NULL OR ? > (CASE best_difficulty WHEN 'ENDLESS' THEN 4 WHEN 'HARD' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'EASY' THEN 1 ELSE 0 END)
              OR (? = (CASE best_difficulty WHEN 'ENDLESS' THEN 4 WHEN 'HARD' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'EASY' THEN 1 ELSE 0 END) AND ? > best_wave)
        THEN ? ELSE best_wave END
      WHERE id = ? AND status = 'ACTIVE' AND EXISTS (SELECT 1 FROM merit_claims WHERE id = ? AND awarded_at IS NOT NULL)`,
    params: [difficultyRank, difficultyRank, claim.bossWave, diff, difficultyRank, difficultyRank, claim.bossWave, claim.bossWave, userId, id],
  });
  await batch(db, statements);
  const awarded = await first(db, 'SELECT awarded_at FROM merit_claims WHERE id = ?', id);
  const latest = await first(db, 'SELECT merit_total FROM users WHERE id = ?', userId);
  if (!awarded || awarded.awarded_at == null) {
    const duplicate = await existingClaim(db, userId, claim);
    return { awarded: false, merit: Number(duplicate?.merit || claim.merit), meritTotal: Number(latest?.merit_total || user.merit_total) };
  }
  return { awarded: true, merit: claim.merit, meritTotal: Number(latest.merit_total) };
}

export async function recordMeritClaim(env, userId, input, now = Date.now()) {
  const normalized = normalizeClaim(input, now);
  let last;
  for (let i = 0; i < ATTEMPTS; i += 1) {
    try { return await attemptClaim(env, userId, normalized, now instanceof Date ? now.getTime() : Number(now)); }
    catch (error) {
      last = error;
      if (error instanceof MeritClaimError) throw error;
      if (!(error instanceof D1ConflictError || error instanceof D1UnavailableError) || i === ATTEMPTS - 1) throw error;
    }
  }
  throw last;
}

