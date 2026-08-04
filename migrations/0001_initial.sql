CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_kdf TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK (password_iterations > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  merit_total INTEGER NOT NULL DEFAULT 0 CHECK (merit_total >= 0),
  merit_reached_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_saves (
  user_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS merit_claims (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('EASY', 'NORMAL', 'HARD', 'ENDLESS')),
  endless_floor INTEGER NOT NULL DEFAULT 1 CHECK (endless_floor > 0),
  boss_wave INTEGER NOT NULL CHECK (boss_wave > 0),
  merit INTEGER NOT NULL CHECK (merit >= 0),
  awarded_at INTEGER,
  run_id TEXT NOT NULL,
  seed TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, difficulty, endless_floor, boss_wave)
);

CREATE TABLE IF NOT EXISTS merit_run_checkpoints (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('EASY', 'NORMAL', 'HARD', 'ENDLESS')),
  endless_floor INTEGER NOT NULL DEFAULT 1 CHECK (endless_floor > 0),
  seed TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_boss_wave INTEGER NOT NULL CHECK (last_boss_wave > 0),
  last_finished_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, run_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  rotated_to_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS users_leaderboard_idx
  ON users (merit_total DESC, merit_reached_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS merit_claims_lookup_idx
  ON merit_claims (user_id, difficulty, boss_wave);
CREATE INDEX IF NOT EXISTS merit_claims_run_idx
  ON merit_claims (user_id, run_id);
CREATE INDEX IF NOT EXISTS merit_claims_created_idx
  ON merit_claims (user_id, created_at);
CREATE INDEX IF NOT EXISTS merit_run_checkpoints_updated_idx
  ON merit_run_checkpoints (user_id, updated_at);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_expiry_idx
  ON refresh_tokens (user_id, expires_at);
CREATE INDEX IF NOT EXISTS refresh_tokens_rotated_idx
  ON refresh_tokens (rotated_to_id);
