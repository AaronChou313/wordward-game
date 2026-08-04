FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/prisma ./prisma
COPY server/prisma.config.js ./prisma.config.js
RUN npm run prisma:generate

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server/package.json server/package-lock.json ./
COPY --chown=node:node server/prisma ./prisma
COPY --chown=node:node server/prisma.config.js ./prisma.config.js
COPY --chown=node:node server/src ./src

USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run prisma:migrate:deploy && npm start"]
