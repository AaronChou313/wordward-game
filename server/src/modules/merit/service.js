const MERIT_MULTIPLIERS = {
  easy: 1,
  normal: 2,
  hard: 4,
  endless: 8,
};

const UNLOCK_REQUIREMENTS = {
  normal: { difficulty: 'easy', endlessFloor: 1, bossWave: 30 },
  hard: { difficulty: 'normal', endlessFloor: 1, bossWave: 30 },
  endless: { difficulty: 'hard', endlessFloor: 1, bossWave: 30 },
};

export class MeritClaimError extends Error {
  constructor(message, code = 'INVALID_CLAIM', statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function meritForClaim(difficulty, bossWave) {
  const multiplier = MERIT_MULTIPLIERS[difficulty];
  if (!multiplier || !Number.isInteger(bossWave) || bossWave < 30 || bossWave % 30 !== 0) return 0;
  return multiplier * (bossWave / 30);
}

export async function recordMeritClaim(prisma, userId, input, now = new Date()) {
  const normalized = normalizeClaim(input, now);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== 'ACTIVE') {
        throw new MeritClaimError('Account unavailable', 'ACCOUNT_UNAVAILABLE', 403);
      }

      const existing = await findClaim(tx, userId, normalized);
      await assertProgression(tx, userId, normalized);
      await advanceRunCheckpoint(tx, userId, normalized);
      if (existing) {
        return { awarded: false, merit: existing.merit, meritTotal: user.meritTotal };
      }

      const merit = meritForClaim(normalized.difficulty, normalized.bossWave);
      await tx.meritClaim.create({
        data: {
          userId,
          difficulty: databaseDifficulty(normalized.difficulty),
          endlessFloor: normalized.endlessFloor,
          bossWave: normalized.bossWave,
          merit,
          runId: normalized.runId,
          seed: normalized.seed,
          startedAt: normalized.startedAt,
          finishedAt: normalized.finishedAt,
          summary: normalized.summary,
        },
      });
      const updated = await tx.user.update({
        where: { id: userId },
        data: { meritTotal: { increment: merit }, meritReachedAt: now },
      });
      return { awarded: true, merit, meritTotal: updated.meritTotal };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error && error.code === 'P2002') {
      const [existing, user] = await Promise.all([
        findClaim(prisma, userId, normalized),
        prisma.user.findUnique({ where: { id: userId } }),
      ]);
      if (existing && user) {
        await repairRunCheckpoint(prisma, userId, normalized);
        return { awarded: false, merit: existing.merit, meritTotal: user.meritTotal };
      }
    }
    throw error;
  }
}

function normalizeClaim(input, now) {
  const difficulty = input.difficulty;
  const bossWave = input.bossWave;
  const endlessFloor = difficulty === 'endless' ? input.endlessFloor : 1;
  const merit = meritForClaim(difficulty, bossWave);
  if (!merit) throw new MeritClaimError('Invalid Boss wave', 'INVALID_BOSS_WAVE');
  if (!Number.isInteger(endlessFloor) || endlessFloor < 1) {
    throw new MeritClaimError('Invalid endless floor', 'INVALID_ENDLESS_FLOOR');
  }
  if (difficulty !== 'endless' && input.endlessFloor !== 1) {
    throw new MeritClaimError('Unexpected endless floor', 'INVALID_ENDLESS_FLOOR');
  }
  const killBounds = plausibleKillBounds(difficulty, endlessFloor, bossWave);
  if (!input.summary || input.summary.wave !== bossWave
    || !Number.isInteger(input.summary.kills)
    || input.summary.kills < killBounds.minimum
    || input.summary.kills > killBounds.maximum
    || !Number.isFinite(input.summary.lordHp)
    || input.summary.lordHp < 0 || input.summary.lordHp > 10000) {
    throw new MeritClaimError('Invalid battle summary', 'INVALID_BATTLE_SUMMARY');
  }

  const startedAt = new Date(input.startedAt);
  const finishedAt = new Date(input.finishedAt);
  const elapsed = finishedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < bossWave * 5000 || elapsed > 24 * 60 * 60 * 1000) {
    throw new MeritClaimError('Implausible battle duration', 'INVALID_BATTLE_DURATION');
  }
  if (finishedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new MeritClaimError('Invalid completion time', 'INVALID_COMPLETION_TIME');
  }
  return { ...input, difficulty, bossWave, endlessFloor, startedAt, finishedAt };
}

async function assertProgression(tx, userId, claim) {
  let required = null;
  if (claim.bossWave > 30) {
    required = {
      difficulty: claim.difficulty,
      endlessFloor: claim.endlessFloor,
      bossWave: claim.bossWave - 30,
    };
  } else if (claim.difficulty === 'endless' && claim.endlessFloor > 1) {
    required = { difficulty: 'endless', endlessFloor: claim.endlessFloor - 1, bossWave: 30 };
  } else {
    required = UNLOCK_REQUIREMENTS[claim.difficulty] || null;
  }
  if (!required) return;
  const prerequisite = await findClaim(tx, userId, required);
  if (!prerequisite) {
    throw new MeritClaimError('Claim progression is not unlocked', 'PROGRESSION_LOCKED');
  }
}

async function advanceRunCheckpoint(tx, userId, claim) {
  const where = { userId_runId: { userId, runId: claim.runId } };
  const checkpoint = await tx.meritRunCheckpoint.findUnique({ where });
  if (!checkpoint) {
    if (claim.bossWave !== 30) {
      throw new MeritClaimError('Boss claims do not belong to the same run', 'RUN_MISMATCH');
    }
    await tx.meritRunCheckpoint.create({
      data: {
        userId,
        runId: claim.runId,
        difficulty: databaseDifficulty(claim.difficulty),
        endlessFloor: claim.endlessFloor,
        seed: claim.seed,
        startedAt: claim.startedAt,
        lastBossWave: claim.bossWave,
        lastFinishedAt: claim.finishedAt,
      },
    });
    return;
  }

  if (checkpoint.difficulty !== databaseDifficulty(claim.difficulty)
    || checkpoint.endlessFloor !== claim.endlessFloor
    || checkpoint.seed !== claim.seed
    || checkpoint.startedAt.getTime() !== claim.startedAt.getTime()
    || (claim.bossWave > 30 && (
      checkpoint.lastBossWave < claim.bossWave - 30
      || checkpoint.lastFinishedAt.getTime() >= claim.finishedAt.getTime()
    ))) {
    throw new MeritClaimError('Boss claims do not belong to the same run', 'RUN_MISMATCH');
  }
  if (claim.bossWave > checkpoint.lastBossWave) {
    await tx.meritRunCheckpoint.update({
      where,
      data: { lastBossWave: claim.bossWave, lastFinishedAt: claim.finishedAt },
    });
  }
}

async function repairRunCheckpoint(prisma, userId, claim) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        (tx) => advanceRunCheckpoint(tx, userId, claim),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      lastError = error;
      if (!error || (error.code !== 'P2002' && error.code !== 'P2034')) throw error;
    }
  }
  throw lastError;
}

function plausibleKillBounds(difficulty, endlessFloor, bossWave) {
  const base = difficulty === 'easy' ? 6
    : difficulty === 'normal' ? 8
      : difficulty === 'hard' ? 10
        : 10 + 2 * (endlessFloor - 1);
  const growth = difficulty === 'easy' || difficulty === 'normal' ? 2 : 3;
  const normalEnemies = bossWave * base + growth * bossWave * (bossWave + 1) / 2;
  const specialEnemies = Math.floor(bossWave / 10);
  const maximum = normalEnemies + specialEnemies;
  return { minimum: Math.floor(maximum * 0.65), maximum };
}

function findClaim(client, userId, claim) {
  return client.meritClaim.findUnique({
    where: {
      userId_difficulty_endlessFloor_bossWave: {
        userId,
        difficulty: databaseDifficulty(claim.difficulty),
        endlessFloor: claim.endlessFloor,
        bossWave: claim.bossWave,
      },
    },
  });
}

function databaseDifficulty(difficulty) {
  return difficulty.toUpperCase();
}
