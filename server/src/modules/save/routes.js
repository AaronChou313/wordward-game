const MAX_SAVE_BYTES = 256 * 1024;

class SaveConflictError extends Error {
  constructor(current) {
    super('Save conflict');
    this.current = current;
  }
}

export async function saveRoutes(app) {
  app.get('/', { onRequest: app.authenticate }, async (request, reply) => {
    const save = await app.prisma.gameSave.findUnique({
      where: { userId: request.user.id },
    });
    if (!save) return reply.code(404).send({ error: 'Cloud save not found' });
    return publicSave(save);
  });

  app.put('/', {
    onRequest: app.authenticate,
    schema: { body: saveBodySchema },
  }, async (request, reply) => {
    const { version, data } = request.body;
    if (!Number.isInteger(data.version) || data.version < 1) {
      return reply.code(400).send({ error: 'Invalid save schema version' });
    }
    if (Object.prototype.hasOwnProperty.call(data, 'merit')) {
      return reply.code(400).send({ error: 'Protected save fields are not allowed' });
    }
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_SAVE_BYTES) {
      return reply.code(413).send({ error: 'Save data is too large' });
    }

    try {
      const saved = await app.prisma.$transaction(async (tx) => {
        const current = await tx.gameSave.findUnique({ where: { userId: request.user.id } });
        if (!current) {
          if (version !== 0) throw new SaveConflictError(null);
          return tx.gameSave.create({
            data: {
              userId: request.user.id,
              schemaVersion: data.version,
              version: 1,
              data,
            },
          });
        }
        if (current.version !== version) throw new SaveConflictError(current);

        const updated = await tx.gameSave.updateMany({
          where: { userId: request.user.id, version },
          data: {
            schemaVersion: data.version,
            data,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          const latest = await tx.gameSave.findUnique({ where: { userId: request.user.id } });
          throw new SaveConflictError(latest);
        }
        return tx.gameSave.findUnique({ where: { userId: request.user.id } });
      });
      return publicSave(saved);
    } catch (error) {
      if (error instanceof SaveConflictError) {
        return reply.code(409).send({
          error: 'Save conflict',
          current: error.current ? publicSave(error.current) : null,
        });
      }
      if (error && error.code === 'P2002') {
        const current = await app.prisma.gameSave.findUnique({
          where: { userId: request.user.id },
        });
        return reply.code(409).send({
          error: 'Save conflict',
          current: current ? publicSave(current) : null,
        });
      }
      throw error;
    }
  });
}

const saveBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'data'],
  properties: {
    version: { type: 'integer', minimum: 0 },
    data: { type: 'object', additionalProperties: true },
  },
};

function publicSave(save) {
  return { version: save.version, data: save.data };
}
