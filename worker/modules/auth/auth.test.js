import { describe, expect, it } from 'vitest';
import { parseCredentials } from './schemas.js';

describe('Worker authentication schemas', () => {
  it('accepts credentials and preserves the Turnstile token', () => {
    expect(parseCredentials({ username: ' Alice ', password: 'correct horse', turnstileToken: 'ts' })).toEqual({
      username: ' Alice ', password: 'correct horse', turnstileToken: 'ts',
    });
  });

  it('rejects unknown or malformed fields', () => {
    expect(() => parseCredentials({ username: 'alice', password: 'correct horse', extra: true })).toThrow();
    expect(() => parseCredentials(null)).toThrow();
  });
});
