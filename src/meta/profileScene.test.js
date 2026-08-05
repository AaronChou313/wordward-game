import { describe, expect, it } from 'vitest';
import { ProfileScene } from './profileScene.js';

describe('ProfileScene fixed avatar', () => {
  it('does not expose an avatarUrl input field', () => {
    const scene = new ProfileScene({ switch: () => {} });
    expect(scene.profile).not.toHaveProperty('avatarUrl');
  });

  it('keeps only nickname and bio in initial profile state', () => {
    const scene = new ProfileScene({ switch: () => {} });
    expect(Object.keys(scene.profile).sort()).toEqual(['bio', 'nickname']);
  });
});
