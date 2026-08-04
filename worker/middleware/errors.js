import { D1UnavailableError } from '../db/errors.js';
import { AuthError } from '../modules/auth/service.js';
import { MeritClaimError } from '../modules/merit/validation.js';
import { SecretConfigurationError } from '../security/hmac.js';

export function errorHandler(error, c) {
  if (error instanceof D1UnavailableError) return c.json({ error: 'Service unavailable', code: 'D1_UNAVAILABLE' }, 503);
  if (error instanceof SecretConfigurationError) return c.json({ error: 'Service unavailable', code: 'CONFIGURATION_ERROR' }, 503);
  if (error instanceof AuthError) return c.json({ error: error.message, code: error.code || 'AUTH_ERROR' }, error.status || 400);
  if (error instanceof MeritClaimError) return c.json({ error: error.message, code: error.code }, error.statusCode || 400);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
}

