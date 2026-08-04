const allowed = new Set(['username', 'password', 'turnstileToken']);

export function parseCredentials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid credentials');
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error('Invalid credentials');
  if (typeof value.username !== 'string' || typeof value.password !== 'string') throw new Error('Invalid credentials');
  if (value.turnstileToken !== undefined && typeof value.turnstileToken !== 'string') throw new Error('Invalid credentials');
  return { username: value.username, password: value.password, turnstileToken: value.turnstileToken || '' };
}

export const registerSchema = { parse: parseCredentials };
export const loginSchema = { parse: parseCredentials };
