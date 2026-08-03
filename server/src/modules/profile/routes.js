export async function profileRoutes(app) {
  app.get('/', { onRequest: app.authenticate }, async (request, reply) => {
    const profile = await app.prisma.profile.findUnique({
      where: { userId: request.user.id },
    });
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });
    return publicProfile(profile);
  });

  app.put('/', {
    onRequest: app.authenticate,
    schema: { body: profileBodySchema },
  }, async (request, reply) => {
    const data = normalizeProfile(request.body);
    if (!data) return reply.code(400).send({ error: 'Invalid profile' });
    const profile = await app.prisma.profile.update({
      where: { userId: request.user.id },
      data,
    });
    return publicProfile(profile);
  });
}

const profileBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nickname', 'avatarUrl', 'bio'],
  properties: {
    nickname: { type: 'string', minLength: 1, maxLength: 24 },
    avatarUrl: {
      anyOf: [
        { type: 'null' },
        { type: 'string', minLength: 9, maxLength: 2048, pattern: '^https://' },
      ],
    },
    bio: { type: 'string', maxLength: 200 },
  },
};

function normalizeProfile(body) {
  const nickname = body.nickname.trim();
  const bio = body.bio.trim();
  if (Array.from(nickname).length < 1 || Array.from(nickname).length > 24) return null;
  if (Array.from(bio).length > 200) return null;

  let avatarUrl = body.avatarUrl || null;
  if (avatarUrl) {
    try {
      const parsed = new URL(avatarUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
      avatarUrl = parsed.href;
    } catch {
      return null;
    }
  }
  return { nickname, avatarUrl, bio };
}

function publicProfile(profile) {
  return {
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
  };
}
