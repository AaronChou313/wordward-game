const MERIT_MULTIPLIERS = { easy: 1, normal: 2, hard: 4, endless: 8 };
const DAY_MS = 24 * 60 * 60 * 1000;

export class MeritClaimError extends Error {
  constructor(message, code = 'INVALID_CLAIM', status = 400) {
    super(message);
    this.name = 'MeritClaimError';
    this.code = code;
    this.status = status;
    this.statusCode = status;
  }
}

export function meritForClaim(difficulty, bossWave) {
  const multiplier = MERIT_MULTIPLIERS[difficulty];
  if (!multiplier || !Number.isInteger(bossWave) || bossWave < 30 || bossWave % 30 !== 0) return 0;
  return multiplier * (bossWave / 30);
}

export function plausibleKillBounds(difficulty, endlessFloor, bossWave) {
  const base = difficulty === 'easy' ? 6 : difficulty === 'normal' ? 8 : difficulty === 'hard' ? 10 : 10 + 2 * (endlessFloor - 1);
  const growth = difficulty === 'easy' || difficulty === 'normal' ? 2 : 3;
  const normalEnemies = bossWave * base + growth * bossWave * (bossWave + 1) / 2;
  const maximum = normalEnemies + Math.floor(bossWave / 10);
  return { minimum: Math.floor(maximum * 0.65), maximum };
}

function timestamp(value, code) {
  const date = new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) throw new MeritClaimError('Invalid timestamp', code);
  return Math.trunc(ms);
}

export function normalizeClaim(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MeritClaimError('Invalid claim');
  const allowed = ['difficulty', 'endlessFloor', 'bossWave', 'runId', 'seed', 'startedAt', 'finishedAt', 'summary'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new MeritClaimError('Invalid claim');
  const { difficulty, bossWave, runId, seed, summary } = input;
  if (!Object.prototype.hasOwnProperty.call(input, 'endlessFloor') || !MERIT_MULTIPLIERS[difficulty]) throw new MeritClaimError('Invalid difficulty', 'INVALID_DIFFICULTY');
  const endlessFloor = difficulty === 'endless' ? input.endlessFloor : 1;
  if (!Number.isInteger(endlessFloor) || endlessFloor < 1 || endlessFloor > 1000000 || (difficulty !== 'endless' && input.endlessFloor !== 1)) throw new MeritClaimError('Invalid endless floor', 'INVALID_ENDLESS_FLOOR');
  const merit = meritForClaim(difficulty, bossWave);
  if (!merit) throw new MeritClaimError('Invalid Boss wave', 'INVALID_BOSS_WAVE');
  if (typeof runId !== 'string' || runId.length < 8 || runId.length > 64 || typeof seed !== 'string' || seed.length < 8 || seed.length > 128) throw new MeritClaimError('Invalid run', 'INVALID_RUN');
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) || !Number.isInteger(summary.wave) || !Number.isInteger(summary.kills) || !Number.isFinite(summary.lordHp)) throw new MeritClaimError('Invalid battle summary', 'INVALID_BATTLE_SUMMARY');
  const bounds = plausibleKillBounds(difficulty, endlessFloor, bossWave);
  if (summary.wave !== bossWave || summary.kills < bounds.minimum || summary.kills > bounds.maximum || summary.lordHp < 0 || summary.lordHp > 10000) throw new MeritClaimError('Invalid battle summary', 'INVALID_BATTLE_SUMMARY');
  let summaryJson;
  try { summaryJson = JSON.stringify(summary); } catch { throw new MeritClaimError('Invalid battle summary', 'INVALID_BATTLE_SUMMARY'); }
  if (typeof summaryJson !== 'string') throw new MeritClaimError('Invalid battle summary', 'INVALID_BATTLE_SUMMARY');
  const startedAt = timestamp(input.startedAt, 'INVALID_START_TIME');
  const finishedAt = timestamp(input.finishedAt, 'INVALID_FINISH_TIME');
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const elapsed = finishedAt - startedAt;
  if (!Number.isFinite(nowMs) || !Number.isFinite(elapsed) || elapsed < bossWave * 5000 || elapsed > DAY_MS) throw new MeritClaimError('Implausible battle duration', 'INVALID_BATTLE_DURATION');
  if (finishedAt > nowMs + 5 * 60 * 1000) throw new MeritClaimError('Invalid completion time', 'INVALID_COMPLETION_TIME');
  return { difficulty, endlessFloor, bossWave, runId, seed, startedAt, finishedAt, summary, summaryJson, merit };
}

export function databaseDifficulty(difficulty) { return difficulty.toUpperCase(); }

export const UNLOCK_REQUIREMENTS = {
  normal: { difficulty: 'easy', endlessFloor: 1, bossWave: 30 },
  hard: { difficulty: 'normal', endlessFloor: 1, bossWave: 30 },
  endless: { difficulty: 'hard', endlessFloor: 1, bossWave: 30 },
};

