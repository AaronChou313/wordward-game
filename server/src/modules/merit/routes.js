import { MeritClaimError, recordMeritClaim } from './service.js';

export async function meritRoutes(app) {
  app.post('/claims', {
    onRequest: app.authenticate,
    schema: { body: claimSchema },
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const result = await recordMeritClaim(app.prisma, request.user.id, request.body);
      return reply.code(result.awarded ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof MeritClaimError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}

const claimSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['difficulty', 'endlessFloor', 'bossWave', 'runId', 'seed', 'startedAt', 'finishedAt', 'summary'],
  properties: {
    difficulty: { type: 'string', enum: ['easy', 'normal', 'hard', 'endless'] },
    endlessFloor: { type: 'integer', minimum: 1, maximum: 1000000 },
    bossWave: { type: 'integer', minimum: 30, maximum: 30000 },
    runId: { type: 'string', minLength: 8, maxLength: 64 },
    seed: { type: 'string', minLength: 8, maxLength: 128 },
    startedAt: { type: 'string', format: 'date-time' },
    finishedAt: { type: 'string', format: 'date-time' },
    meritTotal: { not: {} },
    summary: {
      type: 'object',
      additionalProperties: true,
      required: ['wave', 'kills', 'lordHp'],
      properties: {
        wave: { type: 'integer', minimum: 1 },
        kills: { type: 'integer', minimum: 1 },
        lordHp: { type: 'number', minimum: 0, maximum: 10000 },
      },
    },
  },
};
