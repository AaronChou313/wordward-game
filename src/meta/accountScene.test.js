import { describe, expect, it } from 'vitest';
import { validateAccountCredentials } from './accountScene.js';

describe('account credential validation', () => {
  it('allows a one-character password', () => {
    expect(validateAccountCredentials('alice', 'x')).toEqual({
      username: 'alice',
      password: 'x',
      error: '',
    });
  });

  it('rejects empty and overlong passwords', () => {
    expect(validateAccountCredentials('alice', '').error).toBe('密码需为 1–128 个字符');
    expect(validateAccountCredentials('alice', 'x'.repeat(129)).error).toBe('密码需为 1–128 个字符');
  });
});

