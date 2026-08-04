function jsonOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordKdf: row.password_kdf,
    passwordIterations: row.password_iterations,
    status: row.status,
    meritTotal: row.merit_total,
    meritReachedAt: row.merit_reached_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? '',
    updatedAt: row.updated_at,
  };
}

export function toSave(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    schemaVersion: row.schema_version,
    version: row.version,
    data: jsonOrNull(row.data_json),
    updatedAt: row.updated_at,
  };
}

export function toClaim(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    difficulty: row.difficulty,
    endlessFloor: row.endless_floor,
    bossWave: row.boss_wave,
    merit: row.merit,
    awardedAt: row.awarded_at ?? null,
    runId: row.run_id,
    seed: row.seed,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summary: jsonOrNull(row.summary_json),
    createdAt: row.created_at,
  };
}

export function toCheckpoint(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    runId: row.run_id,
    difficulty: row.difficulty,
    endlessFloor: row.endless_floor,
    seed: row.seed,
    startedAt: row.started_at,
    lastBossWave: row.last_boss_wave,
    lastFinishedAt: row.last_finished_at,
    updatedAt: row.updated_at,
  };
}

export function toRefreshToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    rotatedToId: row.rotated_to_id ?? null,
  };
}
