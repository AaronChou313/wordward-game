const SECRET_MIN_LENGTH = 32;

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function secret(env, name) {
  const value = required(env, name);
  if (value.length < SECRET_MIN_LENGTH) {
    throw new Error(`${name} must be at least ${SECRET_MIN_LENGTH} characters`);
  }
  return value;
}

function port(env) {
  const raw = env.PORT || '3000';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return value;
}

function appOrigin(env, nodeEnv) {
  const value = env.APP_ORIGIN;
  if (!value) {
    if (nodeEnv === 'production') throw new Error('APP_ORIGIN is required');
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('APP_ORIGIN must be an HTTPS origin');
  }
  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('APP_ORIGIN must be an HTTPS origin');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || value !== parsed.origin || parsed.username || parsed.password) {
    throw new Error('APP_ORIGIN must contain only scheme and host');
  }
  return parsed.origin;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  return Object.freeze({
    nodeEnv,
    host: env.HOST || '0.0.0.0',
    port: port(env),
    databaseUrl: required(env, 'DATABASE_URL'),
    jwtAccessSecret: secret(env, 'JWT_ACCESS_SECRET'),
    refreshTokenPepper: secret(env, 'REFRESH_TOKEN_PEPPER'),
    appOrigin: appOrigin(env, nodeEnv),
  });
}
