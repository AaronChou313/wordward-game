import { describe, expect, it } from 'vitest';
import { authenticatedSceneName, initialSceneName } from './startup.js';

describe('initialSceneName', () => {
  it('opens the account gate before any gameplay scene', () => {
    expect(initialSceneName()).toBe('account');
  });

  it('enters the home scene after authentication succeeds', () => {
    expect(authenticatedSceneName()).toBe('home');
  });
});
