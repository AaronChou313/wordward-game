import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../src/db.js';
import { recordMeritClaim } from '../src/modules/merit/service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('PostgreSQL Serializable merit integration', () => {
  let prisma;
  let user;

  beforeAll(async () => {
    prisma = createPrisma(databaseUrl);
    user = await prisma.user.create({
      data: {
        username: `pgcheck${Date.now()}`,
        passwordHash: 'integration-test-only',
        profile: { create: { nickname: '并发校验' } },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('repairs both run checkpoints when first-award transactions race', async () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 10 * 60 * 1000);
    const firstBoss = (runId) => claim(runId, 30, startedAt, now);

    const raced = await Promise.all([
      recordMeritClaim(prisma, user.id, firstBoss('postgres-run-a'), now),
      recordMeritClaim(prisma, user.id, firstBoss('postgres-run-b'), now),
    ]);

    expect(raced.map((result) => result.awarded).sort()).toEqual([false, true]);
    expect(await prisma.meritClaim.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.meritRunCheckpoint.count({ where: { userId: user.id } })).toBe(2);

    const later = new Date(now.getTime() + 5 * 60 * 1000);
    const runA = await recordMeritClaim(
      prisma, user.id, claim('postgres-run-a', 60, startedAt, later), later,
    );
    const runB = await recordMeritClaim(
      prisma, user.id, claim('postgres-run-b', 60, startedAt, later), later,
    );
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    const checkpoints = await prisma.meritRunCheckpoint.findMany({ where: { userId: user.id } });

    expect(runA.awarded).toBe(true);
    expect(runB.awarded).toBe(false);
    expect(refreshed.meritTotal).toBe(3);
    expect(checkpoints.map((entry) => entry.lastBossWave)).toEqual([60, 60]);
  });
});

function claim(runId, bossWave, startedAt, finishedAt) {
  return {
    difficulty: 'easy',
    endlessFloor: 1,
    bossWave,
    runId,
    seed: `seed-${runId}`,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    summary: {
      wave: bossWave,
      kills: bossWave === 30 ? 1100 : 4000,
      lordHp: 10,
    },
  };
}
