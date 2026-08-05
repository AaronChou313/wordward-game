ALTER TABLE users ADD COLUMN best_difficulty TEXT;
ALTER TABLE users ADD COLUMN best_wave INTEGER;
CREATE INDEX IF NOT EXISTS users_leaderboard_best_idx
  ON users (merit_total DESC, best_wave DESC);
